import type { AssistantMessage, ToolCall, ToolResultMessage } from "@mariozechner/pi-ai";
import { appendEntries } from "@renderer/apis/sessions";
import { useSubscribeAgentEvents } from "@renderer/hooks/use-subscribe-agent-events";
import {
  isAgentAssistantMessage,
  isAgentMessageEntry,
  isFailedAssistantMessage,
} from "@renderer/lib/is";
import { EntryStatus, type SessionEntry } from "@renderer/store/entries-slice";
import { mainStore } from "@renderer/store/main";
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
  return mainStore.getState().getEntryState(sessionId).toolStates.get(toolCallId);
}

function findMissingFailureMessage(
  entries: SessionEntry[],
  messages: unknown[],
): AssistantMessage | undefined {
  return messages.filter(isFailedAssistantMessage).find((message) => {
    return !entries.some((entry) => {
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

  useSubscribeAgentEvents(
    {
      agent_start: (event) => {
        const { sessionId } = event;

        hasPersistedRef.current[sessionId] = false;
        mainStore.getState().setStatus(sessionId, "running");
      },

      agent_end: async (event) => {
        const { sessionId } = event;

        const entries = mainStore.getState().getEntryState(sessionId).entries;
        const missingFailureMessage = findMissingFailureMessage(entries, event.messages);
        if (missingFailureMessage) {
          const entryId = mainStore.getState().appendMessageEntry(sessionId, missingFailureMessage);
          mainStore.getState().setStreamingEntryId(sessionId, entryId);
          mainStore.getState().setStreamingEntryCompletedAt(sessionId, Date.now());
          if (!mainStore.getState().getSession(sessionId)) return;
        }

        const status = event.messages.some(isFailedAssistantMessage) ? "failed" : "completed";
        mainStore.getState().setStatus(sessionId, status);

        if (!hasPersistedRef.current[sessionId]) {
          hasPersistedRef.current[sessionId] = true;

          const currentEntries = mainStore.getState().getEntryState(sessionId).entries;
          const entriesToPersist = currentEntries.filter(
            (entry) => entry.status !== EntryStatus.Synced,
          );

          if (entriesToPersist.length > 0) {
            const entryIds = entriesToPersist.map((entry) => entry.id);
            mainStore.getState().setEntryStatus(sessionId, entryIds, EntryStatus.Syncing);
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
              mainStore.getState().setEntryStatus(sessionId, entryIds, EntryStatus.Synced);
            } catch (error) {
              console.error("Failed to persist entries:", error);
              mainStore.getState().setEntryStatus(sessionId, entryIds, EntryStatus.Failed);
            }
          }
        }

        turnContentStartIndicesRef.current[sessionId] = 0;
        mainStore.getState().setStreamingEntryCompletedAt(sessionId, Date.now());
        mainStore.getState().setStreamingEntryId(sessionId, undefined);
      },

      turn_start: (event) => {
        const { sessionId } = event;

        const streamingEntryId = mainStore.getState().streamingEntryIds.get(sessionId);
        if (!streamingEntryId) return;

        const entries = mainStore.getState().getEntryState(sessionId).entries;
        const entry = entries.find((item) => item.id === streamingEntryId);
        if (entry && isAgentMessageEntry(entry) && entry.data.role === "assistant") {
          turnContentStartIndicesRef.current[sessionId] = (entry.data.content ?? []).length;
        }
      },

      message_start: (event) => {
        const { sessionId, message } = event;
        if (message.role !== "assistant") return;

        const turnStartIdx = turnContentStartIndicesRef.current[sessionId] ?? 0;
        if (turnStartIdx !== 0) return;

        const entryId = mainStore.getState().appendMessageEntry(sessionId, message);
        mainStore.getState().setStreamingEntryId(sessionId, entryId);
      },

      message_update: (event) => {
        const { sessionId, message } = event;
        if (message.role !== "assistant") return;

        const streamingEntryId = mainStore.getState().streamingEntryIds.get(sessionId);
        if (!streamingEntryId) return;

        const entries = mainStore.getState().getEntryState(sessionId).entries;
        const entry = entries.find((item) => item.id === streamingEntryId);
        if (!entry || !isAgentMessageEntry(entry) || entry.data.role !== "assistant") return;

        const turnStartIdx = turnContentStartIndicesRef.current[sessionId] ?? 0;
        if (turnStartIdx === 0) {
          mainStore.getState().updateMessageEntry(sessionId, streamingEntryId, message);
        } else {
          const existingContent = entry.data.content ?? [];
          mainStore.getState().updateMessageEntry(sessionId, streamingEntryId, {
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
              mainStore.getState().setToolState(sessionId, toolCall.id, {
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
        if (message.role !== "assistant") return;

        const streamingEntryId = mainStore.getState().streamingEntryIds.get(sessionId);
        if (!streamingEntryId) return;

        const entries = mainStore.getState().getEntryState(sessionId).entries;
        const entry = entries.find((item) => item.id === streamingEntryId);
        if (!entry || !isAgentMessageEntry(entry) || entry.data.role !== "assistant") return;

        const turnStartIdx = turnContentStartIndicesRef.current[sessionId] ?? 0;
        const assistantMsg = message as AssistantMessage;
        if (turnStartIdx === 0) {
          mainStore.getState().updateMessageEntry(sessionId, streamingEntryId, assistantMsg);
        } else {
          const existingContent = entry.data.content ?? [];
          mainStore.getState().updateMessageEntry(sessionId, streamingEntryId, {
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
        mainStore.getState().setToolState(sessionId, toolCallId, {
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
        mainStore.getState().setToolState(sessionId, toolCallId, {
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
        mainStore.getState().setToolState(sessionId, toolCallId, {
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
        mainStore.getState().enqueuePermissionRequest(sessionId, request);
        mainStore.getState().setToolState(sessionId, request.toolCallId, {
          toolCallId: request.toolCallId,
          toolName: request.toolName,
          status: "awaiting_approval",
          args: existing?.args ?? request.args,
          output: existing?.output ?? "Waiting for permission approval...",
          requestId: request.requestId,
          approvalStatus: "pending",
        });
      },
    },
    {
      shouldHandleEvent: (event) => {
        return Boolean(mainStore.getState().getSession(event.sessionId));
      },
    },
  );
}
