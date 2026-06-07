import type { AvailableModel } from "@shared/models-ipc";
import type { JSONContent } from "@tiptap/core";

export interface PromptSubmission {
  text: string;
  jsonContent: JSONContent;
  model: AvailableModel;
  skillIds: string[];
}
