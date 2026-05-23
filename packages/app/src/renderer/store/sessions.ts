import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type { AssistantMessage } from "@mariozechner/pi-ai";
import type { Entry, Session } from "@renderer/apis/sessions";
import { isAgentMessageEntry } from "@renderer/lib/is";
import type { AvailableModel } from "@shared/models-ipc";
import { v4 as uuidv4 } from "uuid";
import { createStore, type StateCreator } from "zustand/vanilla";

// ── Session Status ───────────────────────────────────────────────────────────

export type SessionStatus = "idle" | "running" | "completed" | "failed";

// ── Entry Types ──────────────────────────────────────────────────────────────

/** Possible states during a tool call's lifecycle */
export type ToolExecutionStatus = "running" | "done" | "error";

/**
 * Tracks the full lifecycle of a single tool call (e.g. a file-read or terminal command).
 * Keyed by `toolCallId` in `SessionState.toolStates`.
 */
export interface ToolExecutionState {
  /** Unique identifier for this tool call, matching the ToolCall block in the assistant message */
  toolCallId: string;
  /** Human-readable tool name, e.g. "fs_read", "terminal" */
  toolName: string;
  /** Current execution status */
  status: ToolExecutionStatus;
  /** Arguments passed to the tool (parsed JSON object) */
  args: unknown;
  /** Tool execution output (text result or error message) */
  output: string;
}

/** The shape of the `data` field in a SessionEntry with `type === "message"`. */
export type AgentMessageData = AgentMessage;

interface AgentMessageEntry extends Omit<Entry, "type" | "data"> {
  type: "message";
  data: AgentMessageData;
  completedAt?: number;
}

/**
 * Payload stored in a SessionEntry when `type === "model_change"`.
 * Records which provider + model the user switched to at that point in the timeline.
 */
export interface ModelChangedData {
  /** Provider identifier, e.g. "anthropic", "openai" */
  provider: string;
  /** Model identifier within the provider, e.g. "claude-sonnet-4-20250514" */
  modelId: string;
}

interface AgentModalChangedEntry extends Omit<Entry, "type" | "data"> {
  type: "model_change";
  data: ModelChangedData;
}

/**
 * Discriminated union of all session entry types.
 * Narrowing on `entry.type` gives full type safety on `data`.
 */
export type SessionEntry = AgentMessageEntry | AgentModalChangedEntry;

export interface MessageEntry extends AgentMessageEntry {}
export interface ModelChangedEntry extends AgentModalChangedEntry {}

// ── Session Shape ─────────────────────────────────────────────────────────────

export interface AgentSession extends Session {
  /** Timeline entries (messages, model changes, etc.) */
  entries: SessionEntry[];
  /** Currently selected model for this session */
  model: AvailableModel | undefined;
  /**
   * Per-tool-call execution states, keyed by toolCallId.
   * Populated by `tool_execution_start`, updated by `tool_execution_update`,
   * finalized by `tool_execution_end`.
   */
  toolStates: Map<string, ToolExecutionState>;
  /** Current execution status of this session */
  status: SessionStatus;
}

// ── Sessions Slice ─────────────────────────────────────────────────────

export interface SessionsSlice {
  activeSessionId: string | null;
  sessions: AgentSession[];
  /** Get a session by ID, or undefined if not found */
  getSession: (sessionId: string) => AgentSession | undefined;
  /** Append a server-side session to local store (no-op if already exists) */
  appendSession: (session: Session) => void;
  /** Switch the active session (the one displayed in the UI) */
  setActiveSessionId: (sessionId: string | null) => void;
  /** Bulk-set sessions from API list response */
  setSessions: (sessions: Session[]) => void;
  /** Set the execution status of a session */
  setSessionStatus: (sessionId: string, status: SessionStatus) => void;
  /** Update the currently selected model for this session */
  setModel: (sessionId: string, model: AvailableModel) => void;
  /** Update the current working directory */
  setCwd: (sessionId: string, cwd: string) => void;
}

// ── Entries Slice ──────────────────────────────────────────────────────

export interface EntriesSlice {
  /** Per-session streaming entry IDs (sessionId -> entryId) */
  streamingEntryIds: Map<string, string>;
  /** Set or clear the streaming entry ID for a session */
  setStreamingEntryId: (sessionId: string, id: string | undefined) => void;
  /** Append a new message entry to the timeline */
  appendMessageEntry: (sessionId: string, message: AgentMessage) => string;
  /** Update the `data` field of an existing entry (used during streaming) */
  updateMessageEntry: (sessionId: string, entryId: string, message: AssistantMessage) => void;
  /** Set the completedAt timestamp on a message entry */
  setStreamingEntryCompletedAt: (sessionId: string, completedAt: number) => void;
  /** Create or overwrite the execution state for a specific tool call */
  setToolState: (sessionId: string, toolCallId: string, state: ToolExecutionState) => void;
  /** Set the entries array for a session (replaces existing entries) */
  setSessionEntries: (sessionId: string, entries: SessionEntry[]) => void;
}

// ── Initial State ─────────────────────────────────────────────────────────────

function createSessionState(session: Session): AgentSession {
  return {
    ...session,
    entries: [],
    model: undefined,
    toolStates: new Map(),
    status: "idle",
  };
}

// ── Store Implementation ──────────────────────────────────────────────────────

type StoreType = SessionsSlice & EntriesSlice;

const createSessionsSlice: StateCreator<StoreType, [], [], SessionsSlice> = (set, get) => ({
  activeSessionId: null,
  sessions: [],

  getSession: (sessionId) => {
    return get().sessions.find((s) => s.id === sessionId);
  },

  appendSession: (session) => {
    const existing = get().sessions.find((s) => s.id === session.id);
    if (existing) return;

    const agentSession = createSessionState(session);
    set((prev) => ({ sessions: [...prev.sessions, agentSession] }));
  },

  setActiveSessionId: (id) => set({ activeSessionId: id }),

  setSessions: (sessions) => {
    set((prev) => {
      const existingMap = new Map(prev.sessions.map((session) => [session.id, session]));

      return {
        sessions: sessions.map((session) => {
          const existing = existingMap.get(session.id);
          if (!existing) {
            return createSessionState(session);
          }

          return {
            ...createSessionState(session),
            entries: existing.entries,
            model: existing.model,
            toolStates: existing.toolStates,
            status: existing.status,
          };
        }),
      };
    });
  },

  setSessionStatus: (sessionId, status) => {
    const session = get().getSession(sessionId);
    if (!session) return;

    set((prev) => {
      const idx = prev.sessions.findIndex((s) => s.id === sessionId);
      if (idx < 0) return prev;
      const next = [...prev.sessions];
      next[idx] = { ...session, status };
      return { sessions: next };
    });
  },

  setModel: (sessionId, model) => {
    const session = get().getSession(sessionId);
    if (!session) return;

    set((prev) => {
      const idx = prev.sessions.findIndex((s) => s.id === sessionId);
      if (idx < 0) return prev;
      const next = [...prev.sessions];
      next[idx] = { ...session, model };
      return { sessions: next };
    });
  },

  setCwd: (sessionId, cwd) => {
    const session = get().getSession(sessionId);
    if (!session) return;

    set((prev) => {
      const idx = prev.sessions.findIndex((s) => s.id === sessionId);
      if (idx < 0) return prev;
      const next = [...prev.sessions];
      next[idx] = { ...session, cwd };
      return { sessions: next };
    });
  },
});

const createEntriesSlice: StateCreator<StoreType, [], [], EntriesSlice> = (set, get) => ({
  appendMessageEntry: (sessionId, message) => {
    const entryId = uuidv4();
    const session = get().getSession(sessionId);
    if (!session) return entryId;

    const parentId =
      session.entries.length > 0 ? session.entries[session.entries.length - 1].id : null;

    const messageEntry: AgentMessageEntry = {
      id: entryId,
      sessionId,
      parentId,
      type: "message",
      timestamp: Date.now(),
      data: message,
    };

    set((prev) => {
      const idx = prev.sessions.findIndex((s) => s.id === sessionId);
      if (idx < 0) return prev;

      const next = [...prev.sessions];
      next[idx] = {
        ...session,
        entries: [...session.entries, messageEntry],
        updatedAt: Date.now(),
      };
      return { sessions: next };
    });

    return entryId;
  },

  updateMessageEntry: (sessionId, entryId, message) => {
    const session = get().getSession(sessionId);
    if (!session) return;

    const entryIdx = session.entries.findIndex((e) => e.id === entryId);
    if (entryIdx < 0) return;

    const existEntry = session.entries[entryIdx];
    if (!isAgentMessageEntry(existEntry)) return;

    const entries = [...session.entries];
    entries[entryIdx] = { ...existEntry, data: message };

    set((prev) => {
      const idx = prev.sessions.findIndex((s) => s.id === sessionId);
      if (idx < 0) return prev;
      const next = [...prev.sessions];
      next[idx] = { ...session, entries };
      return { sessions: next };
    });
  },

  setStreamingEntryCompletedAt: (sessionId, completedAt) => {
    const entryId = get().streamingEntryIds.get(sessionId);
    if (!entryId) return;

    const session = get().getSession(sessionId);
    if (!session) return;

    const entryIdx = session.entries.findIndex((e) => e.id === entryId);
    if (entryIdx < 0) return;

    const existEntry = session.entries[entryIdx];
    if (!isAgentMessageEntry(existEntry)) return;

    const entries = [...session.entries];
    entries[entryIdx] = { ...existEntry, completedAt };

    set((prev) => {
      const idx = prev.sessions.findIndex((s) => s.id === sessionId);
      if (idx < 0) return prev;
      const next = [...prev.sessions];
      next[idx] = { ...session, entries };
      return { sessions: next };
    });
  },

  setToolState: (sessionId, toolCallId, state) => {
    const session = get().getSession(sessionId);
    if (!session) return;

    const toolStates = new Map(session.toolStates);
    toolStates.set(toolCallId, state);

    set((prev) => {
      const idx = prev.sessions.findIndex((s) => s.id === sessionId);
      if (idx < 0) return prev;
      const next = [...prev.sessions];
      next[idx] = { ...session, toolStates };
      return { sessions: next };
    });
  },

  setSessionEntries: (sessionId, entries) => {
    const session = get().getSession(sessionId);
    if (!session) return;

    set((prev) => {
      const idx = prev.sessions.findIndex((s) => s.id === sessionId);
      if (idx < 0) return prev;
      const next = [...prev.sessions];
      next[idx] = { ...session, entries, updatedAt: Date.now() };
      return { sessions: next };
    });
  },

  streamingEntryIds: new Map(),

  setStreamingEntryId: (sessionId, id) => {
    set((prev) => {
      const next = new Map(prev.streamingEntryIds);
      if (id === undefined) {
        next.delete(sessionId);
      } else {
        next.set(sessionId, id);
      }
      return { streamingEntryIds: next };
    });
  },
});

export const sessionStore = createStore<StoreType>()((...a) => ({
  ...createSessionsSlice(...a),
  ...createEntriesSlice(...a),
}));
