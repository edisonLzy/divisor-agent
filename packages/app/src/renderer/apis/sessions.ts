import { request } from "@renderer/lib/request";

// ── Shared Types ────────────────────────────────────────────────────────────

export interface Session {
  id: string;
  name: string;
  cwd: string;
  workspaceId: string | null;
  parentSessionId: string | null;
  leafEntryId: string | null;
  createdAt: number;
  updatedAt: number;
  isTop: boolean;
}

export interface Entry {
  id: string;
  sessionId: string;
  parentId: string | null;
  type: "message" | "model_change";
  timestamp: number;
  data: Record<string, unknown>;
}

// ── Workspace Types ──────────────────────────────────────────────────────────

export interface Workspace {
  id: string;
  name: string;
  systemPrompt: string | null;
  context: Record<string, unknown> | null;
  isTop: boolean;
  createdAt: number;
  updatedAt: number;
}

// ── Create Session ──────────────────────────────────────────────────────────

export interface CreateSessionRequest {
  id?: string;
  name?: string;
  workspaceId?: string | null;
  parentSessionId?: string | null;
}

export type CreateSessionResponse = Session;

export async function createSession(req: CreateSessionRequest): Promise<CreateSessionResponse> {
  const { data } = await request.post<CreateSessionResponse>("/v1/agent/session", req);
  return data;
}

// ── List Sessions ───────────────────────────────────────────────────────────

export interface ListSessionsParams {
  workspaceId?: string | null;
  isTop?: boolean;
  limit?: number;
  offset?: number;
}

export interface PaginatedSessionsResponse {
  sessions: Session[];
  hasMore: boolean;
  limit: number;
  offset: number;
}

export async function listSessions(
  params?: ListSessionsParams,
): Promise<PaginatedSessionsResponse> {
  const { data } = await request.get<PaginatedSessionsResponse>("/v1/agent/sessions", { params });
  return data;
}

// ── Get Session ─────────────────────────────────────────────────────────────

export async function getSession(sessionId: string): Promise<Session> {
  const { data } = await request.get<Session>(`/v1/agent/session/${sessionId}`);
  return data;
}

// ── Get Session Entries ──────────────────────────────────────────────────────

export type GetSessionEntriesResponse = Entry[];

export async function getSessionEntries(sessionId: string): Promise<GetSessionEntriesResponse> {
  const { data } = await request.get<GetSessionEntriesResponse>(
    `/v1/agent/session/${sessionId}/entries`,
  );
  return data;
}

// ── Rename Session ──────────────────────────────────────────────────────────

export interface RenameSessionRequest {
  id: string;
  name: string;
}

export async function renameSession(req: RenameSessionRequest): Promise<{ success: boolean }> {
  const { data } = await request.patch<{ success: boolean }>(`/v1/agent/session/${req.id}/rename`, {
    name: req.name,
  });
  return data;
}

// ── Delete Session ──────────────────────────────────────────────────────────

export interface DeleteSessionRequest {
  id: string;
}

export async function deleteSession(req: DeleteSessionRequest): Promise<{ success: boolean }> {
  const { data } = await request.delete<{ success: boolean }>(`/v1/agent/session/${req.id}`);
  return data;
}

// ── Pin Session ──────────────────────────────────────────────────────────────

export async function pinSession(
  sessionId: string,
  req: { isTop: boolean },
): Promise<{ success: boolean }> {
  const { data } = await request.patch<{ success: boolean }>(
    `/v1/agent/session/${sessionId}/pin`,
    req,
  );
  return data;
}

// ── Assign Session Workspace ─────────────────────────────────────────────────

export async function assignSessionWorkspace(
  sessionId: string,
  req: { workspaceId: string | null },
): Promise<{ success: boolean }> {
  const { data } = await request.patch<{ success: boolean }>(
    `/v1/agent/session/${sessionId}/workspace`,
    req,
  );
  return data;
}

// ── Set Leaf ────────────────────────────────────────────────────────────────

export interface SetLeafRequest {
  sessionId: string;
  entryId: string;
}

export async function setLeaf(req: SetLeafRequest): Promise<{ success: boolean }> {
  const { data } = await request.put<{ success: boolean }>(
    `/v1/agent/session/${req.sessionId}/leaf`,
    {
      entryId: req.entryId,
    },
  );
  return data;
}

// ── Append Entries ──────────────────────────────────────────────────────────

export interface AppendEntriesRequest {
  sessionId: string;
  entries: Array<{
    id: string;
    parentId: string | null;
    type: "message" | "model_change";
    data: Record<string, unknown>;
  }>;
}

export interface AppendEntriesResponse {
  entries: Entry[];
}

export async function appendEntries(req: AppendEntriesRequest): Promise<AppendEntriesResponse> {
  const { data } = await request.post<AppendEntriesResponse>(
    `/v1/agent/session/${req.sessionId}/entries`,
    { entries: req.entries },
  );
  return data;
}

// ── List Workspaces ──────────────────────────────────────────────────────────

export async function listWorkspaces(params?: { isTop?: boolean }): Promise<Workspace[]> {
  const { data } = await request.get<Workspace[]>("/v1/agent/workspaces", { params });
  return data;
}

// ── Create Workspace ─────────────────────────────────────────────────────────

export interface CreateWorkspaceRequest {
  name: string;
  systemPrompt?: string | null;
  context?: Record<string, unknown> | null;
}

export async function createWorkspace(req: CreateWorkspaceRequest): Promise<Workspace> {
  const { data } = await request.post<Workspace>("/v1/agent/workspace", req);
  return data;
}

// ── Update Workspace ─────────────────────────────────────────────────────────

export interface UpdateWorkspaceRequest {
  name?: string;
  systemPrompt?: string | null;
  context?: Record<string, unknown> | null;
}

export async function updateWorkspace(id: string, req: UpdateWorkspaceRequest): Promise<Workspace> {
  const { data } = await request.patch<Workspace>(`/v1/agent/workspace/${id}`, req);
  return data;
}

// ── Delete Workspace ─────────────────────────────────────────────────────────

export async function deleteWorkspace(id: string): Promise<{ success: boolean }> {
  const { data } = await request.delete<{ success: boolean }>(`/v1/agent/workspace/${id}`);
  return data;
}

// ── Pin Workspace ────────────────────────────────────────────────────────────

export async function pinWorkspace(
  id: string,
  req: { isTop: boolean },
): Promise<{ success: boolean }> {
  const { data } = await request.patch<{ success: boolean }>(`/v1/agent/workspace/${id}/pin`, req);
  return data;
}
