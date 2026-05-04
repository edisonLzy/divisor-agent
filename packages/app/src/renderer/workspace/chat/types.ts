import type { UserMessage, AssistantMessage, ToolResultMessage } from "@mariozechner/pi-ai";

export interface AppUserMessage extends UserMessage {
  id: string;
}

export interface AppAssistantMessage extends AssistantMessage {
  id: string;
}

export interface AppToolResultMessage extends ToolResultMessage {
  id: string;
}

export type AppMessage = AppUserMessage | AppAssistantMessage | AppToolResultMessage;
