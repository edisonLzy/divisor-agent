import type { AgentMessage } from "@mariozechner/pi-agent-core";
import { useElectronIPC } from "@renderer/context/ElectronIPCProvider";
import { trpcClient } from "@renderer/lib/trpc";
import { sessionStore, type SessionEntry, type ToolExecutionState } from "@renderer/store/session";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type SessionListItem = Awaited<ReturnType<typeof trpcClient.sessions.list.query>>[number];
type SessionEntryItem = Awaited<ReturnType<typeof trpcClient.sessions.getEntries.query>>[number];
type SessionContextMessage = Awaited<
  ReturnType<typeof trpcClient.sessions.buildContext.query>
>["messages"][number];

interface WorkspaceSessionContextValue {
  activeSessionId: string | null;
  activeSessionName: string;
  createSession: () => Promise<void>;
  isBootstrapping: boolean;
  isSwitching: boolean;
  persistAssistantMessage: (message: AgentMessage) => Promise<void>;
  persistUserMessage: (content: string) => Promise<void>;
  selectSession: (sessionId: string) => Promise<void>;
  sessions: SessionListItem[];
}

const WorkspaceSessionContext = createContext<WorkspaceSessionContextValue | null>(null);

function toTimestamp(value: Date | string | number): number {
  if (value instanceof Date) {
    return value.getTime();
  }

  if (typeof value === "number") {
    return value;
  }

  return new Date(value).getTime();
}

function toHistoryMessage(message: SessionContextMessage): AgentMessage {
  const role =
    message.role === "assistant" || message.role === "user" || message.role === "toolResult"
      ? message.role
      : message.role === "tool"
        ? "toolResult"
        : "user";

  return {
    role,
    content: message.content as AgentMessage["content"],
  } as AgentMessage;
}

function collectHydratedToolStates(
  message: AgentMessage,
  toolStates: Map<string, ToolExecutionState>,
) {
  if (message.role !== "assistant" || !Array.isArray(message.content)) {
    return;
  }

  for (const block of message.content) {
    if (
      typeof block === "object" &&
      block !== null &&
      "type" in block &&
      block.type === "toolCall" &&
      "id" in block &&
      "name" in block
    ) {
      toolStates.set(String(block.id), {
        toolCallId: String(block.id),
        toolName: String(block.name),
        status: "done",
        args: "arguments" in block ? block.arguments : {},
        output: "",
      });
    }
  }
}

function hydrateRendererSession(sessionId: string, entries: SessionEntryItem[]) {
  const hydratedEntries: SessionEntry[] = [];
  const toolStates = new Map<string, ToolExecutionState>();

  for (const entry of entries) {
    if (entry.type === "message") {
      const data = entry.data as unknown as AgentMessage;

      collectHydratedToolStates(data, toolStates);

      hydratedEntries.push({
        id: entry.id,
        parentId: entry.parentId,
        type: "message",
        timestamp: toTimestamp(entry.timestamp),
        completedAt: toTimestamp(entry.timestamp),
        data,
      });
      continue;
    }

    hydratedEntries.push({
      id: entry.id,
      parentId: entry.parentId,
      type: "model_change",
      timestamp: toTimestamp(entry.timestamp),
      data: entry.data as {
        provider: string;
        modelId: string;
      },
    });
  }

  sessionStore.getState().hydrate(sessionId, {
    entries: hydratedEntries,
    cwd: "",
    model: null,
    toolStates,
  });
}

export function WorkspaceSessionProvider({ children }: { children: React.ReactNode }) {
  const { invoke } = useElectronIPC();
  const [sessions, setSessions] = useState<SessionListItem[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [isSwitching, setIsSwitching] = useState(false);
  const loadRequestIdRef = useRef(0);
  const activeSessionIdRef = useRef<string | null>(null);
  const persistedLeafIdRef = useRef<string | null>(null);

  const refreshSessions = useCallback(async () => {
    const nextSessions = await trpcClient.sessions.list.query();
    setSessions(nextSessions);
    return nextSessions;
  }, []);

  const selectSession = useCallback(
    async (sessionId: string) => {
      const requestId = ++loadRequestIdRef.current;
      setIsSwitching(true);

      try {
        // Check if we already have this session's state loaded
        const existingState = sessionStore.getState().getSession(sessionId);
        if (!existingState || existingState.entries.length === 0) {
          const [entries, context] = await Promise.all([
            trpcClient.sessions.getEntries.query({ sessionId }),
            trpcClient.sessions.buildContext.query({ sessionId }),
          ]);

          if (loadRequestIdRef.current !== requestId) {
            return;
          }

          hydrateRendererSession(sessionId, entries);
          persistedLeafIdRef.current = entries.at(-1)?.id ?? null;

          // Fire-and-forget: prepare the agent in main process, don't block UI
          invoke("setSessionId", sessionId).catch(() => {});
          invoke(
            "setHistoryMessages",
            sessionId,
            context.messages.map((message) => toHistoryMessage(message)),
          ).catch(() => {});
        }

        sessionStore.getState().selectSession(sessionId);
        activeSessionIdRef.current = sessionId;
        setActiveSessionId(sessionId);
      } finally {
        if (loadRequestIdRef.current === requestId) {
          setIsSwitching(false);
        }
      }
    },
    [invoke],
  );

  const createSession = useCallback(async () => {
    const created = await trpcClient.sessions.create.mutate({});
    await refreshSessions();
    await selectSession(created.id);
  }, [refreshSessions, selectSession]);

  const appendServerMessage = useCallback(
    async (message: AgentMessage) => {
      const sessionId = activeSessionIdRef.current;
      if (!sessionId) {
        return;
      }

      const entry = await trpcClient.sessions.appendEntry.mutate({
        sessionId,
        parentId: persistedLeafIdRef.current,
        type: "message",
        data: {
          role: message.role,
          content: message.content,
        },
      });

      persistedLeafIdRef.current = entry.id;
      await refreshSessions();
    },
    [refreshSessions],
  );

  const persistUserMessage = useCallback(
    async (content: string) => {
      await appendServerMessage({
        role: "user",
        content,
      } as AgentMessage);
    },
    [appendServerMessage],
  );

  const persistAssistantMessage = useCallback(
    async (message: AgentMessage) => {
      if (message.role !== "assistant") {
        return;
      }

      await appendServerMessage(message);
    },
    [appendServerMessage],
  );

  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      try {
        const initialSessions = await refreshSessions();
        if (cancelled) {
          return;
        }

        if (initialSessions.length === 0) {
          const created = await trpcClient.sessions.create.mutate({});
          if (cancelled) {
            return;
          }

          await refreshSessions();
          if (!cancelled) {
            await selectSession(created.id);
          }
          return;
        }

        await selectSession(initialSessions[0].id);
      } catch (error) {
        console.error("Failed to bootstrap sessions", error);
      } finally {
        if (!cancelled) {
          setIsBootstrapping(false);
        }
      }
    };

    void bootstrap();

    return () => {
      cancelled = true;
      loadRequestIdRef.current += 1;
    };
  }, [refreshSessions, selectSession]);

  const activeSessionName = useMemo(() => {
    const activeSession = sessions.find((session) => session.id === activeSessionId);
    return activeSession?.name.trim() ? activeSession.name : "New Session";
  }, [activeSessionId, sessions]);

  const value = useMemo<WorkspaceSessionContextValue>(() => {
    return {
      activeSessionId,
      activeSessionName,
      createSession,
      isBootstrapping,
      isSwitching,
      persistAssistantMessage,
      persistUserMessage,
      selectSession,
      sessions,
    };
  }, [
    activeSessionId,
    activeSessionName,
    createSession,
    isBootstrapping,
    isSwitching,
    persistAssistantMessage,
    persistUserMessage,
    selectSession,
    sessions,
  ]);

  return (
    <WorkspaceSessionContext.Provider value={value}>{children}</WorkspaceSessionContext.Provider>
  );
}

export function useWorkspaceSession() {
  const context = useContext(WorkspaceSessionContext);

  if (!context) {
    throw new Error("useWorkspaceSession must be used within a WorkspaceSessionProvider");
  }

  return context;
}
