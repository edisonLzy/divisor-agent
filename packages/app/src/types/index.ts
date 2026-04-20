export interface SessionNode {
  id: string;
  parentId: string | null;
  name: string;
  timestamp: number;
  children?: SessionNode[];
}

export interface TextBlock {
  type: 'text';
  content: string;
}

export interface ThinkingBlock {
  type: 'thinking';
  content: string;
}

export interface ToolResultBlock {
  type: 'tool_result';
  toolName: string;
  content: string;
}

export type MessageBlock = TextBlock | ThinkingBlock | ToolResultBlock;

export interface HistoryMessage {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant';
  blocks: MessageBlock[];
  timestamp: number;
}

export interface ModelInfo {
  providerId: string;
  modelId: string;
  modelName: string;
  isBuiltIn: boolean;
  api?: string;
  baseUrl?: string;
}
