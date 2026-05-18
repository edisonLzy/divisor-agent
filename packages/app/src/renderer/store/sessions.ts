import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type { AssistantMessage } from "@mariozechner/pi-ai";
import { Entry, Session } from "@renderer/apis/sessions";
import { isAgentMessageEntry } from "@renderer/lib/is";
import type { AvailableModel } from "@shared/models-ipc";
import { v4 as uuidv4 } from "uuid";
import { createStore } from "zustand/vanilla";

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
  /** Whether the agent is actively processing a prompt (controls loading indicators) */
  isLoading: boolean;
  /**
   * ID of the entry currently being streamed from the assistant.
   * Set when `message_start` fires for an assistant message, cleared on `message_end`.
   * Used to route `message_update` events to the correct entry.
   */
  streamingEntryId: string | undefined;
  /**
   * Per-tool-call execution states, keyed by toolCallId.
   * Populated by `tool_execution_start`, updated by `tool_execution_update`,
   * finalized by `tool_execution_end`.
   */
  toolStates: Map<string, ToolExecutionState>;
  /** Current execution status of this session */
  status: SessionStatus;
}

export interface SessionSnapshot {
  entries: SessionEntry[];
  cwd: string;
  model: AvailableModel | null;
  toolStates: Map<string, ToolExecutionState> | ToolExecutionState[];
}

// ── State ─────────────────────────────────────────────────────────────────────

export interface SessionsState {
  activeSessionId: string | null;
  sessions: AgentSession[];
}

// ── Actions ───────────────────────────────────────────────────────────────────

export interface SessionActions {
  /** Get a session by ID, or undefined if not found */
  getSession: (sessionId: string) => AgentSession | undefined;
  /** Get or lazily create a session's runtime state */
  getOrCreateSession: (sessionId: string) => AgentSession;
  /** Switch the active session (the one displayed in the UI) */
  selectSession: (sessionId: string | null) => void;
  /** Get the active session object */
  getActiveSession: () => AgentSession | undefined;
  /** Bulk-set sessions from API list response */
  setSessions: (sessions: AgentSession[]) => void;
  /** Set entries for a specific session (from API detail response) */
  setSessionEntries: (sessionId: string, entries: SessionEntry[]) => void;
  /**
   * Append a new message entry to the timeline.
   * Links to the previous entry via `parentId` and stamps with `Date.now()`.
   * Returns the generated entry ID (used to set `streamingEntryId` for assistant messages).
   */
  appendMessageEntry: (sessionId: string, message: AgentMessage) => string;
  /**
   * Update the `data` field of an existing entry.
   * Used during streaming: each `message_update` event replaces the entry's
   * partial AssistantMessage with the latest accumulated state.
   * No-op if `entryId` is not found.
   */
  updateMessageEntry: (sessionId: string, entryId: string, message: AssistantMessage) => void;
  setMessageCompletedAt: (sessionId: string, entryId: string, completedAt: number) => void;
  /**
   * Create or overwrite the execution state for a specific tool call.
   * Called on tool_execution_start (create), tool_execution_update (progress),
   * and tool_execution_end (final result).
   */
  setToolState: (sessionId: string, toolCallId: string, state: ToolExecutionState) => void;
  /** Toggle the agent loading indicator */
  setLoading: (sessionId: string, loading: boolean) => void;
  /**
   * Set or clear the streaming entry ID.
   * Set to an entry ID when assistant streaming begins, cleared when it ends.
   */
  setStreamingEntryId: (sessionId: string, id: string | undefined) => void;
  /** Set the execution status of a session */
  setSessionStatus: (sessionId: string, status: SessionStatus) => void;
  /** Update the currently selected model for this session */
  setModel: (sessionId: string, model: AvailableModel) => void;
  /** Update the current working directory */
  setCwd: (sessionId: string, cwd: string) => void;
  /** Replace a session's state with server-persisted data */
  hydrate: (sessionId: string, snapshot: SessionSnapshot) => void;
  /** Reset the entire session manager */
  reset: () => void;
}

// ── Initial State ─────────────────────────────────────────────────────────────

function createDefaultSession(sessionId: string): AgentSession {
  return {
    id: sessionId,
    name: "",
    cwd: "",
    parentSessionId: null,
    leafEntryId: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    entries: [],
    model: undefined,
    isLoading: false,
    streamingEntryId: undefined,
    toolStates: new Map(),
    status: "idle",
  };
}

// ── Store Implementation ──────────────────────────────────────────────────────

export const sessionStore = createStore<SessionsState & SessionActions>()((set, get) => ({
  activeSessionId: null,
  sessions: [],

  getSession: (sessionId) => {
    return get().sessions.find((s) => s.id === sessionId);
  },

  getActiveSession: () => {
    const { activeSessionId, sessions } = get();
    return sessions.find((s) => s.id === activeSessionId);
  },

  getOrCreateSession: (sessionId) => {
    const existing = get().sessions.find((s) => s.id === sessionId);
    if (existing) return existing;

    const session = createDefaultSession(sessionId);
    set((prev) => ({ sessions: [...prev.sessions, session] }));
    return session;
  },

  selectSession: (id) => set({ activeSessionId: id }),

  setSessions: (sessions) => {
    set((prev) => {
      // Merge: update existing sessions, add new ones
      const existingMap = new Map(prev.sessions.map((s) => [s.id, s]));
      for (const session of sessions) {
        const existing = existingMap.get(session.id);
        if (existing) {
          existingMap.set(session.id, { ...existing, ...session, entries: existing.entries });
        } else {
          existingMap.set(session.id, session);
        }
      }
      return { sessions: [...existingMap.values()] };
    });
  },

  setSessionEntries: (sessionId, entries) => {
    const session = get().getSession(sessionId);
    if (!session) return;

    set((prev) => {
      const idx = prev.sessions.findIndex((s) => s.id === sessionId);
      if (idx < 0) return prev;
      const next = [...prev.sessions];
      next[idx] = { ...session, entries: [...entries], updatedAt: Date.now() };
      return { sessions: next };
    });
  },

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

  setMessageCompletedAt: (sessionId, entryId, completedAt) => {
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

  setLoading: (sessionId, loading) => {
    const session = get().getSession(sessionId);
    if (!session) return;

    set((prev) => {
      const idx = prev.sessions.findIndex((s) => s.id === sessionId);
      if (idx < 0) return prev;
      const next = [...prev.sessions];
      next[idx] = { ...session, isLoading: loading };
      return { sessions: next };
    });
  },

  setStreamingEntryId: (sessionId, id) => {
    const session = get().getSession(sessionId);
    if (!session) return;

    set((prev) => {
      const idx = prev.sessions.findIndex((s) => s.id === sessionId);
      if (idx < 0) return prev;
      const next = [...prev.sessions];
      next[idx] = { ...session, streamingEntryId: id };
      return { sessions: next };
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

  hydrate: (sessionId, snapshot) => {
    const existing = get().getSession(sessionId);
    const toolStates =
      snapshot.toolStates instanceof Map
        ? new Map(snapshot.toolStates)
        : new Map((snapshot.toolStates as ToolExecutionState[]).map((s) => [s.toolCallId, s]));

    const session: AgentSession = existing
      ? {
          ...existing,
          entries: [...snapshot.entries],
          cwd: snapshot.cwd,
          model: snapshot.model ?? undefined,
          toolStates,
          status: "idle",
        }
      : {
          id: sessionId,
          name: "",
          cwd: snapshot.cwd,
          parentSessionId: null,
          leafEntryId: null,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          entries: [...snapshot.entries],
          model: snapshot.model ?? undefined,
          isLoading: false,
          streamingEntryId: undefined,
          toolStates,
          status: "idle",
        };

    set((prev) => {
      const idx = prev.sessions.findIndex((s) => s.id === sessionId);
      const next = [...prev.sessions];
      if (idx >= 0) {
        next[idx] = session;
      } else {
        next.push(session);
      }
      return { sessions: next };
    });
  },

  reset: () =>
    set({
      activeSessionId: null,
      sessions: [],
    }),
}));
