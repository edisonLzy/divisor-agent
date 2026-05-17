import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type { AssistantMessage } from "@mariozechner/pi-ai";
import { Entry, Session } from "@renderer/apis/sessions";
import { isAgentMessageEntry } from "@renderer/lib/is";
import type { AvailableModel } from "@shared/models-ipc";
import { v4 as uuidv4 } from "uuid";
import { createStore } from "zustand/vanilla";

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

export interface AgentSession extends Session {
  /** Timeline entries (messages, model changes, etc.) */
  entries: AgentSessionEntry[];
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
export type AgentSessionEntry = AgentMessageEntry | AgentModalChangedEntry;

// ── Session State ─────────────────────────────────────────────────────────────
export interface SessionsState {
  selectedSessionId: AgentSession["id"] | null;
  sessions: AgentSession[];
}

// ── Session Actions ───────────────────────────────────────────────────────────
export interface SessionActions {
  /** Get a session by ID, or undefined if not found */
  getSession: (sessionId: string) => AgentSession | undefined;
  /** Set the currently selected session */
  setSelectedSessionId: (id: string | null) => void;
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
  /** Update the currently selected model for this session */
  setModel: (sessionId: string, model: AvailableModel) => void;
  /** Update the current working directory */
  setCwd: (sessionId: string, cwd: string) => void;
}

// ── Store Implementation ──────────────────────────────────────────────────────

export const sessionStore = createStore<SessionsState & SessionActions>()((set, get) => ({
  selectedSessionId: null,
  sessions: [],

  getSession: (sessionId) => {
    return get().sessions.find((s) => s.id === sessionId);
  },

  setSelectedSessionId: (id) => set({ selectedSessionId: id }),

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
      const idx = prev.sessions.indexOf(session);
      const next = [...prev.sessions];
      next[idx] = { ...session, entries: [...session.entries, messageEntry] };
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
      const idx = prev.sessions.indexOf(session);
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
      const idx = prev.sessions.indexOf(session);
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
      const idx = prev.sessions.indexOf(session);
      const next = [...prev.sessions];
      next[idx] = { ...session, toolStates };
      return { sessions: next };
    });
  },

  setLoading: (sessionId, loading) => {
    const session = get().getSession(sessionId);
    if (!session) return;

    set((prev) => {
      const idx = prev.sessions.indexOf(session);
      const next = [...prev.sessions];
      next[idx] = { ...session, isLoading: loading };
      return { sessions: next };
    });
  },

  setStreamingEntryId: (sessionId, id) => {
    const session = get().getSession(sessionId);
    if (!session) return;

    set((prev) => {
      const idx = prev.sessions.indexOf(session);
      const next = [...prev.sessions];
      next[idx] = { ...session, streamingEntryId: id };
      return { sessions: next };
    });
  },

  setModel: (sessionId, model) => {
    const session = get().getSession(sessionId);
    if (!session) return;

    set((prev) => {
      const idx = prev.sessions.indexOf(session);
      const next = [...prev.sessions];
      next[idx] = { ...session, model };
      return { sessions: next };
    });
  },

  setCwd: (sessionId, cwd) => {
    const session = get().getSession(sessionId);
    if (!session) return;

    set((prev) => {
      const idx = prev.sessions.indexOf(session);
      const next = [...prev.sessions];
      next[idx] = { ...session, cwd };
      return { sessions: next };
    });
  },
}));
