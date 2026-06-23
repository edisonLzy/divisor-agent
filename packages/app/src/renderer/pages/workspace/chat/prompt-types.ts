import type { AvailableModel } from "@shared/models-ipc";
import type { JSONContent } from "@tiptap/core";

export interface PromptSubmission {
  content: string;
  jsonContent: JSONContent;
  model: AvailableModel;
  skillIds: string[];
}
