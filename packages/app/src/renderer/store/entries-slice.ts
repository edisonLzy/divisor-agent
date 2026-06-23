import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { AssistantMessage, UserMessage } from "@earendil-works/pi-ai";
import type { Entry } from "@renderer/apis/sessions";
import { isAgentMessageEntry } from "@renderer/lib/is";
import type { JSONContent } from "@tiptap/core";
import { v4 as uuidv4 } from "uuid";
import type { StateCreator } from "zustand/vanilla";

export type SessionStatus = "idle" | "running" | "completed" | "failed";

export type ToolExecutionStatus = "running" | "awaiting_approval" | "done" | "error";

export type ToolApprovalStatus = "pending" | "approved" | "denied";

export enum EntryStatus {
  Local,
  Syncing,
  Synced,
  Failed,
}

export interface ToolExecutionState {
  toolCallId: string;
  toolName: string;
  status: ToolExecutionStatus;
  args: unknown;
  details?: unknown;
  output: string;
  requestId?: string;
  approvalStatus?: ToolApprovalStatus;
}

export interface AgentUserMessage extends Omit<UserMessage, "content"> {
  content: JSONContent;
  text: string;
}

export type AgentMessageData = Exclude<AgentMessage, UserMessage> | AgentUserMessage;

interface AgentMessageEntry extends Omit<Entry, "type" | "data"> {
  type: "message";
  data: AgentMessageData;
  status: EntryStatus;
  completedAt?: number;
}

export interface ModelChangedData {
  provider: string;
  modelId: string;
}

interface AgentModalChangedEntry extends Omit<Entry, "type" | "data"> {
  type: "model_change";
  data: ModelChangedData;
  status: EntryStatus;
}

export type SessionEntry = AgentMessageEntry | AgentModalChangedEntry;

export interface MessageEntry extends AgentMessageEntry {}
export interface ModelChangedEntry extends AgentModalChangedEntry {}

export interface EntryState {
  entries: SessionEntry[];
  toolStates: Map<string, ToolExecutionState>;
  status: SessionStatus;
}

export interface EntriesSlice {
  entryStates: Map<string, EntryState>;
  streamingEntryIds: Map<string, string>;

  getEntryState: (sessionId: string) => EntryState;

  appendMessageEntry: (sessionId: string, message: AgentMessageData) => string;
  updateMessageEntry: (sessionId: string, entryId: string, message: AssistantMessage) => void;
  setEntryStatus: (sessionId: string, entryIds: string[], status: EntryStatus) => void;
  setStreamingEntryId: (sessionId: string, id: string | undefined) => void;
  setStreamingEntryCompletedAt: (sessionId: string, completedAt: number) => void;
  setToolState: (sessionId: string, toolCallId: string, state: ToolExecutionState) => void;
  setSessionEntries: (sessionId: string, entries: SessionEntry[]) => void;
  setStatus: (sessionId: string, status: SessionStatus) => void;

  removeEntryState: (sessionId: string) => void;
}

const EMPTY_ENTRY_STATE = {
  entries: [],
  toolStates: new Map(),
  status: "idle" as const,
};

function getOrCreateEntryState(
  entryStates: Map<string, EntriesSlice["entryStates"] extends Map<string, infer V> ? V : never>,
  sessionId: string,
) {
  const existing = entryStates.get(sessionId);
  if (existing) return existing;
  return { entries: [], toolStates: new Map(), status: "idle" as const };
}

export const createEntriesSlice: StateCreator<EntriesSlice, [], [], EntriesSlice> = (set, get) => ({
  entryStates: new Map(),
  streamingEntryIds: new Map(),

  getEntryState: (sessionId) => {
    const existing = get().entryStates.get(sessionId);
    if (existing) return existing;
    return { ...EMPTY_ENTRY_STATE, toolStates: new Map() };
  },

  appendMessageEntry: (sessionId, message) => {
    const entryId = uuidv4();
    const state = get().getEntryState(sessionId);

    const parentId = state.entries.length > 0 ? state.entries[state.entries.length - 1].id : null;

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
      const entryStates = new Map(prev.entryStates);
      const current = getOrCreateEntryState(entryStates, sessionId);
      entryStates.set(sessionId, {
        ...current,
        entries: [...current.entries, messageEntry],
      });
      return { entryStates };
    });

    return entryId;
  },

  updateMessageEntry: (sessionId, entryId, message) => {
    const state = get().getEntryState(sessionId);
    const entryIndex = state.entries.findIndex((entry) => entry.id === entryId);
    if (entryIndex < 0) return;

    const existingEntry = state.entries[entryIndex];
    if (!isAgentMessageEntry(existingEntry)) return;

    set((prev) => {
      const entryStates = new Map(prev.entryStates);
      const current = getOrCreateEntryState(entryStates, sessionId);
      const entries = [...current.entries];
      entries[entryIndex] = { ...existingEntry, data: message };
      entryStates.set(sessionId, { ...current, entries });
      return { entryStates };
    });
  },

  setEntryStatus: (sessionId, entryIds, status) => {
    const state = get().getEntryState(sessionId);
    if (entryIds.length === 0) return;

    const targetIds = new Set(entryIds);
    const entries = state.entries.map((entry) => {
      if (!targetIds.has(entry.id)) return entry;
      return { ...entry, status };
    });

    set((prev) => {
      const entryStates = new Map(prev.entryStates);
      const current = getOrCreateEntryState(entryStates, sessionId);
      entryStates.set(sessionId, { ...current, entries });
      return { entryStates };
    });
  },

  setStreamingEntryCompletedAt: (sessionId, completedAt) => {
    const entryId = get().streamingEntryIds.get(sessionId);
    if (!entryId) return;

    const state = get().getEntryState(sessionId);
    const entryIndex = state.entries.findIndex((entry) => entry.id === entryId);
    if (entryIndex < 0) return;

    const existingEntry = state.entries[entryIndex];
    if (!isAgentMessageEntry(existingEntry)) return;

    set((prev) => {
      const entryStates = new Map(prev.entryStates);
      const current = getOrCreateEntryState(entryStates, sessionId);
      const entries = [...current.entries];
      entries[entryIndex] = { ...existingEntry, completedAt };
      entryStates.set(sessionId, { ...current, entries });
      return { entryStates };
    });
  },

  setToolState: (sessionId, toolCallId, state) => {
    set((prev) => {
      const entryStates = new Map(prev.entryStates);
      const current = getOrCreateEntryState(entryStates, sessionId);
      const toolStates = new Map(current.toolStates);
      toolStates.set(toolCallId, state);
      entryStates.set(sessionId, { ...current, toolStates });
      return { entryStates };
    });
  },

  setSessionEntries: (sessionId, entries) => {
    set((prev) => {
      const entryStates = new Map(prev.entryStates);
      const current = getOrCreateEntryState(entryStates, sessionId);
      entryStates.set(sessionId, { ...current, entries });
      return { entryStates };
    });
  },

  setStatus: (sessionId, status) => {
    set((prev) => {
      const entryStates = new Map(prev.entryStates);
      const current = getOrCreateEntryState(entryStates, sessionId);
      entryStates.set(sessionId, { ...current, status });
      return { entryStates };
    });
  },

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

  removeEntryState: (sessionId) => {
    set((prev) => {
      const entryStates = new Map(prev.entryStates);
      entryStates.delete(sessionId);
      return { entryStates };
    });
  },
});
