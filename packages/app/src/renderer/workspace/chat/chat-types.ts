import type { AgentEvent } from "@mariozechner/pi-agent-core";
import type { AssistantMessage, ToolResultMessage } from "@mariozechner/pi-ai";
import type { RichTextDocument } from "@renderer/components/richtext";
import type { AvailableModel } from "@shared/models-ipc";

export interface PromptSubmission {
  text: string;
  document: RichTextDocument;
  model: AvailableModel;
}

export interface LocalUserChatMessage {
  id: string;
  role: "user";
  text: string;
  document: RichTextDocument;
  timestamp: number;
}

export type AssistantResponseStatus = "streaming" | "complete" | "error" | "aborted";
export type AssistantToolState = "input-streaming" | "running" | "done" | "error";

interface AssistantTimelineMessageBase {
  id: string;
  role: "assistant";
  streamId: string;
  timestamp: number;
}

export interface AssistantThinkingTimelineMessage extends AssistantTimelineMessageBase {
  kind: "thinking";
  content: string;
}

export interface AssistantResponseTimelineMessage extends AssistantTimelineMessageBase {
  kind: "response";
  content: string;
  status: AssistantResponseStatus;
}

export interface AssistantToolTimelineMessage extends AssistantTimelineMessageBase {
  kind: "tool";
  toolCallId: string;
  toolName: string;
  state: AssistantToolState;
  input: string;
  output: string;
}

export type AssistantTimelineMessage =
  | AssistantThinkingTimelineMessage
  | AssistantResponseTimelineMessage
  | AssistantToolTimelineMessage;

export type ChatTimelineMessage = LocalUserChatMessage | AssistantTimelineMessage;

export interface ChatRenderState {
  messages: ChatTimelineMessage[];
  isLoading: boolean;
  activeStreamId?: string;
}

export function isUserChatMessage(message: ChatTimelineMessage): message is LocalUserChatMessage {
  return message.role === "user";
}

export function createLocalUserMessage(
  text: string,
  document: RichTextDocument,
): LocalUserChatMessage {
  return {
    id: `user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    role: "user",
    text,
    document,
    timestamp: Date.now(),
  };
}

export function createInitialChatRenderState(): ChatRenderState {
  return {
    messages: [],
    isLoading: false,
  };
}

export function formatStructuredValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  try {
    return JSON.stringify(value ?? {}, null, 2);
  } catch {
    return String(value);
  }
}

export function extractToolResultText(content: ToolResultMessage["content"]): string {
  return content
    .filter(
      (block): block is Extract<ToolResultMessage["content"][number], { type: "text" }> =>
        block.type === "text",
    )
    .map((block) => block.text)
    .join("\n")
    .trim();
}

function getAssistantResponseStatus(message: AssistantMessage): AssistantResponseStatus {
  switch (message.stopReason) {
    case "error":
      return "error";
    case "aborted":
      return "aborted";
    default:
      return "complete";
  }
}

function buildFallbackAssistantMessage(
  streamId: string,
  message: AssistantMessage,
): AssistantResponseTimelineMessage | undefined {
  if (
    message.stopReason === "stop" ||
    message.stopReason === "toolUse" ||
    message.stopReason === "length"
  ) {
    return undefined;
  }

  const errorText = message.errorMessage?.trim();
  if (!errorText) {
    return undefined;
  }

  return {
    id: `${streamId}-response-fallback`,
    role: "assistant",
    streamId,
    kind: "response",
    content: errorText,
    status: getAssistantResponseStatus(message),
    timestamp: message.timestamp,
  };
}

export function buildAssistantTimelineMessages(
  streamId: string,
  message: AssistantMessage,
  existingMessages: ChatTimelineMessage[],
): AssistantTimelineMessage[] {
  const toolStateByCallId = new Map<string, AssistantToolTimelineMessage>();
  for (const entry of existingMessages) {
    if (entry.role === "assistant" && entry.kind === "tool") {
      toolStateByCallId.set(entry.toolCallId, entry);
    }
  }

  const timelineMessages: AssistantTimelineMessage[] = [];

  for (let index = 0; index < message.content.length; index += 1) {
    const block = message.content[index];
    if (block.type === "thinking") {
      const thinking = block.thinking.trim();
      if (!thinking) {
        continue;
      }

      timelineMessages.push({
        id: `${streamId}-thinking-${index}`,
        role: "assistant",
        streamId,
        kind: "thinking",
        content: thinking,
        timestamp: message.timestamp,
      });
      continue;
    }

    if (block.type === "text") {
      const text = block.text.trim();
      if (!text) {
        continue;
      }

      timelineMessages.push({
        id: `${streamId}-response-${index}`,
        role: "assistant",
        streamId,
        kind: "response",
        content: text,
        status: getAssistantResponseStatus(message),
        timestamp: message.timestamp,
      });
      continue;
    }

    const existingTool = toolStateByCallId.get(block.id);
    timelineMessages.push({
      id: existingTool?.id ?? `${streamId}-tool-${block.id}`,
      role: "assistant",
      streamId,
      kind: "tool",
      toolCallId: block.id,
      toolName: block.name,
      state: existingTool?.state ?? "input-streaming",
      input: formatStructuredValue(block.arguments),
      output: existingTool?.output ?? "",
      timestamp: message.timestamp,
    });
  }

  if (timelineMessages.length === 0) {
    const fallback = buildFallbackAssistantMessage(streamId, message);
    if (fallback) {
      timelineMessages.push(fallback);
    }
  }

  return timelineMessages;
}

function replaceAssistantStreamMessages(
  messages: ChatTimelineMessage[],
  streamId: string,
  nextMessages: AssistantTimelineMessage[],
): ChatTimelineMessage[] {
  const retained = messages.filter((message) => {
    return !(message.role === "assistant" && message.streamId === streamId);
  });
  return [...retained, ...nextMessages];
}

function updateToolMessage(
  messages: ChatTimelineMessage[],
  toolCallId: string,
  updater: (tool: AssistantToolTimelineMessage) => AssistantToolTimelineMessage,
): ChatTimelineMessage[] {
  let found = false;
  const nextMessages = messages.map((message) => {
    if (
      message.role === "assistant" &&
      message.kind === "tool" &&
      message.toolCallId === toolCallId
    ) {
      found = true;
      return updater(message);
    }
    return message;
  });

  return found ? nextMessages : messages;
}

function createToolMessage(
  streamId: string,
  toolCallId: string,
  toolName: string,
  state: AssistantToolState,
  args: unknown,
  output = "",
): AssistantToolTimelineMessage {
  return {
    id: `${streamId}-tool-${toolCallId}`,
    role: "assistant",
    streamId,
    kind: "tool",
    toolCallId,
    toolName,
    state,
    input: formatStructuredValue(args),
    output,
    timestamp: Date.now(),
  };
}

function resolveActiveStreamId(state: ChatRenderState, event: AgentEvent): string {
  if (state.activeStreamId) {
    return state.activeStreamId;
  }

  if (
    event.type === "message_start" ||
    event.type === "message_update" ||
    event.type === "message_end"
  ) {
    const timestamp =
      event.message.role === "assistant" && "timestamp" in event.message
        ? event.message.timestamp
        : Date.now();
    return `assistant-${timestamp}`;
  }

  return `assistant-${Date.now()}`;
}

export function reduceChatAgentEvent(state: ChatRenderState, event: AgentEvent): ChatRenderState {
  switch (event.type) {
    case "agent_start":
      return {
        ...state,
        isLoading: true,
      };

    case "agent_end":
      return {
        ...state,
        isLoading: false,
        activeStreamId: undefined,
      };

    case "message_start": {
      if (event.message.role !== "assistant") {
        return state;
      }

      return {
        ...state,
        activeStreamId: resolveActiveStreamId(state, event),
        isLoading: true,
      };
    }

    case "message_update": {
      if (event.message.role !== "assistant") {
        return state;
      }

      const streamId = resolveActiveStreamId(state, event);
      const nextMessages = buildAssistantTimelineMessages(streamId, event.message, state.messages);
      return {
        ...state,
        activeStreamId: streamId,
        messages: replaceAssistantStreamMessages(state.messages, streamId, nextMessages),
      };
    }

    case "message_end": {
      if (event.message.role !== "assistant") {
        return state;
      }

      const streamId = resolveActiveStreamId(state, event);
      const nextMessages = buildAssistantTimelineMessages(streamId, event.message, state.messages);
      return {
        ...state,
        activeStreamId: undefined,
        messages: replaceAssistantStreamMessages(state.messages, streamId, nextMessages),
      };
    }

    case "tool_execution_start": {
      const streamId = state.activeStreamId ?? `assistant-${Date.now()}`;
      const existing = state.messages.find((message) => {
        return (
          message.role === "assistant" &&
          message.kind === "tool" &&
          message.toolCallId === event.toolCallId
        );
      });

      if (existing && existing.role === "assistant" && existing.kind === "tool") {
        return {
          ...state,
          messages: updateToolMessage(state.messages, event.toolCallId, (tool) => ({
            ...tool,
            toolName: event.toolName,
            input: formatStructuredValue(event.args),
            state: "running",
          })),
        };
      }

      return {
        ...state,
        messages: [
          ...state.messages,
          createToolMessage(streamId, event.toolCallId, event.toolName, "running", event.args),
        ],
      };
    }

    case "tool_execution_update": {
      return {
        ...state,
        messages: updateToolMessage(state.messages, event.toolCallId, (tool) => ({
          ...tool,
          toolName: event.toolName,
          input: formatStructuredValue(event.args),
          output: extractToolResultText(event.partialResult.content),
          state: "running",
        })),
      };
    }

    case "tool_execution_end": {
      return {
        ...state,
        messages: updateToolMessage(state.messages, event.toolCallId, (tool) => ({
          ...tool,
          toolName: event.toolName,
          output: extractToolResultText(event.result.content),
          state: event.isError ? "error" : "done",
        })),
      };
    }

    default:
      return state;
  }
}
