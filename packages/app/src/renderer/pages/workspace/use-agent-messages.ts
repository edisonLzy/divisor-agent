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

// ── Hook ────────────────────────────────────────────────────────────────────

/**
 * Subscribes to agent lifecycle + streaming events and syncs them to the session store.
 * Handles multi-turn conversation merging, tool execution state, streaming updates,
 * and entry persistence.
 *
 * Lives at WorkspacePage level so events from all sessions (not just the active one)
 * are captured.
 */
export function useAgentMessages() {
  const turnContentStartIndicesRef = useRef<Record<string, number>>({});
  const hasPersistedRef = useRef<Record<string, boolean>>({});

  useSubscribeAgentEvents({
    agent_start: (event) => {
      const { sessionId } = event;
      hasPersistedRef.current[sessionId] = false;
    },

    agent_end: async (event) => {
      const { sessionId } = event;
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

      // ── Persist new entries to server ──
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

      if (message.role === "user") {
        return;
      }

      if (message.role === "assistant") {
        const turnStartIdx = turnContentStartIndicesRef.current[sessionId] ?? 0;
        if (turnStartIdx === 0) {
          // First assistant turn — create a new entry
          const entryId = sessionStore.getState().appendMessageEntry(sessionId, message);
          sessionStore.getState().setStreamingEntryId(sessionId, entryId);
        }
        // Subsequent turn — streamingEntryId already set, no-op here
      }
    },

    message_update: (event) => {
      const { sessionId, message } = event;
      if (message.role !== "assistant") return;

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
