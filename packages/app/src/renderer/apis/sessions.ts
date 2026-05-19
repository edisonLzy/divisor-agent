import { request } from "@renderer/lib/request";

// ── Shared Types ────────────────────────────────────────────────────────────

export interface Session {
  id: string;
  name: string;
  cwd: string;
  parentSessionId: string | null;
  leafEntryId: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface Entry {
  id: string;
  sessionId: string;
  parentId: string | null;
  type: "message" | "model_change";
  timestamp: number;
  data: Record<string, unknown>;
}

// ── Create Session ──────────────────────────────────────────────────────────

export interface CreateSessionRequest {
  id?: string;
  name?: string;
  cwd?: string;
  parentSessionId?: string | null;
}

export type CreateSessionResponse = Session;

export async function createSession(req: CreateSessionRequest): Promise<CreateSessionResponse> {
  const { data } = await request.post<CreateSessionResponse>("/v1/agent/session", req);
  return data;
}

// ── List Sessions ───────────────────────────────────────────────────────────

export type ListSessionsResponse = Session[];

export async function listSessions(): Promise<ListSessionsResponse> {
  const { data } = await request.get<ListSessionsResponse>("/v1/agent/sessions");
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

export interface RenameSessionResponse {
  success: boolean;
}

export async function renameSession(req: RenameSessionRequest): Promise<RenameSessionResponse> {
  const { data } = await request.patch<RenameSessionResponse>(
    `/v1/agent/session/${req.id}/rename`,
    { name: req.name },
  );
  return data;
}

// ── Delete Session ──────────────────────────────────────────────────────────

export interface DeleteSessionRequest {
  id: string;
}

export interface DeleteSessionResponse {
  success: boolean;
}

export async function deleteSession(req: DeleteSessionRequest): Promise<DeleteSessionResponse> {
  const { data } = await request.delete<DeleteSessionResponse>(`/v1/agent/session/${req.id}`);
  return data;
}

// ── Set Leaf ────────────────────────────────────────────────────────────────

export interface SetLeafRequest {
  sessionId: string;
  entryId: string;
}

export interface SetLeafResponse {
  success: boolean;
}

export async function setLeaf(req: SetLeafRequest): Promise<SetLeafResponse> {
  const { data } = await request.put<SetLeafResponse>(`/v1/agent/session/${req.sessionId}/leaf`, {
    entryId: req.entryId,
  });
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
