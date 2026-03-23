import { createServer } from 'node:http';
import path from 'node:path';
import os from 'node:os';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Read real models.json before mocking fs ───────────────────────────────

const realModelsJson = vi.hoisted((): string | null => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { readFileSync } = require('node:fs');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { homedir } = require('node:os');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { join } = require('node:path');
  try {
    return readFileSync(join(homedir(), '.pi', 'agent', 'models.json'), 'utf-8') as string;
  } catch {
    return null;
  }
});

// ── fs/promises mock (before any service imports) ─────────────────────────

const mockFs = vi.hoisted(() => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  rename: vi.fn(),
  mkdir: vi.fn(),
  appendFile: vi.fn(),
  rm: vi.fn(),
}));

vi.mock('node:fs/promises', () => ({ default: mockFs }));

// ── Import router AFTER mock is registered ────────────────────────────────

import { setupACPServerConnection } from '../../../src/domain/agent/router.js';
import { removeSession } from '../../../src/domain/agent/service.js';
import { AcpMockClient } from './acp-mock-client.js';
import type { AddressInfo } from 'node:net';

// ── Helpers ───────────────────────────────────────────────────────────────

let store: Map<string, string>;

const MODELS_JSON_PATH = path.join(os.homedir(), '.pi', 'agent', 'models.json');

function setupMemoryFs(): void {
  store = new Map();

  // Pre-populate with real models.json so custom model resolution works in tests
  if (realModelsJson) {
    store.set(MODELS_JSON_PATH, realModelsJson);
  }

  mockFs.readFile.mockImplementation(async (filePath: string) => {
    const content = store.get(filePath);
    if (content === undefined) {
      throw Object.assign(new Error(`ENOENT: ${filePath}`), { code: 'ENOENT' });
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

// ── Suite ─────────────────────────────────────────────────────────────────

describe('ACP WebSocket integration', () => {
  let httpServer: ReturnType<typeof createServer>;
  let port: number;
  let client: AcpMockClient;
  const createdSessionIds: string[] = [];

  beforeEach(async () => {
    vi.clearAllMocks();
    setupMemoryFs();
    createdSessionIds.length = 0;

    httpServer = createServer();
    setupACPServerConnection(httpServer);

    await new Promise<void>((resolve) => httpServer.listen(0, () => resolve()));
    port = (httpServer.address() as AddressInfo).port;

    client = new AcpMockClient(`ws://localhost:${port}/acp`);
    await client.connect();
  });

  afterEach(async () => {
    client.disconnect();

    // Give the client socket time to close before shutting down the server
    await new Promise<void>((resolve) => setTimeout(resolve, 50));

    httpServer.closeAllConnections?.();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));

    // Clean up in-memory session state so tests don't interfere
    for (const id of createdSessionIds) {
      removeSession(id);
    }
  });

  // ── session/start ─────────────────────────────────────────────────────

  it('session/start → session/started', async () => {
    const sessionId = 'int-test-start';
    createdSessionIds.push(sessionId);

    client.send({
      type: 'session/start',
      sessionId,
      payload: {
        model: { providerId: 'anthropic', modelId: 'claude-3-haiku-20240307' },
      },
    });

    const response = await client.waitForMessage('session/started');

    expect(response).toMatchObject({
      type: 'session/started',
      sessionId,
      payload: { sessionId },
    });
  });

  it('reconnecting to an existing session reuses it (no duplicate session/started)', async () => {
    const sessionId = 'int-test-reconnect';
    createdSessionIds.push(sessionId);

    // First connection
    client.send({
      type: 'session/start',
      sessionId,
      payload: { model: { providerId: 'anthropic', modelId: 'claude-3-haiku-20240307' } },
    });
    await client.waitForMessage('session/started');

    // Reconnect with the same sessionId — server should log and set ws, but NOT
    // send session/started again (per current implementation it just updates ws)
    client.send({
      type: 'session/start',
      sessionId,
      payload: { model: { providerId: 'anthropic', modelId: 'claude-3-haiku-20240307' } },
    });

    // There's no second session/started in the spec for reconnect, but service.ts
    // silently returns. Give it a bit of time and verify nothing extra arrived.
    await new Promise<void>((resolve) => setTimeout(resolve, 100));

    const extraStarted = client.messageQueue.filter(m => m.type === 'session/started');
    expect(extraStarted).toHaveLength(0);
  });

  // ── session/prompt error path ─────────────────────────────────────────

  it('session/prompt → acp/error when session was never started', async () => {
    const sessionId = 'int-test-unknown';

    client.send({
      type: 'session/prompt',
      sessionId,
      payload: { content: 'Hello' },
    });

    const error = await client.waitForMessage('acp/error');

    expect(error).toMatchObject({
      type: 'acp/error',
      sessionId,
      payload: {
        code: 'SESSION_NOT_FOUND',
      },
    });
  });

  // ── session/fork ──────────────────────────────────────────────────────

  it('session/fork → session/forked', async () => {
    const sessionId = 'int-test-fork';
    createdSessionIds.push(sessionId);

    client.send({
      type: 'session/start',
      sessionId,
      payload: { model: { providerId: 'anthropic', modelId: 'claude-3-haiku-20240307' } },
    });
    await client.waitForMessage('session/started');

    client.send({
      type: 'session/fork',
      sessionId,
      payload: {},
    });

    const forked = await client.waitForMessage('session/forked');

    expect(forked).toMatchObject({ type: 'session/forked', sessionId });
    expect(typeof forked.payload?.newSessionId).toBe('string');
    expect(forked.payload?.newSessionId).not.toBe(sessionId);

    // Track the forked session for cleanup
    createdSessionIds.push(forked.payload!.newSessionId as string);
  });

  it('session/fork with a non-existent messageId still creates a fork', async () => {
    const sessionId = 'int-test-fork-msgid';
    createdSessionIds.push(sessionId);

    client.send({
      type: 'session/start',
      sessionId,
      payload: { model: { providerId: 'anthropic', modelId: 'claude-3-haiku-20240307' } },
    });
    await client.waitForMessage('session/started');

    client.send({
      type: 'session/fork',
      sessionId,
      payload: { messageId: 'nonexistent-message-id' },
    });

    const forked = await client.waitForMessage('session/forked');
    expect(forked.payload?.newSessionId).toBeDefined();

    createdSessionIds.push(forked.payload!.newSessionId as string);
  });

  // ── LLM-backed tests (require models.json with a configured provider) ──

  it.skipIf(!realModelsJson)(
    'session/prompt → agent_message_chunk stream → agent_message_done',
    async () => {
      const sessionId = 'int-test-prompt';
      createdSessionIds.push(sessionId);

      client.send({
        type: 'session/start',
        sessionId,
        payload: { model: { providerId: 'minimax-coding-plan', modelId: 'MiniMax-M2.5-highspeed' } },
      });
      await client.waitForMessage('session/started');

      client.send({
        type: 'session/prompt',
        sessionId,
        payload: { content: 'Reply with exactly one word: "hello".' },
      });

      // Chunks accumulate in the queue while we wait for the terminal event.
      const done = await client.waitForMessage('agent_message_done', 60_000);
      expect(done).toMatchObject({ type: 'agent_message_done', sessionId });

      const chunks = client.messageQueue.filter(m => m.type === 'agent_message_chunk');
      expect(chunks.length).toBeGreaterThan(0);

      for (const chunk of chunks) {
        expect(chunk.payload?.type).toMatch(/text_delta|thinking_delta/);
        expect(typeof chunk.payload?.delta).toBe('string');
      }
    },
    90_000,
  );

  it.skipIf(!realModelsJson)(
    'tool call (fs/read_text_file) — low-risk, no permission gate',
    async () => {
      const sessionId = 'int-test-tool-read';
      createdSessionIds.push(sessionId);

      client.send({
        type: 'session/start',
        sessionId,
        payload: { model: { providerId: 'minimax-coding-plan', modelId: 'MiniMax-M2.5-highspeed' } },
      });
      await client.waitForMessage('session/started');

      client.send({
        type: 'session/prompt',
        sessionId,
        payload: { content: 'Read the file at path "/tmp/test.txt" using the fs/read_text_file tool.' },
      });

      // Server will delegate to Rust; we auto-respond with file content
      const toolCall = await client.waitForToolCallAndRespond(
        'fs/read_text_file',
        sessionId,
        'hello from mock file',
        30_000,
      );
      expect(toolCall.type).toBe('fs/read_text_file');

      await client.waitForMessage('agent_message_done', 30_000);
    },
    90_000,
  );

  it.skipIf(!realModelsJson)(
    'tool call (fs/write_text_file) — high-risk, requires permission/approve',
    async () => {
      const sessionId = 'int-test-tool-write-approve';
      createdSessionIds.push(sessionId);

      client.send({
        type: 'session/start',
        sessionId,
        payload: { model: { providerId: 'minimax-coding-plan', modelId: 'MiniMax-M2.5-highspeed' } },
      });
      await client.waitForMessage('session/started');

      client.send({
        type: 'session/prompt',
        sessionId,
        payload: { content: 'Write "hello" to the file at path "/tmp/out.txt" using fs/write_text_file.' },
      });

      // Approve the permission request
      const permReq = await client.waitForPermissionAndRespond(sessionId, true, 30_000);
      expect(permReq.payload?.operation).toBe('fs_write');

      // The actual write is delegated to Rust; auto-respond
      await client.waitForToolCallAndRespond('fs/write_text_file', sessionId, 'written', 30_000);

      await client.waitForMessage('agent_message_done', 30_000);
    },
    90_000,
  );

  it.skipIf(!realModelsJson)(
    'permission/reject → agent receives denied result and finishes',
    async () => {
      const sessionId = 'int-test-tool-write-reject';
      createdSessionIds.push(sessionId);

      client.send({
        type: 'session/start',
        sessionId,
        payload: { model: { providerId: 'minimax-coding-plan', modelId: 'MiniMax-M2.5-highspeed' } },
      });
      await client.waitForMessage('session/started');

      client.send({
        type: 'session/prompt',
        sessionId,
        payload: { content: 'Write "hello" to the file at path "/tmp/out.txt" using fs/write_text_file.' },
      });

      // Reject the permission request
      await client.waitForPermissionAndRespond(sessionId, false, 30_000);

      // Agent continues and eventually finishes (with a message about denial)
      await client.waitForMessage('agent_message_done', 30_000);
    },
    90_000,
  );
});
