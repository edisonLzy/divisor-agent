import type { AvailableModel } from "./models-ipc";

interface PromptContent {
  content: string;
  metadata: Record<string, unknown>;
}

export interface PromptPayload {
  sessionId: string;
  content: string;
  model?: Pick<AvailableModel, "modelId" | "providerId">;
}

export interface AgentSessionIPC {
  prompt: (params: PromptPayload) => Promise<void>;
  setHistoryMessages: (messages: PromptContent[]) => Promise<void>;
  setSessionId: (sessionId: string) => Promise<void>;
}

export type { PromptContent };
