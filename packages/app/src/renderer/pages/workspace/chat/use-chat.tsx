import type { AssistantMessage, ToolCall, ToolResultMessage } from "@mariozechner/pi-ai";
import { useElectronIPC } from "@renderer/context/ElectronIPCProvider";
import { isAgentMessageEntry } from "@renderer/lib/is";
import { sessionStore, type MessageEntry, type SessionEntry } from "@renderer/store/sessions";
import { useCallback, useEffect, useMemo } from "react";
import { useStore } from "zustand";

import type { PromptSubmission } from "./prompt-types";

// ── Helpers ──────────────────────────────────────────────────────────────────

function extractToolResultText(content: ToolResultMessage["content"]): string {
  return content
    .filter(
      (block): block is Extract<ToolResultMessage["content"][number], { type: "text" }> =>
        block.type === "text",
    )
    .map((block) => block.text)
    .join("\n")
    .trim();
}

function formatArgs(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value ?? {}, null, 2);
  } catch {
    return String(value);
  }
}

function getSessionEntries(sessionId: string): SessionEntry[] {
  return sessionStore.getState().getSession(sessionId)?.entries ?? [];
}

function getToolState(sessionId: string, toolCallId: string) {
  return sessionStore.getState().getSession(sessionId)?.toolStates.get(toolCallId);
}

// ── Active session selector ──────────────────────────────────────────────────

function useActiveSessionState() {
  const activeSessionId = useStore(sessionStore, (s) => s.activeSessionId);
  const activeSession = useStore(sessionStore, (s) =>
    activeSessionId ? s.sessions.find((ss) => ss.id === activeSessionId) : undefined,
  );
  return { activeSessionId, activeSession };
}

// ── Public hook ──────────────────────────────────────────────────────────────

export function useChat() {
  const { invoke } = useElectronIPC();
  const { activeSession } = useActiveSessionState();
  const state = useStore(sessionStore);

  const noopPersist = useCallback(async () => {}, []);

  useSubscribeAgentEvents({ persistAssistantMessage: noopPersist });

  const messageEntries = useMemo<MessageEntry[]>(() => {
    return (activeSession?.entries ?? []).filter(isAgentMessageEntry);
  }, [activeSession?.entries]);

  const toolStates = activeSession?.toolStates ?? new Map();

  const submitPrompt = useCallback(
    async (submission: PromptSubmission) => {
      const sessionId = state.activeSessionId;
      if (!sessionId) {
        return;
      }

      sessionStore.getState().setLoading(sessionId, true);

      try {
        await invoke("prompt", sessionId, submission.text, {
          modelId: submission.model.modelId,
          providerId: submission.model.providerId,
        });
      } catch (error) {
        console.error("Failed to submit prompt", error);
        sessionStore.getState().setLoading(sessionId, false);
      }
    },
    [state.activeSessionId, invoke],
  );

  return {
    isLoading: activeSession?.isLoading ?? false,
    messageEntries,
    streamingEntryId: activeSession?.streamingEntryId,
    toolStates,
    submitPrompt,
  };
}

// ── Agent message event subscriptions ────────────────────────────────────────

function useSubscribeAgentEvents({
  persistAssistantMessage,
}: {
  persistAssistantMessage: (message: AssistantMessage) => Promise<void>;
}) {
  const { on } = useElectronIPC();

  useEffect(() => {
    // ── Per-session closure state for multi-turn merging ────────────────────
    // Content index where the current turn starts. Set on turn_start.
    // turnContentStartIndex === 0 → first turn, > 0 → subsequent turn (merge).
    const turnContentStartIndices: Record<string, number> = {};

    const getSession = (sessionId: string) => {
      return sessionStore.getState().getOrCreateSession(sessionId);
    };

    const unsubscribe = [
      on("agent_start", (event) => {
        const { sessionId } = event;
        getSession(sessionId);
        sessionStore.getState().setLoading(sessionId, true);
        sessionStore.getState().setSessionStatus(sessionId, "running");
      }),

      on("agent_end", (event) => {
        const { sessionId } = event;
        const { streamingEntryId } = getSession(sessionId);

        if (streamingEntryId) {
          const entries = getSessionEntries(sessionId);
          const entry = entries.find((item) => item.id === streamingEntryId);

          sessionStore.getState().setMessageCompletedAt(sessionId, streamingEntryId, Date.now());

          if (entry && isAgentMessageEntry(entry) && entry.data.role === "assistant") {
            void persistAssistantMessage(entry.data);
          }
        }
        sessionStore.getState().setLoading(sessionId, false);
        sessionStore.getState().setStreamingEntryId(sessionId, undefined);
        sessionStore.getState().setSessionStatus(sessionId, "completed");
        turnContentStartIndices[sessionId] = 0;
      }),

      on("turn_start", (event) => {
        const { sessionId } = event;
        const session = getSession(sessionId);
        const { streamingEntryId, entries } = session;
        if (streamingEntryId) {
          const entry = entries.find((e) => e.id === streamingEntryId);
          if (entry && isAgentMessageEntry(entry)) {
            turnContentStartIndices[sessionId] = (entry.data.content ?? []).length;
          }
        }
      }),

      on("message_start", (event) => {
        const { sessionId, message } = event;
        if (message.role === "toolResult") return;

        if (message.role === "user") {
          sessionStore.getState().appendMessageEntry(sessionId, message);
          return;
        }

        if (message.role === "assistant") {
          const turnStartIdx = turnContentStartIndices[sessionId] ?? 0;
          if (turnStartIdx === 0) {
            // First assistant turn — create a new entry
            const entryId = sessionStore.getState().appendMessageEntry(sessionId, message);
            sessionStore.getState().setStreamingEntryId(sessionId, entryId);
          }
          // Subsequent turn — streamingEntryId already set, no-op here
        }
      }),

      on("message_update", (event) => {
        const { sessionId, message } = event;
        if (message.role !== "assistant") return;

        const session = getSession(sessionId);
        const { streamingEntryId, entries } = session;
        if (!streamingEntryId) return;

        const entry = entries.find((e) => e.id === streamingEntryId);
        if (!entry) return;
        if (!isAgentMessageEntry(entry)) return;

        const turnStartIdx = turnContentStartIndices[sessionId] ?? 0;

        if (turnStartIdx === 0) {
          sessionStore.getState().updateMessageEntry(sessionId, streamingEntryId, message);
        } else {
          const existingContent = entry.data.content ?? [];
          sessionStore.getState().updateMessageEntry(sessionId, streamingEntryId, {
            ...message,
            content: [
              ...existingContent.slice(0, turnStartIdx),
              ...message.content,
            ] as AssistantMessage["content"],
          });
        }

        for (const block of message.content) {
          if (block.type === "toolCall") {
            const tc = block as ToolCall;
            const existing = getToolState(sessionId, tc.id);
            if (!existing) {
              sessionStore.getState().setToolState(sessionId, tc.id, {
                toolCallId: tc.id,
                toolName: tc.name,
                status: "running",
                args: tc.arguments,
                output: "",
              });
            }
          }
        }
      }),

      on("message_end", (event) => {
        const { sessionId, message } = event;
        if (message.role !== "assistant") return;

        const session = getSession(sessionId);
        const { streamingEntryId, entries } = session;
        if (!streamingEntryId) return;

        const entry = entries.find((e) => e.id === streamingEntryId);
        if (!entry) return;
        if (!isAgentMessageEntry(entry)) return;

        const turnStartIdx = turnContentStartIndices[sessionId] ?? 0;
        const assistantMsg = message as AssistantMessage;

        if (turnStartIdx === 0) {
          sessionStore.getState().updateMessageEntry(sessionId, streamingEntryId, assistantMsg);
        } else {
          const existingContent = entry.data.content ?? [];
          sessionStore.getState().updateMessageEntry(sessionId, streamingEntryId, {
            ...assistantMsg,
            content: [
              ...existingContent.slice(0, turnStartIdx),
              ...assistantMsg.content,
            ] as AssistantMessage["content"],
          });
        }
      }),

      on("tool_execution_start", (event) => {
        const { sessionId, toolCallId, toolName, args } = event;
        const existing = getToolState(sessionId, toolCallId);
        if (existing) return;

        sessionStore.getState().setToolState(sessionId, toolCallId, {
          toolCallId,
          toolName,
          status: "running",
          args,
          output: "",
        });
      }),

      on("tool_execution_update", (event) => {
        const { sessionId, toolCallId, toolName, args } = event;
        const existing = getToolState(sessionId, toolCallId);
        if (!existing) return;

        sessionStore.getState().setToolState(sessionId, toolCallId, {
          toolCallId,
          toolName,
          status: "running",
          args,
          output: existing.output ?? "",
        });
      }),

      on("tool_execution_end", (event) => {
        const { sessionId, toolCallId, toolName, result, isError } = event;
        const resultContent = result?.content;
        const output = Array.isArray(resultContent)
          ? extractToolResultText(resultContent)
          : formatArgs(result);

        const existing = getToolState(sessionId, toolCallId);
        sessionStore.getState().setToolState(sessionId, toolCallId, {
          toolCallId,
          toolName,
          status: isError ? "error" : "done",
          args: existing?.args ?? {},
          output,
        });
      }),
    ];

    return () => {
      for (const off of unsubscribe) {
        off();
      }
    };
  }, [on, persistAssistantMessage]);
}
