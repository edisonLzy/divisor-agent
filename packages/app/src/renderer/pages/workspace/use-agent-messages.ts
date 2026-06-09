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

export function useAgentMessages() {
  const turnContentStartIndicesRef = useRef<Record<string, number>>({});
  const hasPersistedRef = useRef<Record<string, boolean>>({});

  useSubscribeAgentEvents({
    agent_start: (event) => {
      const { sessionId } = event;
      if (sessionStore.getState().isSideChatArtifactSession(sessionId)) return;

      const session = sessionStore.getState().getSession(sessionId);
      if (!session) return;
      hasPersistedRef.current[sessionId] = false;
    },

    agent_end: async (event) => {
      const { sessionId } = event;
      if (sessionStore.getState().isSideChatArtifactSession(sessionId)) return;

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
              entries: entriesToPersist.map((entry) => ({
                id: entry.id,
                parentId: entry.parentId,
                type: entry.type,
                data: entry.data as unknown as Record<string, unknown>,
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
      if (sessionStore.getState().isSideChatArtifactSession(sessionId)) return;

      const session = sessionStore.getState().getSession(sessionId);
      if (!session) return;

      const streamingEntryId = sessionStore.getState().streamingEntryIds.get(sessionId);
      if (!streamingEntryId) return;

      const entry = session.entries.find((item) => item.id === streamingEntryId);
      if (entry && isAgentMessageEntry(entry) && entry.data.role === "assistant") {
        turnContentStartIndicesRef.current[sessionId] = (entry.data.content ?? []).length;
      }
    },

    message_start: (event) => {
      const { sessionId, message } = event;
      if (sessionStore.getState().isSideChatArtifactSession(sessionId)) return;
      if (message.role !== "assistant") return;

      const session = sessionStore.getState().getSession(sessionId);
      if (!session) return;

      const turnStartIdx = turnContentStartIndicesRef.current[sessionId] ?? 0;
      if (turnStartIdx !== 0) return;

      const entryId = sessionStore.getState().appendMessageEntry(sessionId, message);
      sessionStore.getState().setStreamingEntryId(sessionId, entryId);
    },

    message_update: (event) => {
      const { sessionId, message } = event;
      if (sessionStore.getState().isSideChatArtifactSession(sessionId)) return;
      if (message.role !== "assistant") return;

      const session = sessionStore.getState().getSession(sessionId);
      if (!session) return;

      const streamingEntryId = sessionStore.getState().streamingEntryIds.get(sessionId);
      if (!streamingEntryId) return;

      const entry = session.entries.find((item) => item.id === streamingEntryId);
      if (!entry || !isAgentMessageEntry(entry) || entry.data.role !== "assistant") return;

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
          const toolCall = block as ToolCall;
          const existing = getToolState(sessionId, toolCall.id);
          if (!existing) {
            sessionStore.getState().setToolState(sessionId, toolCall.id, {
              toolCallId: toolCall.id,
              toolName: toolCall.name,
              status: "running",
              args: toolCall.arguments,
              output: "",
            });
          }
        }
      }
    },

    message_end: (event) => {
      const { sessionId, message } = event;
      if (sessionStore.getState().isSideChatArtifactSession(sessionId)) return;
      if (message.role !== "assistant") return;

      const session = sessionStore.getState().getSession(sessionId);
      if (!session) return;

      const streamingEntryId = sessionStore.getState().streamingEntryIds.get(sessionId);
      if (!streamingEntryId) return;

      const entry = session.entries.find((item) => item.id === streamingEntryId);
      if (!entry || !isAgentMessageEntry(entry) || entry.data.role !== "assistant") return;

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
      if (sessionStore.getState().isSideChatArtifactSession(sessionId)) return;

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
      if (sessionStore.getState().isSideChatArtifactSession(sessionId)) return;

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
      if (sessionStore.getState().isSideChatArtifactSession(sessionId)) return;

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
      if (sessionStore.getState().isSideChatArtifactSession(sessionId)) return;

      const existing = getToolState(sessionId, request.toolCallId);
      sessionStore.getState().enqueuePermissionRequest(sessionId, request);
      sessionStore.getState().setToolState(sessionId, request.toolCallId, {
        toolCallId: request.toolCallId,
        toolName: request.toolName,
        status: "awaiting_approval",
        args: existing?.args ?? request.args,
        output: existing?.output ?? "Waiting for permission approval...",
        requestId: request.requestId,
        approvalStatus: "pending",
      });
    },
  });
}
