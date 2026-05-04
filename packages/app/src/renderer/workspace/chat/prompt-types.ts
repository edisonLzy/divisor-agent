import type { RichTextDocument } from "@renderer/components/richtext";
import type { AvailableModel } from "@shared/models-ipc";

export interface PromptSubmission {
  text: string;
  document: RichTextDocument;
  model: AvailableModel;
}
