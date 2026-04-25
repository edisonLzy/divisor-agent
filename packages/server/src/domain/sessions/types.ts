export interface SessionNode {
  id: string;
  parentId: string | null;
  name: string;
  timestamp: number;
  children?: SessionNode[];
}

export interface SessionMap {
  version: string;
  sessions: Omit<SessionNode, "children">[];
}

export type MessageBlockType = "text" | "thinking" | "tool_result";

export interface TextBlock {
  type: "text";
  content: string;
}

export interface ThinkingBlock {
  type: "thinking";
  content: string;
}

export interface ToolResultBlock {
  type: "tool_result";
  toolName: string;
  content: string;
}

export type MessageBlock = TextBlock | ThinkingBlock | ToolResultBlock;

export interface HistoryMessage {
  id: string;
  sessionId: string;
  role: "user" | "assistant";
  blocks: MessageBlock[];
  timestamp: number;
}

export interface HistoryResponse {
  messages: HistoryMessage[];
  nextCursor: string | null;
}

export interface AppSettings {
  model: {
    provider: string;
    name: string;
  };
  app: {
    workingDirectory?: string;
  };
}
