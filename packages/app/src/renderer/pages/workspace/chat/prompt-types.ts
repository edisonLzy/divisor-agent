import type { AvailableModel } from "@shared/models-ipc";

export interface PromptSubmission {
  text: string;
  model: AvailableModel;
  skillIds: string[];
}
