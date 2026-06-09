import type { AssistantMessage, ToolCall, ToolResultMessage } from "@mariozechner/pi-ai";
import { appendEntries } from "@renderer/apis/sessions";
import { useSubscribeAgentEvents } from "@renderer/hooks/use-subscribe-agent-events";
import {
  isAgentAssistantMessage,
  isAgentMessageEntry,
  isFailedAssistantMessage,
} from "@renderer/lib/is";
import { EntryStatus, type AgentSession, sessionStore } from "@renderer/store";
import { useRef } from "react";

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

function getToolState(sessionId: string, toolCallId: string) {
  return sessionStore.getState().getSession(sessionId)?.toolStates.get(toolCallId);
}

function getSideChatToolState(mainSessionId: string, sideChatId: string, toolCallId: string) {
  const state = sessionStore.getState().sideChatStates.get(mainSessionId);
  if (!state) return undefined;
  return state.sideChats.find((sc) => sc.id === sideChatId)?.toolStates.get(toolCallId);
}

function findMissingFailureMessage(
  session: AgentSession,
  messages: unknown[],
): AssistantMessage | undefined {
  return messages.filter(isFailedAssistantMessage).find((message) => {
    return !session.entries.some((entry) => {
      return (
        isAgentMessageEntry(entry) &&
        isAgentAssistantMessage(entry.data) &&
        entry.data.timestamp === message.timestamp &&
        entry.data.stopReason === message.stopReason
      );
    });
  });
}

// ── Side chat helpers ────────────────────────────────────────────────────────

type SessionScope =
  | { type: "main"; sessionId: string }
  | { type: "sidechat"; mainSessionId: string; sideChatId: string }
  | null;

function resolveScope(sessionId: string): SessionScope {
  const store = sessionStore.getState();
  if (store.isSideChatSession(sessionId)) {
    const mainSessionId = store.getMainSessionId(sessionId);
    if (!mainSessionId) return null;
    return { type: "sidechat", mainSessionId, sideChatId: sessionId };
  }
  const session = store.getSession(sessionId);
  if (!session) return null;
  return { type: "main", sessionId };
}

// ── Hook ────────────────────────────────────────────────────────────────────

/**
 * Subscribes to agent lifecycle + streaming events and syncs them to the session store.
 * Handles multi-turn conversation merging, tool execution state, streaming updates,
 * and entry persistence.
 *
 * Now also routes events to side chat sessions.
 */
export function useAgentMessages() {
  const turnContentStartIndicesRef = useRef<Record<string, number>>({});
  const hasPersistedRef = useRef<Record<string, boolean>>({});

  useSubscribeAgentEvents({
    agent_start: (event) => {
      const { sessionId } = event;
      const scope = resolveScope(sessionId);
      if (!scope) return;

      if (scope.type === "sidechat") {
        sessionStore.getState().setSideChatStatus(scope.mainSessionId, scope.sideChatId, "running");
        return;
      }

      hasPersistedRef.current[sessionId] = false;
    },

    agent_end: async (event) => {
      const { sessionId } = event;
      const scope = resolveScope(sessionId);
      if (!scope) return;

      // ── Side chat: no persistence, just update status ──
      if (scope.type === "sidechat") {
        const status = event.messages.some(isFailedAssistantMessage) ? "failed" : "completed";
        sessionStore.getState().setSideChatStatus(scope.mainSessionId, scope.sideChatId, status);
        sessionStore
          .getState()
          .setSideChatStreamingCompletedAt(scope.mainSessionId, scope.sideChatId);
        turnContentStartIndicesRef.current[sessionId] = 0;
        sessionStore
          .getState()
          .setSideChatStreamingEntryId(scope.mainSessionId, scope.sideChatId, undefined);
        return;
      }

      // ── Main session: existing logic ──
      let session = sessionStore.getState().getSession(sessionId);
      if (!session) return;

      const missingFailureMessage = findMissingFailureMessage(session, event.messages);
      if (missingFailureMessage) {
        const entryId = sessionStore
          .getState()
          .appendMessageEntry(sessionId, missingFailureMessage);
        sessionStore.getState().setStreamingEntryId(sessionId, entryId);
        sessionStore.getState().setStreamingEntryCompletedAt(sessionId, Date.now());
        session = sessionStore.getState().getSession(sessionId);
        if (!session) return;
      }

      if (!hasPersistedRef.current[sessionId]) {
        hasPersistedRef.current[sessionId] = true;

        const entriesToPersist = session.entries.filter(
          (entry) => entry.status !== EntryStatus.Synced,
        );

        if (entriesToPersist.length > 0) {
          const entryIds = entriesToPersist.map((entry) => entry.id);
          sessionStore.getState().setEntryStatus(sessionId, entryIds, EntryStatus.Syncing);
          try {
            await appendEntries({
              sessionId,
              entries: entriesToPersist.map((e) => ({
                id: e.id,
                parentId: e.parentId,
                type: e.type,
                data: e.data as unknown as Record<string, unknown>,
              })),
            });
            sessionStore.getState().setEntryStatus(sessionId, entryIds, EntryStatus.Synced);
          } catch (error) {
            console.error("Failed to persist entries:", error);
            sessionStore.getState().setEntryStatus(sessionId, entryIds, EntryStatus.Failed);
          }
        }
      }

      turnContentStartIndicesRef.current[sessionId] = 0;
      sessionStore.getState().setStreamingEntryCompletedAt(sessionId, Date.now());
      sessionStore.getState().setStreamingEntryId(sessionId, undefined);
    },

    turn_start: (event) => {
      const { sessionId } = event;
      const scope = resolveScope(sessionId);
      if (!scope) return;

      if (scope.type === "sidechat") {
        // Track turn start for multi-turn in side chat
        const streamingEntryId = sessionStore.getState().streamingEntryIds.get(sessionId);
        if (streamingEntryId) {
          const state = sessionStore.getState().sideChatStates.get(scope.mainSessionId);
          const sideChat = state?.sideChats.find((sc) => sc.id === scope.sideChatId);
          if (sideChat) {
            const entry = sideChat.entries.find((e) => e.id === streamingEntryId);
            if (entry && isAgentMessageEntry(entry) && entry.data.role === "assistant") {
              turnContentStartIndicesRef.current[sessionId] = (entry.data.content ?? []).length;
            }
          }
        }
        return;
      }

      // Main session
      const session = sessionStore.getState().getSession(sessionId);
      if (!session) return;

      const entries = session.entries;
      const streamingEntryId = sessionStore.getState().streamingEntryIds.get(sessionId);
      if (streamingEntryId) {
        const entry = entries.find((e) => e.id === streamingEntryId);
        if (entry && isAgentMessageEntry(entry) && entry.data.role === "assistant") {
          turnContentStartIndicesRef.current[sessionId] = (entry.data.content ?? []).length;
        }
      }
    },

    message_start: (event) => {
      const { sessionId, message } = event;
      if (message.role === "toolResult") return;

      const scope = resolveScope(sessionId);
      if (!scope) return;

      if (message.role === "user") return;

      if (message.role === "assistant") {
        const turnStartIdx = turnContentStartIndicesRef.current[sessionId] ?? 0;
        if (turnStartIdx === 0) {
          if (scope.type === "sidechat") {
            const entryId = sessionStore
              .getState()
              .appendSideChatEntry(scope.mainSessionId, scope.sideChatId, message);
            sessionStore
              .getState()
              .setSideChatStreamingEntryId(scope.mainSessionId, scope.sideChatId, entryId);
          } else {
            const entryId = sessionStore.getState().appendMessageEntry(sessionId, message);
            sessionStore.getState().setStreamingEntryId(sessionId, entryId);
          }
        }
      }
    },

    message_update: (event) => {
      const { sessionId, message } = event;
      if (message.role !== "assistant") return;

      const scope = resolveScope(sessionId);
      if (!scope) return;

      if (scope.type === "sidechat") {
        const state = sessionStore.getState().sideChatStates.get(scope.mainSessionId);
        if (!state) return;
        const sideChat = state.sideChats.find((sc) => sc.id === scope.sideChatId);
        if (!sideChat) return;

        const streamingEntryId = sessionStore.getState().streamingEntryIds.get(sessionId);
        if (!streamingEntryId) return;

        const entry = sideChat.entries.find((e) => e.id === streamingEntryId);
        if (!entry || !isAgentMessageEntry(entry) || entry.data.role !== "assistant") return;

        const turnStartIdx = turnContentStartIndicesRef.current[sessionId] ?? 0;

        if (turnStartIdx === 0) {
          sessionStore
            .getState()
            .updateSideChatEntry(scope.mainSessionId, scope.sideChatId, streamingEntryId, message);
        } else {
          const existingContent = entry.data.content ?? [];
          sessionStore
            .getState()
            .updateSideChatEntry(scope.mainSessionId, scope.sideChatId, streamingEntryId, {
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
            const existing = getSideChatToolState(scope.mainSessionId, scope.sideChatId, tc.id);
            if (!existing) {
              sessionStore
                .getState()
                .setSideChatToolState(scope.mainSessionId, scope.sideChatId, tc.id, {
                  toolCallId: tc.id,
                  toolName: tc.name,
                  status: "running",
                  args: tc.arguments,
                  output: "",
                });
            }
          }
        }
        return;
      }

      // Main session
      const session = sessionStore.getState().getSession(sessionId);
      if (!session) return;

      const entries = session.entries;
      const streamingEntryId = sessionStore.getState().streamingEntryIds.get(sessionId);
      if (!streamingEntryId) return;

      const entry = entries.find((e) => e.id === streamingEntryId);
      if (!entry) return;
      if (!isAgentMessageEntry(entry)) return;
      if (entry.data.role !== "assistant") return;

      const turnStartIdx = turnContentStartIndicesRef.current[sessionId] ?? 0;

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
    },

    message_end: (event) => {
      const { sessionId, message } = event;
      if (message.role !== "assistant") return;

      const scope = resolveScope(sessionId);
      if (!scope) return;

      if (scope.type === "sidechat") {
        const state = sessionStore.getState().sideChatStates.get(scope.mainSessionId);
        if (!state) return;
        const sideChat = state.sideChats.find((sc) => sc.id === scope.sideChatId);
        if (!sideChat) return;

        const streamingEntryId = sessionStore.getState().streamingEntryIds.get(sessionId);
        if (!streamingEntryId) return;

        const entry = sideChat.entries.find((e) => e.id === streamingEntryId);
        if (!entry || !isAgentMessageEntry(entry) || entry.data.role !== "assistant") return;

        const turnStartIdx = turnContentStartIndicesRef.current[sessionId] ?? 0;
        const assistantMsg = message as AssistantMessage;

        if (turnStartIdx === 0) {
          sessionStore
            .getState()
            .updateSideChatEntry(
              scope.mainSessionId,
              scope.sideChatId,
              streamingEntryId,
              assistantMsg,
            );
        } else {
          const existingContent = entry.data.content ?? [];
          sessionStore
            .getState()
            .updateSideChatEntry(scope.mainSessionId, scope.sideChatId, streamingEntryId, {
              ...assistantMsg,
              content: [
                ...existingContent.slice(0, turnStartIdx),
                ...assistantMsg.content,
              ] as AssistantMessage["content"],
            });
        }
        return;
      }

      // Main session
      const session = sessionStore.getState().getSession(sessionId);
      if (!session) return;

      const entries = session.entries;
      const streamingEntryId = sessionStore.getState().streamingEntryIds.get(sessionId);
      if (!streamingEntryId) return;

      const entry = entries.find((e) => e.id === streamingEntryId);
      if (!entry) return;
      if (!isAgentMessageEntry(entry)) return;
      if (entry.data.role !== "assistant") return;

      const turnStartIdx = turnContentStartIndicesRef.current[sessionId] ?? 0;
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
    },

    tool_execution_start: (event) => {
      const { sessionId, toolCallId, toolName, args } = event;
      const scope = resolveScope(sessionId);
      if (!scope) return;

      if (scope.type === "sidechat") {
        const existing = getSideChatToolState(scope.mainSessionId, scope.sideChatId, toolCallId);
        if (existing) return;
        sessionStore
          .getState()
          .setSideChatToolState(scope.mainSessionId, scope.sideChatId, toolCallId, {
            toolCallId,
            toolName,
            status: "running",
            args,
            output: "",
          });
        return;
      }

      const existing = getToolState(sessionId, toolCallId);
      if (existing) return;
      sessionStore.getState().setToolState(sessionId, toolCallId, {
        toolCallId,
        toolName,
        status: "running",
        args,
        output: "",
      });
    },

    tool_execution_update: (event) => {
      const { sessionId, toolCallId, toolName, args } = event;
      const scope = resolveScope(sessionId);
      if (!scope) return;

      if (scope.type === "sidechat") {
        const existing = getSideChatToolState(scope.mainSessionId, scope.sideChatId, toolCallId);
        if (!existing) return;
        sessionStore
          .getState()
          .setSideChatToolState(scope.mainSessionId, scope.sideChatId, toolCallId, {
            toolCallId,
            toolName,
            status: "running",
            args,
            output: existing.output ?? "",
            requestId: existing.requestId,
            approvalStatus: existing.approvalStatus,
          });
        return;
      }

      const existing = getToolState(sessionId, toolCallId);
      if (!existing) return;
      sessionStore.getState().setToolState(sessionId, toolCallId, {
        toolCallId,
        toolName,
        status: "running",
        args,
        output: existing.output ?? "",
        requestId: existing.requestId,
        approvalStatus: existing.approvalStatus,
      });
    },

    tool_execution_end: (event) => {
      const { sessionId, toolCallId, toolName, result, isError } = event;
      const resultContent = result?.content;
      const output = Array.isArray(resultContent)
        ? extractToolResultText(resultContent)
        : formatArgs(result);

      const scope = resolveScope(sessionId);
      if (!scope) return;

      if (scope.type === "sidechat") {
        const existing = getSideChatToolState(scope.mainSessionId, scope.sideChatId, toolCallId);
        sessionStore
          .getState()
          .setSideChatToolState(scope.mainSessionId, scope.sideChatId, toolCallId, {
            toolCallId,
            toolName,
            status: isError ? "error" : "done",
            args: existing?.args ?? {},
            output,
            requestId: existing?.requestId,
            approvalStatus: existing?.approvalStatus,
          });
        return;
      }

      const existing = getToolState(sessionId, toolCallId);
      sessionStore.getState().setToolState(sessionId, toolCallId, {
        toolCallId,
        toolName,
        status: isError ? "error" : "done",
        args: existing?.args ?? {},
        output,
        requestId: existing?.requestId,
        approvalStatus: existing?.approvalStatus,
      });
    },

    permission_requested: (event) => {
      const { sessionId, type: _type, ...request } = event;
      const scope = resolveScope(sessionId);
      if (!scope) return;

      if (scope.type === "sidechat") {
        const existing = getSideChatToolState(
          scope.mainSessionId,
          scope.sideChatId,
          request.toolCallId,
        );
        sessionStore
          .getState()
          .setSideChatToolState(scope.mainSessionId, scope.sideChatId, request.toolCallId, {
            toolCallId: request.toolCallId,
            toolName: request.toolName,
            status: "awaiting_approval",
            args: existing?.args ?? request.args,
            output: existing?.output ?? "Waiting for permission approval…",
            requestId: request.requestId,
            approvalStatus: "pending",
          });
        return;
      }

      const existing = getToolState(sessionId, request.toolCallId);
      sessionStore.getState().enqueuePermissionRequest(sessionId, request);
      sessionStore.getState().setToolState(sessionId, request.toolCallId, {
        toolCallId: request.toolCallId,
        toolName: request.toolName,
        status: "awaiting_approval",
        args: existing?.args ?? request.args,
        output: existing?.output ?? "Waiting for permission approval…",
        requestId: request.requestId,
        approvalStatus: "pending",
      });
    },
  });
}
