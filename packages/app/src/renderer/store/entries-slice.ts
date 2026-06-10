import { isAgentMessageEntry } from "@renderer/lib/is";
import { v4 as uuidv4 } from "uuid";
import type { StateCreator } from "zustand/vanilla";

import { EntryStatus, type EntriesSlice } from "./types";

const EMPTY_ENTRY_STATE = {
  entries: [],
  toolStates: new Map(),
  status: "idle" as const,
};

function getOrCreateEntryState(
  entryStates: Map<string, EntriesSlice["entryStates"] extends Map<string, infer V> ? V : never>,
  ownerId: string,
) {
  const existing = entryStates.get(ownerId);
  if (existing) return existing;
  return { entries: [], toolStates: new Map(), status: "idle" as const };
}

export const createEntriesSlice: StateCreator<EntriesSlice, [], [], EntriesSlice> = (set, get) => ({
  entryStates: new Map(),
  streamingEntryIds: new Map(),

  getEntryState: (ownerId) => {
    const existing = get().entryStates.get(ownerId);
    if (existing) return existing;
    return { ...EMPTY_ENTRY_STATE, toolStates: new Map() };
  },

  appendMessageEntry: (ownerId, message) => {
    const entryId = uuidv4();
    const state = get().getEntryState(ownerId);

    const parentId = state.entries.length > 0 ? state.entries[state.entries.length - 1].id : null;

    const messageEntry = {
      id: entryId,
      sessionId: ownerId,
      parentId,
      type: "message" as const,
      timestamp: Date.now(),
      data: message,
      status: EntryStatus.Local,
    };

    set((prev) => {
      const entryStates = new Map(prev.entryStates);
      const current = getOrCreateEntryState(entryStates, ownerId);
      entryStates.set(ownerId, {
        ...current,
        entries: [...current.entries, messageEntry],
      });
      return { entryStates };
    });

    return entryId;
  },

  updateMessageEntry: (ownerId, entryId, message) => {
    const state = get().getEntryState(ownerId);
    const entryIndex = state.entries.findIndex((entry) => entry.id === entryId);
    if (entryIndex < 0) return;

    const existingEntry = state.entries[entryIndex];
    if (!isAgentMessageEntry(existingEntry)) return;

    set((prev) => {
      const entryStates = new Map(prev.entryStates);
      const current = getOrCreateEntryState(entryStates, ownerId);
      const entries = [...current.entries];
      entries[entryIndex] = { ...existingEntry, data: message };
      entryStates.set(ownerId, { ...current, entries });
      return { entryStates };
    });
  },

  setEntryStatus: (ownerId, entryIds, status) => {
    const state = get().getEntryState(ownerId);
    if (entryIds.length === 0) return;

    const targetIds = new Set(entryIds);
    const entries = state.entries.map((entry) => {
      if (!targetIds.has(entry.id)) return entry;
      return { ...entry, status };
    });

    set((prev) => {
      const entryStates = new Map(prev.entryStates);
      const current = getOrCreateEntryState(entryStates, ownerId);
      entryStates.set(ownerId, { ...current, entries });
      return { entryStates };
    });
  },

  setStreamingEntryCompletedAt: (ownerId, completedAt) => {
    const entryId = get().streamingEntryIds.get(ownerId);
    if (!entryId) return;

    const state = get().getEntryState(ownerId);
    const entryIndex = state.entries.findIndex((entry) => entry.id === entryId);
    if (entryIndex < 0) return;

    const existingEntry = state.entries[entryIndex];
    if (!isAgentMessageEntry(existingEntry)) return;

    set((prev) => {
      const entryStates = new Map(prev.entryStates);
      const current = getOrCreateEntryState(entryStates, ownerId);
      const entries = [...current.entries];
      entries[entryIndex] = { ...existingEntry, completedAt };
      entryStates.set(ownerId, { ...current, entries });
      return { entryStates };
    });
  },

  setToolState: (ownerId, toolCallId, state) => {
    set((prev) => {
      const entryStates = new Map(prev.entryStates);
      const current = getOrCreateEntryState(entryStates, ownerId);
      const toolStates = new Map(current.toolStates);
      toolStates.set(toolCallId, state);
      entryStates.set(ownerId, { ...current, toolStates });
      return { entryStates };
    });
  },

  setSessionEntries: (ownerId, entries) => {
    set((prev) => {
      const entryStates = new Map(prev.entryStates);
      const current = getOrCreateEntryState(entryStates, ownerId);
      entryStates.set(ownerId, { ...current, entries });
      return { entryStates };
    });
  },

  setStatus: (ownerId, status) => {
    set((prev) => {
      const entryStates = new Map(prev.entryStates);
      const current = getOrCreateEntryState(entryStates, ownerId);
      entryStates.set(ownerId, { ...current, status });
      return { entryStates };
    });
  },

  setStreamingEntryId: (ownerId, entryId) => {
    set((prev) => {
      const streamingEntryIds = new Map(prev.streamingEntryIds);
      if (entryId === undefined) {
        streamingEntryIds.delete(ownerId);
      } else {
        streamingEntryIds.set(ownerId, entryId);
      }
      return { streamingEntryIds };
    });
  },

  removeEntryState: (ownerId) => {
    set((prev) => {
      const entryStates = new Map(prev.entryStates);
      entryStates.delete(ownerId);
      return { entryStates };
    });
  },
});
