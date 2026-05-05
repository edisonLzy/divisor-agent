import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { createLogger } from '../../shared/logger.js';
import type { SessionMap, SessionNode, HistoryMessage, HistoryResponse } from '../../types/session.js';

const logger = createLogger('session-repository');
const BASE_DIR = path.join(os.homedir(), '.pi-agent');
const SESSION_MAP_PATH = path.join(BASE_DIR, 'session-map.json');
const SESSIONS_DIR = path.join(BASE_DIR, 'sessions');

async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

async function readSessionMap(): Promise<SessionMap> {
  try {
    const raw = await fs.readFile(SESSION_MAP_PATH, 'utf-8');
    return JSON.parse(raw) as SessionMap;
  } catch {
    return { version: '1', sessions: [] };
  }
}

async function writeSessionMap(map: SessionMap): Promise<void> {
  await ensureDir(BASE_DIR);
  const tmp = `${SESSION_MAP_PATH}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(map, null, 2), 'utf-8');
  await fs.rename(tmp, SESSION_MAP_PATH);
}

function buildTree(sessions: Omit<SessionNode, 'children'>[]): SessionNode[] {
  const map = new Map<string, SessionNode>();
  sessions.forEach(s => map.set(s.id, { ...s, children: [] }));

  const roots: SessionNode[] = [];
  map.forEach(node => {
    if (node.parentId && map.has(node.parentId)) {
      map.get(node.parentId)!.children!.push(node);
    } else {
      roots.push(node);
    }
  });

  // Clean up empty children arrays
  map.forEach(node => {
    if (node.children?.length === 0) delete node.children;
  });

  return roots;
}

export async function listSessions(): Promise<SessionNode[]> {
  const map = await readSessionMap();
  const sorted = [...map.sessions].sort((a, b) => a.timestamp - b.timestamp);
  return buildTree(sorted);
}

export async function createSession(opts: {
  id?: string;
  parentId?: string | null;
  name?: string;
}): Promise<SessionNode> {
  const id = opts.id ?? randomUUID();
  const node: Omit<SessionNode, 'children'> = {
    id,
    parentId: opts.parentId ?? null,
    name: opts.name ?? `Session ${new Date().toLocaleString()}`,
    timestamp: Date.now(),
  };

  const map = await readSessionMap();
  map.sessions.push(node);
  await writeSessionMap(map);

  const sessionDir = path.join(SESSIONS_DIR, id);
  await ensureDir(sessionDir);
  await fs.writeFile(
    path.join(sessionDir, 'meta.json'),
    JSON.stringify(node, null, 2),
    'utf-8',
  );

  logger.info({ id }, 'Session created');
  return node;
}

export async function renameSession(id: string, name: string): Promise<void> {
  const map = await readSessionMap();
  const session = map.sessions.find((s: Omit<SessionNode, 'children'>) => s.id === id);
  if (!session) throw new Error(`Session not found: ${id}`);
  session.name = name;
  await writeSessionMap(map);
}

export async function deleteSession(id: string): Promise<void> {
  const map = await readSessionMap();
  const initialLength = map.sessions.length;
  map.sessions = map.sessions.filter((s: Omit<SessionNode, 'children'>) => s.id !== id);
  if (map.sessions.length === initialLength) throw new Error(`Session not found: ${id}`);
  await writeSessionMap(map);

  const sessionDir = path.join(SESSIONS_DIR, id);
  try {
    await fs.rm(sessionDir, { recursive: true, force: true });
  } catch (err) {
    logger.warn({ id, err }, 'Could not remove session directory');
  }
}

export async function getSessionHistory(
  sessionId: string,
  cursor?: string,
  limit = 50,
): Promise<HistoryResponse> {
  const messagesPath = path.join(SESSIONS_DIR, sessionId, 'messages.jsonl');
  let raw: string;
  try {
    raw = await fs.readFile(messagesPath, 'utf-8');
  } catch {
    return { messages: [], nextCursor: null };
  }

  const lines = raw.trim().split('\n').filter(Boolean);
  const messages: HistoryMessage[] = lines.map(l => JSON.parse(l) as HistoryMessage);

  let startIndex = 0;
  if (cursor) {
    const idx = messages.findIndex(m => m.id === cursor);
    if (idx !== -1) startIndex = idx + 1;
  }

  const slice = messages.slice(startIndex, startIndex + limit);
  const nextCursor = startIndex + limit < messages.length
    ? slice[slice.length - 1]?.id ?? null
    : null;

  return { messages: slice, nextCursor };
}

export async function appendMessage(sessionId: string, message: HistoryMessage): Promise<void> {
  const dir = path.join(SESSIONS_DIR, sessionId);
  await ensureDir(dir);
  const line = JSON.stringify(message) + '\n';
  await fs.appendFile(path.join(dir, 'messages.jsonl'), line, 'utf-8');
}

export async function forkSession(opts: {
  parentSessionId: string;
  messageId?: string;
  name?: string;
}): Promise<SessionNode> {
  const { parentSessionId, messageId, name } = opts;

  // Read and optionally truncate parent messages
  const messagesPath = path.join(SESSIONS_DIR, parentSessionId, 'messages.jsonl');
  let messages: HistoryMessage[] = [];
  try {
    const raw = await fs.readFile(messagesPath, 'utf-8');
    messages = raw.trim().split('\n').filter(Boolean).map(l => JSON.parse(l) as HistoryMessage);
  } catch {
    // parent may have no messages yet
  }

  if (messageId) {
    const idx = messages.findIndex(m => m.id === messageId);
    if (idx !== -1) messages = messages.slice(0, idx + 1);
  }

  // Create new session in the map
  const map = await readSessionMap();
  const parentEntry = map.sessions.find((s: Omit<SessionNode, 'children'>) => s.id === parentSessionId);
  const newId = randomUUID();
  const newNode: Omit<SessionNode, 'children'> = {
    id: newId,
    parentId: parentSessionId,
    name: name ?? `Fork of ${parentEntry?.name ?? parentSessionId} – ${new Date().toLocaleString()}`,
    timestamp: Date.now(),
  };

  map.sessions.push(newNode);
  await writeSessionMap(map);

  const newSessionDir = path.join(SESSIONS_DIR, newId);
  await ensureDir(newSessionDir);
  await fs.writeFile(path.join(newSessionDir, 'meta.json'), JSON.stringify(newNode, null, 2), 'utf-8');

  // Write the inherited messages with updated sessionId
  if (messages.length > 0) {
    const updatedMessages = messages.map(m => ({ ...m, sessionId: newId }));
    const content = updatedMessages.map(m => JSON.stringify(m)).join('\n') + '\n';
    await fs.writeFile(path.join(newSessionDir, 'messages.jsonl'), content, 'utf-8');
  }

  logger.info({ newId, parentSessionId, messageId }, 'Session forked');
  return newNode;
}
