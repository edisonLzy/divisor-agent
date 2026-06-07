import { isAgentMessageEntry } from "@renderer/lib/is";
import { v4 as uuidv4 } from "uuid";
import type { StateCreator } from "zustand/vanilla";

import { EntryStatus, type EntriesSlice, type SessionsStoreState } from "./types";

export const createEntriesSlice: StateCreator<SessionsStoreState, [], [], EntriesSlice> = (
  set,
  get,
) => ({
  appendMessageEntry: (sessionId, message) => {
    const entryId = uuidv4();
    const session = get().getSession(sessionId);
    if (!session) {
      return entryId;
    }

    const parentId =
      session.entries.length > 0 ? session.entries[session.entries.length - 1].id : null;

    const messageEntry = {
      id: entryId,
      sessionId,
      parentId,
      type: "message" as const,
      timestamp: Date.now(),
      data: message,
      status: EntryStatus.Local,
    };

    set((prev) => {
      const sessionIndex = prev.sessions.findIndex((candidate) => candidate.id === sessionId);
      if (sessionIndex < 0) {
        return prev;
      }

      const sessions = [...prev.sessions];
      sessions[sessionIndex] = {
        ...session,
        entries: [...session.entries, messageEntry],
        updatedAt: Date.now(),
      };
      return { sessions };
    });

    return entryId;
  },

  updateMessageEntry: (sessionId, entryId, message) => {
    const session = get().getSession(sessionId);
    if (!session) {
      return;
    }

    const entryIndex = session.entries.findIndex((entry) => entry.id === entryId);
    if (entryIndex < 0) {
      return;
    }

    const existingEntry = session.entries[entryIndex];
    if (!isAgentMessageEntry(existingEntry)) {
      return;
    }

    const entries = [...session.entries];
    entries[entryIndex] = { ...existingEntry, data: message };

    set((prev) => {
      const sessionIndex = prev.sessions.findIndex((candidate) => candidate.id === sessionId);
      if (sessionIndex < 0) {
        return prev;
      }

      const sessions = [...prev.sessions];
      sessions[sessionIndex] = { ...session, entries };
      return { sessions };
    });
  },

  setEntryStatus: (sessionId, entryIds, status) => {
    const session = get().getSession(sessionId);
    if (!session || entryIds.length === 0) {
      return;
    }

    const targetIds = new Set(entryIds);
    const entries = session.entries.map((entry) => {
      if (!targetIds.has(entry.id)) {
        return entry;
      }

      return { ...entry, status };
    });

    set((prev) => {
      const sessionIndex = prev.sessions.findIndex((candidate) => candidate.id === sessionId);
      if (sessionIndex < 0) {
        return prev;
      }

      const sessions = [...prev.sessions];
      sessions[sessionIndex] = { ...session, entries };
      return { sessions };
    });
  },

  setStreamingEntryCompletedAt: (sessionId, completedAt) => {
    const entryId = get().streamingEntryIds.get(sessionId);
    if (!entryId) {
      return;
    }

    const session = get().getSession(sessionId);
    if (!session) {
      return;
    }

    const entryIndex = session.entries.findIndex((entry) => entry.id === entryId);
    if (entryIndex < 0) {
      return;
    }

    const existingEntry = session.entries[entryIndex];
    if (!isAgentMessageEntry(existingEntry)) {
      return;
    }

    const entries = [...session.entries];
    entries[entryIndex] = { ...existingEntry, completedAt };

    set((prev) => {
      const sessionIndex = prev.sessions.findIndex((candidate) => candidate.id === sessionId);
      if (sessionIndex < 0) {
        return prev;
      }

      const sessions = [...prev.sessions];
      sessions[sessionIndex] = { ...session, entries };
      return { sessions };
    });
  },

  setToolState: (sessionId, toolCallId, state) => {
    const session = get().getSession(sessionId);
    if (!session) {
      return;
    }

    const toolStates = new Map(session.toolStates);
    toolStates.set(toolCallId, state);

    set((prev) => {
      const sessionIndex = prev.sessions.findIndex((candidate) => candidate.id === sessionId);
      if (sessionIndex < 0) {
        return prev;
      }

      const sessions = [...prev.sessions];
      sessions[sessionIndex] = { ...session, toolStates };
      return { sessions };
    });
  },

  setSessionEntries: (sessionId, entries) => {
    const session = get().getSession(sessionId);
    if (!session) {
      return;
    }

    set((prev) => {
      const sessionIndex = prev.sessions.findIndex((candidate) => candidate.id === sessionId);
      if (sessionIndex < 0) {
        return prev;
      }

      const sessions = [...prev.sessions];
      sessions[sessionIndex] = { ...session, entries, updatedAt: Date.now() };
      return { sessions };
    });
  },

  streamingEntryIds: new Map(),

  setStreamingEntryId: (sessionId, entryId) => {
    set((prev) => {
      const streamingEntryIds = new Map(prev.streamingEntryIds);
      if (entryId === undefined) {
        streamingEntryIds.delete(sessionId);
      } else {
        streamingEntryIds.set(sessionId, entryId);
      }

      return { streamingEntryIds };
    });
  },
});
