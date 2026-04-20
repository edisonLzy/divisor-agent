import path from 'node:path';
import os from 'node:os';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createSession,
  forkSession,
  listSessions,
  appendMessage,
  getSessionHistory,
} from '../../../src/domain/sessions/service.js';
import type { HistoryMessage } from '../../../src/domain/sessions/types.js';

// ── fs/promises mock (hoisted so vi.mock factory can reference it) ─────────

const mockFs = vi.hoisted(() => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  rename: vi.fn(),
  mkdir: vi.fn(),
  appendFile: vi.fn(),
  rm: vi.fn(),
}));

vi.mock('node:fs/promises', () => ({ default: mockFs }));

// ── Path constants (mirror sessions/service.ts) ───────────────────────────

const BASE_DIR = path.join(os.homedir(), '.pi-agent');
const SESSION_MAP_PATH = path.join(BASE_DIR, 'session-map.json');
const SESSIONS_DIR = path.join(BASE_DIR, 'sessions');

// ── In-memory FS helper ───────────────────────────────────────────────────

let store: Map<string, string>;

function setupMemoryFs(): void {
  store = new Map();

  mockFs.readFile.mockImplementation(async (filePath: string) => {
    const content = store.get(filePath);
    if (content === undefined) {
      throw Object.assign(new Error(`ENOENT: no such file: ${filePath}`), { code: 'ENOENT' });
    }
    return content;
  });

  mockFs.writeFile.mockImplementation(async (filePath: string, data: string) => {
    store.set(filePath, data);
  });

  mockFs.rename.mockImplementation(async (from: string, to: string) => {
    const content = store.get(from);
    if (content !== undefined) {
      store.set(to, content);
      store.delete(from);
    }
  });

  mockFs.mkdir.mockResolvedValue(undefined);

  mockFs.appendFile.mockImplementation(async (filePath: string, data: string) => {
    store.set(filePath, (store.get(filePath) ?? '') + data);
  });

  mockFs.rm.mockResolvedValue(undefined);
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe('sessions/service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupMemoryFs();
  });

  describe('createSession', () => {
    it('creates a session with a generated id', async () => {
      const session = await createSession({});

      expect(session.id).toBeDefined();
      expect(session.parentId).toBeNull();
      expect(typeof session.name).toBe('string');
      expect(session.timestamp).toBeGreaterThan(0);
    });

    it('uses the provided id and name', async () => {
      const session = await createSession({ id: 'explicit-id', name: 'My Session' });

      expect(session.id).toBe('explicit-id');
      expect(session.name).toBe('My Session');
    });

    it('stores parentId when provided', async () => {
      await createSession({ id: 'parent' });
      const child = await createSession({ id: 'child', parentId: 'parent' });

      expect(child.parentId).toBe('parent');
    });

    it('persists session in session-map.json', async () => {
      await createSession({ id: 'persist-test' });

      const raw = store.get(SESSION_MAP_PATH);
      expect(raw).toBeDefined();
      const map = JSON.parse(raw!);
      expect(map.sessions.some((s: { id: string }) => s.id === 'persist-test')).toBe(true);
    });

    it('accumulates multiple sessions in the map', async () => {
      await createSession({ id: 's1' });
      await createSession({ id: 's2' });

      const map = JSON.parse(store.get(SESSION_MAP_PATH)!);
      expect(map.sessions).toHaveLength(2);
    });

    it('writes meta.json for the new session', async () => {
      await createSession({ id: 'meta-test' });

      const metaPath = path.join(SESSIONS_DIR, 'meta-test', 'meta.json');
      const raw = store.get(metaPath);
      expect(raw).toBeDefined();
      const meta = JSON.parse(raw!);
      expect(meta.id).toBe('meta-test');
    });
  });

  describe('listSessions', () => {
    it('returns an empty array when there are no sessions', async () => {
      const sessions = await listSessions();
      expect(sessions).toEqual([]);
    });

    it('returns a flat list when there are no parent-child relationships', async () => {
      await createSession({ id: 'r1' });
      await createSession({ id: 'r2' });

      const sessions = await listSessions();
      expect(sessions).toHaveLength(2);
      expect(sessions.every(s => !s.children || s.children.length === 0)).toBe(true);
    });

    it('nests children under their parent', async () => {
      await createSession({ id: 'root' });
      await createSession({ id: 'child', parentId: 'root' });

      const sessions = await listSessions();
      const root = sessions.find(s => s.id === 'root');

      expect(root).toBeDefined();
      expect(root?.children).toHaveLength(1);
      expect(root?.children?.[0].id).toBe('child');
    });
  });

  describe('appendMessage & getSessionHistory', () => {
    it('returns empty history when no messages file exists', async () => {
      await createSession({ id: 'empty-session' });

      const history = await getSessionHistory('empty-session');
      expect(history.messages).toEqual([]);
      expect(history.nextCursor).toBeNull();
    });

    it('appends and retrieves a message', async () => {
      await createSession({ id: 'msg-session' });

      const msg: HistoryMessage = {
        id: 'msg-1',
        sessionId: 'msg-session',
        role: 'user',
        blocks: [{ type: 'text', content: 'Hello' }],
        timestamp: Date.now(),
      };
      await appendMessage('msg-session', msg);

      const history = await getSessionHistory('msg-session');
      expect(history.messages).toHaveLength(1);
      expect(history.messages[0].id).toBe('msg-1');
      expect(history.messages[0].blocks[0]).toMatchObject({ type: 'text', content: 'Hello' });
    });

    it('paginates with limit and cursor', async () => {
      await createSession({ id: 'paginate-session' });

      const messages: HistoryMessage[] = Array.from({ length: 5 }, (_, i) => ({
        id: `msg-${i}`,
        sessionId: 'paginate-session',
        role: 'user' as const,
        blocks: [{ type: 'text' as const, content: `Message ${i}` }],
        timestamp: i,
      }));
      for (const m of messages) {
        await appendMessage('paginate-session', m);
      }

      const page1 = await getSessionHistory('paginate-session', undefined, 3);
      expect(page1.messages).toHaveLength(3);
      expect(page1.nextCursor).toBe('msg-2');

      const page2 = await getSessionHistory('paginate-session', 'msg-2', 3);
      expect(page2.messages).toHaveLength(2);
      expect(page2.nextCursor).toBeNull();
    });

    it('returns empty history when cursor points to the last message', async () => {
      await createSession({ id: 'cursor-end-session' });

      const msg: HistoryMessage = {
        id: 'only-msg',
        sessionId: 'cursor-end-session',
        role: 'user',
        blocks: [],
        timestamp: 1,
      };
      await appendMessage('cursor-end-session', msg);

      const history = await getSessionHistory('cursor-end-session', 'only-msg', 10);
      expect(history.messages).toEqual([]);
      expect(history.nextCursor).toBeNull();
    });
  });

  describe('forkSession', () => {
    it('creates a child session with all parent messages', async () => {
      await createSession({ id: 'fork-parent' });

      const msg: HistoryMessage = {
        id: 'orig-msg',
        sessionId: 'fork-parent',
        role: 'user',
        blocks: [{ type: 'text', content: 'Original' }],
        timestamp: 1,
      };
      await appendMessage('fork-parent', msg);

      const fork = await forkSession({ parentSessionId: 'fork-parent' });

      expect(fork.id).not.toBe('fork-parent');
      expect(fork.parentId).toBe('fork-parent');

      const history = await getSessionHistory(fork.id);
      expect(history.messages).toHaveLength(1);
      expect(history.messages[0].sessionId).toBe(fork.id);
    });

    it('truncates messages at the specified messageId (inclusive)', async () => {
      await createSession({ id: 'trunc-parent' });

      const msgs: HistoryMessage[] = [
        { id: 'a', sessionId: 'trunc-parent', role: 'user', blocks: [], timestamp: 1 },
        { id: 'b', sessionId: 'trunc-parent', role: 'assistant', blocks: [], timestamp: 2 },
        { id: 'c', sessionId: 'trunc-parent', role: 'user', blocks: [], timestamp: 3 },
      ];
      for (const m of msgs) {
        await appendMessage('trunc-parent', m);
      }

      const fork = await forkSession({ parentSessionId: 'trunc-parent', messageId: 'b' });
      const history = await getSessionHistory(fork.id);

      expect(history.messages.map(m => m.id)).toEqual(['a', 'b']);
    });

    it('uses a custom name when provided', async () => {
      await createSession({ id: 'named-parent' });
      const fork = await forkSession({ parentSessionId: 'named-parent', name: 'Custom Fork' });

      expect(fork.name).toBe('Custom Fork');
    });

    it('creates a fork with no messages when parent has none', async () => {
      await createSession({ id: 'empty-parent' });
      const fork = await forkSession({ parentSessionId: 'empty-parent' });
      const history = await getSessionHistory(fork.id);

      expect(history.messages).toEqual([]);
    });

    it('registers the fork in the session map', async () => {
      await createSession({ id: 'map-parent' });
      const fork = await forkSession({ parentSessionId: 'map-parent' });

      const map = JSON.parse(store.get(SESSION_MAP_PATH)!);
      const forkEntry = map.sessions.find((s: { id: string }) => s.id === fork.id);

      expect(forkEntry).toBeDefined();
      expect(forkEntry.parentId).toBe('map-parent');
    });
  });
});
