import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createLogger } from "../../shared/logger.js";
import type { AppendEntryInput, EntryOutput, SessionContextOutput } from "./types.js";

const logger = createLogger("sessions-service");
const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const DATA_FILE_PATH = join(PACKAGE_ROOT, ".data", "sessions.json");

interface PersistedSessionRecord {
  id: string;
  name: string;
  cwd: string;
  parentSessionId: string | null;
  leafEntryId: string | null;
  createdAt: string;
  updatedAt: string;
}

interface PersistedEntryRecord {
  id: string;
  sessionId: string;
  parentId: string | null;
  type: string;
  timestamp: string;
  data: Record<string, unknown>;
}

interface PersistedSessionsState {
  sessions: PersistedSessionRecord[];
  entries: PersistedEntryRecord[];
}

let stateCache: PersistedSessionsState | null = null;

// ── Helpers ─────────────────────────────────────────────────────────────────

function createEmptyState(): PersistedSessionsState {
  return {
    sessions: [],
    entries: [],
  };
}

async function readState(): Promise<PersistedSessionsState> {
  if (stateCache) {
    return stateCache;
  }

  try {
    const content = await readFile(DATA_FILE_PATH, "utf8");
    const parsed = JSON.parse(content) as Partial<PersistedSessionsState>;
    stateCache = {
      sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
      entries: Array.isArray(parsed.entries) ? parsed.entries : [],
    };
    return stateCache;
  } catch (error) {
    const isFileMissing =
      typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";

    if (!isFileMissing) {
      logger.error({ error }, "Failed to read session storage file");
    }

    stateCache = createEmptyState();
    return stateCache;
  }
}

async function writeState(state: PersistedSessionsState): Promise<void> {
  await mkdir(dirname(DATA_FILE_PATH), { recursive: true });
  await writeFile(DATA_FILE_PATH, JSON.stringify(state, null, 2), "utf8");
  stateCache = state;
}

function toEntryOutput(row: PersistedEntryRecord): EntryOutput {
  return {
    id: row.id,
    sessionId: row.sessionId,
    parentId: row.parentId,
    type: row.type,
    timestamp: new Date(row.timestamp),
    data: (row.data ?? {}) as Record<string, unknown>,
  };
}

function toSessionOutput(row: PersistedSessionRecord) {
  return {
    id: row.id,
    name: row.name,
    cwd: row.cwd,
    parentSessionId: row.parentSessionId,
    leafEntryId: row.leafEntryId,
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
  };
}

function sortSessionsByUpdatedAt(left: PersistedSessionRecord, right: PersistedSessionRecord) {
  return Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
}

function sortEntriesByTimestamp(left: PersistedEntryRecord, right: PersistedEntryRecord) {
  return Date.parse(left.timestamp) - Date.parse(right.timestamp);
}

function extractTextFromContent(content: unknown): string {
  if (typeof content === "string") {
    return content.trim();
  }

  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .map((block) => {
      if (typeof block !== "object" || block === null || !("text" in block)) {
        return "";
      }

      const text = (block as { text?: unknown }).text;
      return typeof text === "string" ? text.trim() : "";
    })
    .filter(Boolean)
    .join(" ")
    .trim();
}

function deriveSessionName(entryData: Record<string, unknown>): string | null {
  if (entryData.role !== "user") {
    return null;
  }

  const text = extractTextFromContent(entryData.content);
  if (!text) {
    return null;
  }

  return text.length <= 40 ? text : `${text.slice(0, 37).trimEnd()}...`;
}

// ── Session CRUD ────────────────────────────────────────────────────────────

export async function createSession(opts: {
  id?: string;
  name?: string;
  cwd?: string;
  parentSessionId?: string | null;
}) {
  const state = await readState();
  const now = new Date().toISOString();
  const row: PersistedSessionRecord = {
    id: opts.id ?? randomUUID(),
    name: opts.name ?? "",
    cwd: opts.cwd ?? "",
    parentSessionId: opts.parentSessionId ?? null,
    leafEntryId: null,
    createdAt: now,
    updatedAt: now,
  };

  state.sessions.unshift(row);
  await writeState(state);

  logger.info({ id: row.id }, "Session created");
  return toSessionOutput(row);
}

export async function listSessions() {
  const state = await readState();

  return [...state.sessions].sort(sortSessionsByUpdatedAt).map(toSessionOutput);
}

export async function getSession(id: string) {
  const state = await readState();
  const row = state.sessions.find((session) => session.id === id);

  return row ? toSessionOutput(row) : null;
}

export async function renameSession(id: string, name: string) {
  const state = await readState();
  const row = state.sessions.find((session) => session.id === id);

  if (!row) {
    return;
  }

  row.name = name;
  row.updatedAt = new Date().toISOString();
  await writeState(state);
}

export async function deleteSession(id: string) {
  const state = await readState();
  state.sessions = state.sessions.filter((session) => session.id !== id);
  state.entries = state.entries.filter((entry) => entry.sessionId !== id);
  await writeState(state);
}

// ── Entry CRUD ──────────────────────────────────────────────────────────────

export async function appendEntry(input: AppendEntryInput): Promise<EntryOutput> {
  const state = await readState();
  const session = state.sessions.find((item) => item.id === input.sessionId);

  if (!session) {
    throw new Error(`Session ${input.sessionId} not found`);
  }

  const row: PersistedEntryRecord = {
    id: randomUUID(),
    sessionId: input.sessionId,
    parentId: input.parentId,
    type: input.type,
    timestamp: new Date().toISOString(),
    data: input.data as Record<string, unknown>,
  };

  state.entries.push(row);
  session.leafEntryId = row.id;
  session.updatedAt = row.timestamp;

  const derivedName = deriveSessionName(row.data);
  if (derivedName && session.name.trim() === "") {
    session.name = derivedName;
  }

  await writeState(state);

  logger.info({ entryId: row.id, sessionId: input.sessionId, type: input.type }, "Entry appended");
  return toEntryOutput(row);
}

export async function getEntry(id: string): Promise<EntryOutput | null> {
  const state = await readState();
  const row = state.entries.find((entry) => entry.id === id);

  return row ? toEntryOutput(row) : null;
}

export async function getEntries(sessionId: string): Promise<EntryOutput[]> {
  const state = await readState();
  const rows = state.entries
    .filter((entry) => entry.sessionId === sessionId)
    .sort(sortEntriesByTimestamp);

  return rows.map(toEntryOutput);
}

// ── Tree operations (recursive CTE) ─────────────────────────────────────────

/**
 * Get the branch path from a leaf entry to the root.
 * Uses a recursive CTE to walk up the parentId chain.
 */
export async function getBranch(sessionId: string, leafId?: string): Promise<EntryOutput[]> {
  let targetLeafId = leafId;

  if (!targetLeafId) {
    const session = await getSession(sessionId);
    if (!session?.leafEntryId) return [];
    targetLeafId = session.leafEntryId;
  }

  const state = await readState();
  const entryMap = new Map(
    state.entries
      .filter((entry) => entry.sessionId === sessionId)
      .map((entry) => [entry.id, entry]),
  );

  const branch: PersistedEntryRecord[] = [];
  let currentId: string | null | undefined = targetLeafId;

  while (currentId) {
    const currentEntry = entryMap.get(currentId);
    if (!currentEntry) {
      break;
    }

    branch.push(currentEntry);
    currentId = currentEntry.parentId;
  }

  branch.reverse();
  return branch.map(toEntryOutput);
}

/**
 * Build session context: collect messages along the path from leaf to root.
 */
export async function buildContext(
  sessionId: string,
  leafId?: string,
): Promise<SessionContextOutput> {
  const branch = await getBranch(sessionId, leafId);

  const messages: SessionContextOutput["messages"] = [];
  let model: SessionContextOutput["model"] = null;

  for (const entry of branch) {
    if (entry.type === "message") {
      const data = entry.data as { role: string; content: unknown };
      messages.push({
        id: entry.id,
        role: data.role,
        content: data.content,
        timestamp: entry.timestamp,
      });
    } else if (entry.type === "model_change") {
      const data = entry.data as { provider: string; modelId: string };
      model = { provider: data.provider, modelId: data.modelId };
    }
  }

  return { messages, model };
}

/**
 * Get direct children of an entry.
 */
export async function getChildren(parentId: string): Promise<EntryOutput[]> {
  const state = await readState();
  const rows = state.entries
    .filter((entry) => entry.parentId === parentId)
    .sort(sortEntriesByTimestamp);

  return rows.map(toEntryOutput);
}

// ── Branch & Rewind ─────────────────────────────────────────────────────────

/**
 * Move the session's leaf pointer to a specific entry.
 * Next appendEntry will create a child of that entry, forming a new branch.
 */
export async function setLeaf(sessionId: string, entryId: string): Promise<void> {
  const entry = await getEntry(entryId);
  if (!entry || entry.sessionId !== sessionId) {
    throw new Error(`Entry ${entryId} not found in session ${sessionId}`);
  }

  const state = await readState();
  const session = state.sessions.find((item) => item.id === sessionId);

  if (!session) {
    throw new Error(`Session ${sessionId} not found`);
  }

  session.leafEntryId = entryId;
  session.updatedAt = new Date().toISOString();
  await writeState(state);

  logger.info({ sessionId, entryId }, "Leaf moved");
}

/**
 * Rewind to a specific entry.
 * Moves the session's leaf pointer to the target entry.
 */
export async function rewind(sessionId: string, entryId: string): Promise<void> {
  await setLeaf(sessionId, entryId);
  logger.info({ sessionId, entryId }, "Rewind completed");
}
