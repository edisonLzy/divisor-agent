import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type { AssistantMessage, UserMessage } from "@mariozechner/pi-ai";
import type { Entry, Session } from "@renderer/apis/sessions";
import type { AvailableModel } from "@shared/models-ipc";
import type {
  PermissionMode,
  PermissionRequest,
  PermissionResolution,
} from "@shared/permissions-ipc";
import type { JSONContent } from "@tiptap/core";

// ── Artifact Types ──────────────────────────────────────────────────────────

export type ArtifactType = "side-chat" | string;

export interface SideChatContext {
  sourceEntryId: string;
  selectedText: string;
}

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

// ── EntryState (extracted from AgentSession + SideChatArtifactContent) ─────

export interface EntryState {
  entries: SessionEntry[];
  toolStates: Map<string, ToolExecutionState>;
  status: SessionStatus;
}

// ── AgentSession (slimmed — no entries/toolStates/status) ──────────────────

export interface AgentSession extends Session {
  model: AvailableModel | undefined;
}

export interface AgentPendingSession {
  id: symbol;
  workspaceId: string | null;
  createdAt: number;
}

// ── SideChatMeta (side-chat-specific metadata) ─────────────────────────────

export interface SideChatMeta {
  mainSessionId: string;
  context: SideChatContext;
  model?: AvailableModel;
  pendingPrompt: string;
  createdAt: number;
}

// ── SideChatArtifactContent (minimal — runtime data in EntryState) ────────

export interface SideChatArtifactContent {
  // Kept for ArtifactRecord<TContent> type compatibility.
  // All runtime state (entries, toolStates, status) is now in EntryState.
  // Metadata (model, context, pendingPrompt) is now in SideChatMeta.
}

// ── ArtifactRecord ─────────────────────────────────────────────────────────

export interface ArtifactRecord<TContent = unknown> {
  id: string;
  name: string;
  type: ArtifactType;
  content: TContent;
  props?: Record<string, unknown>;
  raw?: string;
  updatedAt: number;
}

export type SideChatArtifactRecord = ArtifactRecord<SideChatArtifactContent> & {
  type: "side-chat";
};

export interface SessionArtifactState {
  activeArtifactId: string | null;
  artifacts: ArtifactRecord[];
  isOpen: boolean;
}

// ── EntriesSlice (shared factory — used by both mainStore and sideChatStore)

export interface EntriesSlice {
  entryStates: Map<string, EntryState>;
  streamingEntryIds: Map<string, string>;

  getEntryState: (ownerId: string) => EntryState;

  appendMessageEntry: (ownerId: string, message: AgentMessageData) => string;
  updateMessageEntry: (ownerId: string, entryId: string, message: AssistantMessage) => void;
  setEntryStatus: (ownerId: string, entryIds: string[], status: EntryStatus) => void;
  setStreamingEntryId: (ownerId: string, id: string | undefined) => void;
  setStreamingEntryCompletedAt: (ownerId: string, completedAt: number) => void;
  setToolState: (ownerId: string, toolCallId: string, state: ToolExecutionState) => void;
  setSessionEntries: (ownerId: string, entries: SessionEntry[]) => void;
  setStatus: (ownerId: string, status: SessionStatus) => void;

  removeEntryState: (ownerId: string) => void;
}

// ── SessionsSlice (main agent, slimmed) ────────────────────────────────────

export interface SessionsSlice {
  activeSessionId: string | null;
  pendingSession: AgentPendingSession | null;
  sessions: AgentSession[];

  getSession: (sessionId: string) => AgentSession | undefined;
  appendSession: (session: Session) => void;
  setActiveSessionId: (sessionId: string | null) => void;
  createPendingSession: (workspaceId?: string | null) => AgentPendingSession;
  clearPendingSession: () => void;
  removeSession: (sessionId: string) => void;
  addSessions: (sessions: Session[]) => void;
  setModel: (sessionId: string, model: AvailableModel) => void;
  setCwd: (sessionId: string, cwd: string) => void;
}

// ── PermissionSlice ────────────────────────────────────────────────────────

export interface PermissionResolutionSnapshot {
  requestId: string;
  resolution: PermissionResolution;
  resolvedAt: number;
}

export interface SessionPermissionState {
  mode: PermissionMode;
  requests: PermissionRequest[];
  lastResolvedRequest?: PermissionResolutionSnapshot;
}

export interface PermissionSlice {
  permissionStates: Map<string, SessionPermissionState>;
  getPermissionState: (sessionId: string) => SessionPermissionState;
  setPermissionMode: (sessionId: string, mode: PermissionMode) => void;
  enqueuePermissionRequest: (sessionId: string, request: PermissionRequest) => void;
  resolvePermissionRequest: (
    sessionId: string,
    requestId: string,
    resolution: PermissionResolution,
  ) => void;
  clearPermissionState: (sessionId: string) => void;
}

// ── ArtifactSlice (main agent, simplified — no side-chat specifics) ───────

export interface ArtifactSlice {
  artifactStates: Map<string, SessionArtifactState>;
  getArtifactState: (sessionId: string) => SessionArtifactState;
  setArtifactPanelOpen: (sessionId: string, isOpen: boolean) => void;
  setActiveArtifactId: (sessionId: string, artifactId: string | null) => void;
  removeArtifact: (sessionId: string, artifactId: string) => void;
  reorderArtifacts: (sessionId: string, sourceIndex: number, targetIndex: number) => void;
  upsertArtifact: <TContent = unknown>(
    sessionId: string,
    artifact: Omit<ArtifactRecord<TContent>, "content" | "name" | "updatedAt"> &
      Partial<Pick<ArtifactRecord<TContent>, "content" | "name">>,
  ) => void;
}

// ── SideChatSlice ──────────────────────────────────────────────────────────

export interface SideChatSlice {
  sideChatMeta: Map<string, SideChatMeta>;

  getSideChatMeta: (sideChatId: string) => SideChatMeta | undefined;
  isSideChatSession: (sessionId: string) => boolean;
  initSideChat: (
    sideChatId: string,
    mainSessionId: string,
    context: SideChatContext,
    model: AvailableModel | undefined,
    pendingPrompt: string,
  ) => void;
  setSideChatModel: (sideChatId: string, model: AvailableModel) => void;
  removeSideChatMeta: (sideChatId: string) => void;
}

// ── Combined Store States ──────────────────────────────────────────────────

export type MainStoreState = EntriesSlice & SessionsSlice & PermissionSlice & ArtifactSlice;
export type SideChatStoreState = EntriesSlice & SideChatSlice;
