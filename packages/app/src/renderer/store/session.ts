import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type { AssistantMessage } from "@mariozechner/pi-ai";
import type { AvailableModel } from "@shared/models-ipc";
import { v4 as uuidv4 } from "uuid";
import { createStore } from "zustand/vanilla";

/**
 * Discriminator for SessionEntry — determines how `data` should be interpreted.
 * - "message":      agent message (user / assistant / toolResult)
 * - "model_change": user switched the active model mid-session
 */
export type EntryType = "message" | "model_change";

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

/**
 * A single immutable timeline entry in the session.
 * Entries form a linked list via `parentId` so the conversation tree can be
 * reconstructed even if the flat list is reordered or filtered.
 */
export interface SessionEntry {
  /** Unique ID for this entry (UUID v4) */
  id: string;
  /** ID of the preceding entry, or null if this is the first entry */
  parentId: string | null;
  /** Determines the shape of `data` */
  type: EntryType;
  /** Unix timestamp in milliseconds when this entry was created */
  timestamp: number;
  /** Entry payload — either an agent message or a model-change record */
  data: AgentMessage | ModelChangedData;
}

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

// ── Session State ─────────────────────────────────────────────────────────────

export interface SessionState {
  /**
   * Ordered list of session entries (messages + model changes).
   * This is the single source of truth for the conversation timeline.
   */
  entries: SessionEntry[];
  /** Current working directory for tool execution (e.g. file reads, terminal commands) */
  cwd: string;
  /** The model currently selected for this session, null if not yet chosen */
  model: AvailableModel | null;
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

// ── Session Actions ───────────────────────────────────────────────────────────

export interface SessionActions {
  /**
   * Append a new message entry to the timeline.
   * Links to the previous entry via `parentId` and stamps with `Date.now()`.
   * Returns the generated entry ID (used to set `streamingEntryId` for assistant messages).
   */
  appendMessageEntry: (message: AgentMessage) => string;
  /**
   * Update the `data` field of an existing entry.
   * Used during streaming: each `message_update` event replaces the entry's
   * partial AssistantMessage with the latest accumulated state.
   * No-op if `entryId` is not found.
   */
  updateMessageEntry: (entryId: string, message: AssistantMessage) => void;
  /**
   * Create or overwrite the execution state for a specific tool call.
   * Called on tool_execution_start (create), tool_execution_update (progress),
   * and tool_execution_end (final result).
   */
  setToolState: (toolCallId: string, state: ToolExecutionState) => void;
  /** Toggle the agent loading indicator */
  setLoading: (loading: boolean) => void;
  /**
   * Set or clear the streaming entry ID.
   * Set to an entry ID when assistant streaming begins, cleared when it ends.
   */
  setStreamingEntryId: (id: string | undefined) => void;
  /** Update the currently selected model for this session */
  setModel: (model: AvailableModel) => void;
  /** Update the current working directory */
  setCwd: (cwd: string) => void;
  /** Reset the entire session store back to its initial empty state */
  reset: () => void;
}

// ── Initial State ─────────────────────────────────────────────────────────────

const initialState: SessionState = {
  entries: [],
  cwd: "",
  model: null,
  isLoading: false,
  streamingEntryId: undefined,
  toolStates: new Map(),
};

// ── Store Implementation ──────────────────────────────────────────────────────

export const sessionStore = createStore<SessionState & SessionActions>()((set, get) => ({
  ...initialState,

  appendMessageEntry: (message) => {
    const id = uuidv4();
    const { entries } = get();
    // Link to the last entry to maintain conversation order
    const parentId = entries.length > 0 ? entries[entries.length - 1].id : null;

    set((prev) => ({
      entries: [
        ...prev.entries,
        {
          id,
          parentId,
          type: "message" as const,
          timestamp: Date.now(),
          data: message,
        },
      ],
    }));

    return id;
  },

  updateMessageEntry: (entryId, message) => {
    set((prev) => {
      const index = prev.entries.findIndex((e) => e.id === entryId);
      if (index < 0) return prev;

      const next = [...prev.entries];
      next[index] = { ...next[index], data: message };
      return { entries: next };
    });
  },

  setToolState: (toolCallId, state) => {
    set((prev) => {
      const next = new Map(prev.toolStates);
      next.set(toolCallId, state);
      return { toolStates: next };
    });
  },

  setLoading: (loading) => set({ isLoading: loading }),
  setStreamingEntryId: (id) => set({ streamingEntryId: id }),
  setModel: (model) => set({ model }),
  setCwd: (cwd) => set({ cwd }),
  reset: () => set(initialState),
}));
