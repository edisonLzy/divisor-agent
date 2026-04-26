import type { AvailableModel } from "./models-ipc";

interface PromptContent {
  content: string;
  metadata: Record<string, any>;
}

interface PromptPayload {
  sessionId: string;
  content: string;
  model: AvailableModel;
}

export interface AgentSessionIPC {
  prompt: (params: PromptPayload) => Promise<void>;
  setHistoryMessages: (messages: PromptContent[]) => Promise<void>;
  setSessionId: (sessionId: string) => Promise<void>;
}
