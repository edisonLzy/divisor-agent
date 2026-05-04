import type { AgentMessage } from "@mariozechner/pi-agent-core";

import type { AvailableModel } from "./models-ipc";

export interface PromptPayload {
  sessionId: string;
  content: string;
  model?: Pick<AvailableModel, "modelId" | "providerId">;
}

export interface AgentSessionIPC {
  prompt: (params: PromptPayload) => Promise<void>;
  setHistoryMessages: (messages: AgentMessage[]) => Promise<void>;
  setSessionId: (sessionId: string) => Promise<void>;
}
