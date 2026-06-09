import type { AssistantMessage, ToolCall, ToolResultMessage } from "@mariozechner/pi-ai";
import { useSubscribeAgentEvents } from "@renderer/hooks/use-subscribe-agent-events";
import { isAgentMessageEntry, isFailedAssistantMessage } from "@renderer/lib/is";
import { sessionStore } from "@renderer/store";
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
  return sessionStore.getState().getSideChatArtifact(sessionId);
}

function getSideChatToolState(sideChatId: string, toolCallId: string) {
  return resolveSideChat(sideChatId)?.artifact.content.toolStates.get(toolCallId);
}

export function useSideChatMessages() {
  const turnContentStartIndicesRef = useRef<Record<string, number>>({});

  useSubscribeAgentEvents({
    agent_start: (event) => {
      const sideChat = resolveSideChat(event.sessionId);
      if (!sideChat) return;
      sessionStore
        .getState()
        .setSideChatArtifactStatus(sideChat.mainSessionId, sideChat.artifact.id, "running");
    },

    agent_end: (event) => {
      const sideChat = resolveSideChat(event.sessionId);
      if (!sideChat) return;

      const status = event.messages.some(isFailedAssistantMessage) ? "failed" : "completed";
      sessionStore
        .getState()
        .setSideChatArtifactStatus(sideChat.mainSessionId, sideChat.artifact.id, status);
      sessionStore
        .getState()
        .setSideChatArtifactStreamingCompletedAt(sideChat.mainSessionId, sideChat.artifact.id);
      turnContentStartIndicesRef.current[event.sessionId] = 0;
      sessionStore.getState().setSideChatArtifactStreamingEntryId(sideChat.artifact.id, undefined);
    },

    turn_start: (event) => {
      const sideChat = resolveSideChat(event.sessionId);
      if (!sideChat) return;

      const streamingEntryId = sessionStore.getState().streamingEntryIds.get(event.sessionId);
      if (!streamingEntryId) return;

      const entry = sideChat.artifact.content.entries.find((item) => item.id === streamingEntryId);
      if (entry && isAgentMessageEntry(entry) && entry.data.role === "assistant") {
        turnContentStartIndicesRef.current[event.sessionId] = (entry.data.content ?? []).length;
      }
    },

    message_start: (event) => {
      const { sessionId, message } = event;
      if (message.role !== "assistant") return;

      const sideChat = resolveSideChat(sessionId);
      if (!sideChat) return;

      const turnStartIdx = turnContentStartIndicesRef.current[sessionId] ?? 0;
      if (turnStartIdx !== 0) return;

      const entryId = sessionStore
        .getState()
        .appendSideChatArtifactEntry(sideChat.mainSessionId, sideChat.artifact.id, message);
      sessionStore.getState().setSideChatArtifactStreamingEntryId(sideChat.artifact.id, entryId);
    },

    message_update: (event) => {
      const { sessionId, message } = event;
      if (message.role !== "assistant") return;

      const sideChat = resolveSideChat(sessionId);
      if (!sideChat) return;

      const streamingEntryId = sessionStore.getState().streamingEntryIds.get(sessionId);
      if (!streamingEntryId) return;

      const entry = sideChat.artifact.content.entries.find((item) => item.id === streamingEntryId);
      if (!entry || !isAgentMessageEntry(entry) || entry.data.role !== "assistant") return;

      const turnStartIdx = turnContentStartIndicesRef.current[sessionId] ?? 0;
      if (turnStartIdx === 0) {
        sessionStore
          .getState()
          .updateSideChatArtifactEntry(
            sideChat.mainSessionId,
            sideChat.artifact.id,
            streamingEntryId,
            message,
          );
      } else {
        const existingContent = entry.data.content ?? [];
        sessionStore
          .getState()
          .updateSideChatArtifactEntry(
            sideChat.mainSessionId,
            sideChat.artifact.id,
            streamingEntryId,
            {
              ...message,
              content: [
                ...existingContent.slice(0, turnStartIdx),
                ...message.content,
              ] as AssistantMessage["content"],
            },
          );
      }

      for (const block of message.content) {
        if (block.type === "toolCall") {
          const toolCall = block as ToolCall;
          const existing = getSideChatToolState(sideChat.artifact.id, toolCall.id);
          if (!existing) {
            sessionStore
              .getState()
              .setSideChatArtifactToolState(
                sideChat.mainSessionId,
                sideChat.artifact.id,
                toolCall.id,
                {
                  toolCallId: toolCall.id,
                  toolName: toolCall.name,
                  status: "running",
                  args: toolCall.arguments,
                  output: "",
                },
              );
          }
        }
      }
    },

    message_end: (event) => {
      const { sessionId, message } = event;
      if (message.role !== "assistant") return;

      const sideChat = resolveSideChat(sessionId);
      if (!sideChat) return;

      const streamingEntryId = sessionStore.getState().streamingEntryIds.get(sessionId);
      if (!streamingEntryId) return;

      const entry = sideChat.artifact.content.entries.find((item) => item.id === streamingEntryId);
      if (!entry || !isAgentMessageEntry(entry) || entry.data.role !== "assistant") return;

      const turnStartIdx = turnContentStartIndicesRef.current[sessionId] ?? 0;
      const assistantMsg = message as AssistantMessage;
      if (turnStartIdx === 0) {
        sessionStore
          .getState()
          .updateSideChatArtifactEntry(
            sideChat.mainSessionId,
            sideChat.artifact.id,
            streamingEntryId,
            assistantMsg,
          );
      } else {
        const existingContent = entry.data.content ?? [];
        sessionStore
          .getState()
          .updateSideChatArtifactEntry(
            sideChat.mainSessionId,
            sideChat.artifact.id,
            streamingEntryId,
            {
              ...assistantMsg,
              content: [
                ...existingContent.slice(0, turnStartIdx),
                ...assistantMsg.content,
              ] as AssistantMessage["content"],
            },
          );
      }
    },

    tool_execution_start: (event) => {
      const { sessionId, toolCallId, toolName, args } = event;
      const sideChat = resolveSideChat(sessionId);
      if (!sideChat) return;

      const existing = getSideChatToolState(sideChat.artifact.id, toolCallId);
      if (existing) return;
      sessionStore
        .getState()
        .setSideChatArtifactToolState(sideChat.mainSessionId, sideChat.artifact.id, toolCallId, {
          toolCallId,
          toolName,
          status: "running",
          args,
          output: "",
        });
    },

    tool_execution_update: (event) => {
      const { sessionId, toolCallId, toolName, args } = event;
      const sideChat = resolveSideChat(sessionId);
      if (!sideChat) return;

      const existing = getSideChatToolState(sideChat.artifact.id, toolCallId);
      if (!existing) return;
      sessionStore
        .getState()
        .setSideChatArtifactToolState(sideChat.mainSessionId, sideChat.artifact.id, toolCallId, {
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
      const sideChat = resolveSideChat(sessionId);
      if (!sideChat) return;

      const resultContent = result?.content;
      const output = Array.isArray(resultContent)
        ? extractToolResultText(resultContent)
        : formatArgs(result);
      const existing = getSideChatToolState(sideChat.artifact.id, toolCallId);
      sessionStore
        .getState()
        .setSideChatArtifactToolState(sideChat.mainSessionId, sideChat.artifact.id, toolCallId, {
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
      const sideChat = resolveSideChat(sessionId);
      if (!sideChat) return;

      const existing = getSideChatToolState(sideChat.artifact.id, request.toolCallId);
      sessionStore
        .getState()
        .setSideChatArtifactToolState(
          sideChat.mainSessionId,
          sideChat.artifact.id,
          request.toolCallId,
          {
            toolCallId: request.toolCallId,
            toolName: request.toolName,
            status: "awaiting_approval",
            args: existing?.args ?? request.args,
            output: existing?.output ?? "Waiting for permission approval...",
            requestId: request.requestId,
            approvalStatus: "pending",
          },
        );
    },
  });
}
