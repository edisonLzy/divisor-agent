import type { AssistantMessage } from "@mariozechner/pi-ai";
import type {
  AgentMessageData,
  AgentUserMessage,
  MessageEntry,
  ModelChangedEntry,
  SessionEntry,
} from "@renderer/store";

export function isAgentMessageEntry(entry: SessionEntry): entry is MessageEntry {
  return entry.type === "message";
}

export function isModelChangedEntry(entry: SessionEntry): entry is ModelChangedEntry {
  return entry.type === "model_change";
}

export function isAgentUserMessage(message: AgentMessageData): message is AgentUserMessage {
  return message.role === "user";
}

export function isAgentAssistantMessage(message: AgentMessageData): message is AssistantMessage {
  return message.role === "assistant";
}
