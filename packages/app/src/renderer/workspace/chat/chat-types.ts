import type { RichTextDocument } from "@renderer/components/richtext";
import type { ChatMessage, UserChatMessage } from "@shared/message-ipc";

export interface PromptSubmission {
  text: string;
  document: RichTextDocument;
}

export interface LocalUserChatMessage extends UserChatMessage {
  document: RichTextDocument;
}

export type AssistantTimelineMessage = Extract<ChatMessage, { role: "assistant" }>;
export type ChatTimelineMessage = AssistantTimelineMessage | LocalUserChatMessage;

export function isUserChatMessage(message: ChatTimelineMessage): message is LocalUserChatMessage {
  return message.role === "user";
}
