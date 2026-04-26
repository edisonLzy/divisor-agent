export type ChatMessageStatus = "streaming" | "done" | "error";
export type ChatToolState = "input-streaming" | "running" | "done" | "error";

interface BaseChatMessage {
  id: string;
  sessionId: string;
  createdAt: number;
}

export interface UserChatMessage extends BaseChatMessage {
  role: "user";
  kind: "user";
  content: string;
}

export interface ThinkingChatMessage extends BaseChatMessage {
  role: "assistant";
  kind: "thinking";
  content: string;
  status: ChatMessageStatus;
}

export interface ResponseChatMessage extends BaseChatMessage {
  role: "assistant";
  kind: "response";
  content: string;
  status: ChatMessageStatus;
}

export interface ToolChatMessage extends BaseChatMessage {
  role: "assistant";
  kind: "tool";
  toolCallId: string;
  toolName: string;
  args: unknown;
  input: string;
  output: string;
  details?: unknown;
  state: ChatToolState;
}

export type ChatMessage =
  | UserChatMessage
  | ThinkingChatMessage
  | ResponseChatMessage
  | ToolChatMessage;

export interface AgentMessageChunkEvent {
  sessionId: string;
  message: ChatMessage;
}

export interface IpcEventMap {
  agentMessageChunk: AgentMessageChunkEvent;
  agentMessageDone: {
    sessionId: string;
  };
}
