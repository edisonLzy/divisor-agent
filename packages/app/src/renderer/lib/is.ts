import type { AppUserMessage } from "@earendil-works/pi-agent-core";
import type { AssistantMessage } from "@earendil-works/pi-ai";
import type {
  AgentMessageData,
  MessageEntry,
  ModelChangedEntry,
  SessionEntry,
} from "@renderer/store/entries-slice";
import type { AppAssistantMessage } from "@shared/token-usage";

export function isAgentMessageEntry(entry: SessionEntry): entry is MessageEntry {
  return entry.type === "message";
}

export function isModelChangedEntry(entry: SessionEntry): entry is ModelChangedEntry {
  return entry.type === "model_change";
}

export function isAgentUserMessage(message: AgentMessageData): message is AppUserMessage {
  return message.role === "user";
}

export function isAgentAssistantMessage(message: AgentMessageData): message is AppAssistantMessage {
  return message.role === "assistant";
}

export function isFailedAssistantMessage(message: unknown): message is AppAssistantMessage {
  if (typeof message !== "object" || message === null) {
    return false;
  }

  const candidate = message as Partial<AssistantMessage>;

  return (
    candidate.role === "assistant" &&
    (candidate.stopReason === "error" ||
      candidate.stopReason === "aborted" ||
      Boolean(candidate.errorMessage))
  );
}
