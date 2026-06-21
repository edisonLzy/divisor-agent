import type { PromptMetadata } from "./session-ipc";

export type PendingPromptKind = "steer" | "followup";

export interface PendingPrompt {
  id: string;
  entryId?: string;
  kind: PendingPromptKind;
  content: string;
  createdAt: number;
  metadata?: PromptMetadata;
}

export interface PendingPromptInput {
  content: string;
  createdAt?: number;
  metadata?: PromptMetadata;
}
