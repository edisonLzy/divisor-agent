import type { AgentMessage } from "@earendil-works/pi-agent-core";
import { getSession, getSessionEntries } from "@renderer/apis/sessions";
import {
  EntryStatus,
  type AgentMessageData,
  type MessageEntry,
  type ModelChangedData,
  type SessionEntry,
} from "@renderer/store/entries-slice";
import { mainStore } from "@renderer/store/main";
import { v4 as uuidv4 } from "uuid";

export async function activateSession(sessionId: string) {
  const session = mainStore.getState().getSession(sessionId) ?? (await getSession(sessionId));
  mainStore.getState().addSessions([session]);

  const persistedEntries = await getSessionEntries(sessionId);
  const entries = persistedEntries.map(toSessionEntry);
  const firstSnapshot = await window.electronAPI.invoke("getSessionRuntimeSnapshot", sessionId);
  const hydratedEntries = mergeRuntimeMessages(sessionId, entries, firstSnapshot?.messages ?? []);
  mainStore.getState().setSessionEntries(sessionId, hydratedEntries);
  mainStore.getState().setActiveSessionId(sessionId);

  await window.electronAPI.invoke("setSessionId", sessionId);
  const latestSnapshot = await window.electronAPI.invoke("getSessionRuntimeSnapshot", sessionId);
  if (latestSnapshot) {
    const latestEntries = mergeRuntimeMessages(
      sessionId,
      mainStore.getState().getEntryState(sessionId).entries,
      latestSnapshot.messages,
    );
    mainStore.getState().setSessionEntries(sessionId, latestEntries);
    mainStore.getState().setStatus(sessionId, latestSnapshot.isRunning ? "running" : "completed");

    if (latestSnapshot.isRunning) {
      const lastAssistantEntry = [...latestEntries]
        .reverse()
        .find((entry) => entry.type === "message" && entry.data.role === "assistant");
      mainStore.getState().setStreamingEntryId(sessionId, lastAssistantEntry?.id);
    }
  } else {
    const messages = hydratedEntries
      .filter((entry): entry is MessageEntry => entry.type === "message")
      .map((entry) => entry.data);
    await window.electronAPI.invoke("setHistoryMessages", sessionId, messages);
  }
}

function toSessionEntry(
  entry: Awaited<ReturnType<typeof getSessionEntries>>[number],
): SessionEntry {
  if (entry.type === "message") {
    return {
      ...entry,
      type: "message",
      data: entry.data as unknown as AgentMessageData,
      status: EntryStatus.Synced,
    };
  }

  return {
    ...entry,
    type: "model_change",
    data: entry.data as unknown as ModelChangedData,
    status: EntryStatus.Synced,
  };
}

function mergeRuntimeMessages(
  sessionId: string,
  entries: SessionEntry[],
  messages: AgentMessage[],
): SessionEntry[] {
  const nextEntries = [...entries];

  for (const message of messages) {
    const exists = nextEntries.some(
      (entry) =>
        entry.type === "message" &&
        entry.data.role === message.role &&
        entry.data.timestamp === message.timestamp,
    );
    if (exists) continue;

    nextEntries.push({
      id: uuidv4(),
      sessionId,
      parentId: nextEntries.at(-1)?.id ?? null,
      type: "message",
      timestamp: message.timestamp,
      data: message,
      status: EntryStatus.Local,
    });
  }

  return nextEntries;
}
