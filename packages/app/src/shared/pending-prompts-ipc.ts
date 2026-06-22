import type { AgentUserMessage } from "./agent-message-ipc";
import type { PromptMetadata } from "./session-ipc";

export type PendingPromptKind = "steer" | "followup";

export interface PendingPrompt {
  id: string;
  kind: PendingPromptKind;
  message: AgentUserMessage;
  metadata?: PromptMetadata;
}
