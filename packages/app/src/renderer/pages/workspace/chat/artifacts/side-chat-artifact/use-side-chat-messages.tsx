import type { AssistantMessage, ToolCall, ToolResultMessage } from "@mariozechner/pi-ai";
import { useSubscribeAgentEvents } from "@renderer/hooks/use-subscribe-agent-events";
import { isAgentMessageEntry, isFailedAssistantMessage } from "@renderer/lib/is";
import { sideChatStore } from "@renderer/store/side-chat";
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

function resolveSideChat(sessionId: string) {
  return sideChatStore.getState().getSideChatMeta(sessionId);
}

function getSideChatToolState(sessionId: string, toolCallId: string) {
  return sideChatStore.getState().getEntryState(sessionId).toolStates.get(toolCallId);
}

export function useSideChatMessages() {
  const turnContentStartIndicesRef = useRef<Record<string, number>>({});

  useSubscribeAgentEvents(
    {
      agent_start: (event) => {
        sideChatStore.getState().setStatus(event.sessionId, "running");
      },

      agent_end: (event) => {
        const status = event.messages.some(isFailedAssistantMessage) ? "failed" : "completed";
        sideChatStore.getState().setStatus(event.sessionId, status);
        sideChatStore.getState().setStreamingEntryCompletedAt(event.sessionId, Date.now());
        turnContentStartIndicesRef.current[event.sessionId] = 0;
        sideChatStore.getState().setStreamingEntryId(event.sessionId, undefined);
      },

      turn_start: (event) => {
        const streamingEntryId = sideChatStore.getState().streamingEntryIds.get(event.sessionId);
        if (!streamingEntryId) return;

        const entryState = sideChatStore.getState().getEntryState(event.sessionId);
        const entry = entryState.entries.find((item) => item.id === streamingEntryId);
        if (entry && isAgentMessageEntry(entry) && entry.data.role === "assistant") {
          turnContentStartIndicesRef.current[event.sessionId] = (entry.data.content ?? []).length;
        }
      },

      message_start: (event) => {
        const { sessionId, message } = event;
        if (message.role !== "assistant") return;

        const turnStartIdx = turnContentStartIndicesRef.current[sessionId] ?? 0;
        if (turnStartIdx !== 0) return;

        const entryId = sideChatStore.getState().appendMessageEntry(sessionId, message);
        sideChatStore.getState().setStreamingEntryId(sessionId, entryId);
      },

      message_update: (event) => {
        const { sessionId, message } = event;
        if (message.role !== "assistant") return;

        const streamingEntryId = sideChatStore.getState().streamingEntryIds.get(sessionId);
        if (!streamingEntryId) return;

        const entryState = sideChatStore.getState().getEntryState(sessionId);
        const entry = entryState.entries.find((item) => item.id === streamingEntryId);
        if (!entry || !isAgentMessageEntry(entry) || entry.data.role !== "assistant") return;

        const turnStartIdx = turnContentStartIndicesRef.current[sessionId] ?? 0;
        if (turnStartIdx === 0) {
          sideChatStore.getState().updateMessageEntry(sessionId, streamingEntryId, message);
        } else {
          const existingContent = entry.data.content ?? [];
          sideChatStore.getState().updateMessageEntry(sessionId, streamingEntryId, {
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
            const existing = getSideChatToolState(sessionId, toolCall.id);
            if (!existing) {
              sideChatStore.getState().setToolState(sessionId, toolCall.id, {
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

        const streamingEntryId = sideChatStore.getState().streamingEntryIds.get(sessionId);
        if (!streamingEntryId) return;

        const entryState = sideChatStore.getState().getEntryState(sessionId);
        const entry = entryState.entries.find((item) => item.id === streamingEntryId);
        if (!entry || !isAgentMessageEntry(entry) || entry.data.role !== "assistant") return;

        const turnStartIdx = turnContentStartIndicesRef.current[sessionId] ?? 0;
        const assistantMsg = message as AssistantMessage;
        if (turnStartIdx === 0) {
          sideChatStore.getState().updateMessageEntry(sessionId, streamingEntryId, assistantMsg);
        } else {
          const existingContent = entry.data.content ?? [];
          sideChatStore.getState().updateMessageEntry(sessionId, streamingEntryId, {
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

        const existing = getSideChatToolState(sessionId, toolCallId);
        if (existing) return;
        sideChatStore.getState().setToolState(sessionId, toolCallId, {
          toolCallId,
          toolName,
          status: "running",
          args,
          output: "",
        });
      },

      tool_execution_update: (event) => {
        const { sessionId, toolCallId, toolName, args } = event;

        const existing = getSideChatToolState(sessionId, toolCallId);
        if (!existing) return;
        sideChatStore.getState().setToolState(sessionId, toolCallId, {
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
        const existing = getSideChatToolState(sessionId, toolCallId);
        sideChatStore.getState().setToolState(sessionId, toolCallId, {
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

        const existing = getSideChatToolState(sessionId, request.toolCallId);
        sideChatStore.getState().setToolState(sessionId, request.toolCallId, {
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
        return Boolean(resolveSideChat(event.sessionId));
      },
    },
  );
}
