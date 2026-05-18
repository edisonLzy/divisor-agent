import type { MessageEntry, ModelChangedEntry, SessionEntry } from "@renderer/store/session";

export function isAgentMessageEntry(entry: SessionEntry): entry is MessageEntry {
  return entry.type === "message";
}

export function isModelChangedEntry(entry: SessionEntry): entry is ModelChangedEntry {
  return entry.type === "model_change";
}
