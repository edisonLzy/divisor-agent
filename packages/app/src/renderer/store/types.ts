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

export interface SideChatArtifactContent {
  pendingPrompt: string;
  model?: AvailableModel;
  entries: SessionEntry[];
  status: SessionStatus;
  toolStates: Map<string, ToolExecutionState>;
  context: SideChatContext;
  createdAt: number;
}

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
  removeArtifact: (sessionId: string, artifactId: string) => void;
  reorderArtifacts: (sessionId: string, sourceIndex: number, targetIndex: number) => void;
  upsertArtifact: <TContent = unknown>(
    sessionId: string,
    artifact: Omit<ArtifactRecord<TContent>, "content" | "name" | "updatedAt"> &
      Partial<Pick<ArtifactRecord<TContent>, "content" | "name">>,
  ) => void;

  getSideChatArtifact: (sideChatId: string) => {
    artifact: SideChatArtifactRecord;
    mainSessionId: string;
  } | null;
  isSideChatArtifactSession: (sessionId: string) => boolean;
  createSideChatArtifact: (
    mainSessionId: string,
    context: SideChatContext,
    model: AvailableModel | undefined,
    pendingPrompt: string,
  ) => string;
  appendSideChatArtifactEntry: (
    mainSessionId: string,
    artifactId: string,
    message: AgentMessageData,
  ) => string;
  updateSideChatArtifactEntry: (
    mainSessionId: string,
    artifactId: string,
    entryId: string,
    message: AssistantMessage,
  ) => void;
  setSideChatArtifactToolState: (
    mainSessionId: string,
    artifactId: string,
    toolCallId: string,
    state: ToolExecutionState,
  ) => void;
  setSideChatArtifactStatus: (
    mainSessionId: string,
    artifactId: string,
    status: SessionStatus,
  ) => void;
  setSideChatArtifactStreamingEntryId: (artifactId: string, entryId: string | undefined) => void;
  setSideChatArtifactStreamingCompletedAt: (mainSessionId: string, artifactId: string) => void;
}

export type SessionsStoreState = SessionsSlice & EntriesSlice & PermissionSlice & ArtifactSlice;
