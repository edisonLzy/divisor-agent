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

// ── Side Chat Types ─────────────────────────────────────────────────────────

export interface SideChatContext {
  sourceEntryId: string;
  selectedText: string;
}

export interface SideChatSession {
  id: string;
  name: string;
  model: AvailableModel;
  entries: SessionEntry[];
  status: SessionStatus;
  toolStates: Map<string, ToolExecutionState>;
  context: SideChatContext;
  createdAt: number;
}

export interface SideChatState {
  sideChats: SideChatSession[];
  activeSideChatId: string | null;
  isPanelOpen: boolean;
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

export interface AgentSession extends Session {
  entries: SessionEntry[];
  model: AvailableModel | undefined;
  toolStates: Map<string, ToolExecutionState>;
  status: SessionStatus;
}

export interface AgentPendingSession {
  id: symbol;
  workspaceId: string | null;
  createdAt: number;
}

export interface ArtifactRecord {
  id: string;
  props: Record<string, unknown>;
  raw: string;
  type: string;
  updatedAt: number;
}

export interface SessionArtifactState {
  activeArtifactId: string | null;
  artifacts: ArtifactRecord[];
  isOpen: boolean;
}

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
  setSessionStatus: (sessionId: string, status: SessionStatus) => void;
  setModel: (sessionId: string, model: AvailableModel) => void;
  setCwd: (sessionId: string, cwd: string) => void;
}

export interface EntriesSlice {
  streamingEntryIds: Map<string, string>;
  setStreamingEntryId: (sessionId: string, id: string | undefined) => void;
  appendMessageEntry: (sessionId: string, message: AgentMessageData) => string;
  updateMessageEntry: (sessionId: string, entryId: string, message: AssistantMessage) => void;
  setEntryStatus: (sessionId: string, entryIds: string[], status: EntryStatus) => void;
  setStreamingEntryCompletedAt: (sessionId: string, completedAt: number) => void;
  setToolState: (sessionId: string, toolCallId: string, state: ToolExecutionState) => void;
  setSessionEntries: (sessionId: string, entries: SessionEntry[]) => void;
}

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

export interface ArtifactSlice {
  artifactStates: Map<string, SessionArtifactState>;
  getArtifactState: (sessionId: string) => SessionArtifactState;
  setArtifactPanelOpen: (sessionId: string, isOpen: boolean) => void;
  setActiveArtifactId: (sessionId: string, artifactId: string | null) => void;
  upsertArtifact: (sessionId: string, artifact: Omit<ArtifactRecord, "updatedAt">) => void;
}

export interface SideChatSlice {
  sideChatStates: Map<string, SideChatState>;
  sideChatToMainMap: Map<string, string>;

  getSideChatState: (mainSessionId: string) => SideChatState;
  isSideChatSession: (sessionId: string) => boolean;
  getMainSessionId: (sideChatId: string) => string | undefined;

  createSideChat: (
    mainSessionId: string,
    context: SideChatContext,
    model: AvailableModel,
  ) => string;

  closeSideChat: (mainSessionId: string, sideChatId: string) => void;
  setActiveSideChat: (mainSessionId: string, sideChatId: string | null) => void;
  setSideChatPanelOpen: (mainSessionId: string, isOpen: boolean) => void;

  appendSideChatEntry: (
    mainSessionId: string,
    sideChatId: string,
    message: AgentMessageData,
  ) => string;
  updateSideChatEntry: (
    mainSessionId: string,
    sideChatId: string,
    entryId: string,
    message: AssistantMessage,
  ) => void;
  setSideChatToolState: (
    mainSessionId: string,
    sideChatId: string,
    toolCallId: string,
    state: ToolExecutionState,
  ) => void;
  setSideChatStatus: (mainSessionId: string, sideChatId: string, status: SessionStatus) => void;
  setSideChatStreamingEntryId: (
    mainSessionId: string,
    sideChatId: string,
    entryId: string | undefined,
  ) => void;
  setSideChatStreamingCompletedAt: (mainSessionId: string, sideChatId: string) => void;

  /** Clean up all side chats for a main session (destroys runtimes via callback) */
  destroySideChatsForSession: (mainSessionId: string, destroyRuntime: (id: string) => void) => void;
}

export interface PendingInsertSlice {
  pendingInsertText: Map<string, string>;
  setPendingInsertText: (sessionId: string, text: string | null) => void;
}

export type SessionsStoreState = SessionsSlice &
  EntriesSlice &
  PermissionSlice &
  ArtifactSlice &
  SideChatSlice &
  PendingInsertSlice;
