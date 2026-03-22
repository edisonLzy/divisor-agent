import { WebSocketServer } from 'ws';
import { createLogger } from '../../shared/logger.js';
import {
  handleSessionStart,
  handleSessionPrompt,
  handleSessionFork,
  handleToolResult,
  handlePermissionDecision,
} from './service.js';
import type { Server } from 'node:http';
import type { WebSocket } from 'ws';
import type { AcpMessage } from './service.js';

const logger = createLogger('acp:router');

async function handleAcpMessage(ws: WebSocket, raw: string): Promise<void> {
  let msg: AcpMessage;
  try {
    msg = JSON.parse(raw) as AcpMessage;
  } catch {
    logger.warn('Invalid ACP JSON received');
    return;
  }

  const { type, sessionId, messageId, payload } = msg;

  logger.info({ type, sessionId }, 'ACP message received');

  switch (type) {
    case 'session/start': {
      await handleSessionStart(ws, sessionId, payload);
      break;
    }
    case 'session/prompt': {
      await handleSessionPrompt(ws, sessionId, payload);
      break;
    }
    case 'session/fork': {
      await handleSessionFork(ws, sessionId, payload);
      break;
    }
    case 'tool/result': {
      handleToolResult(sessionId, messageId, payload, false);
      break;
    }
    case 'tool/error': {
      handleToolResult(sessionId, messageId, payload, true);
      break;
    }
    case 'permission/approve': {
      handlePermissionDecision(sessionId, payload, true);
      break;
    }
    case 'permission/reject': {
      handlePermissionDecision(sessionId, payload, false);
      break;
    }
    default: {
      logger.warn({ type }, 'Unknown ACP message type');
    }
  }
}

export function setupACPServerConnection(httpServer: Server): void {
  const wss = new WebSocketServer({ server: httpServer, path: '/acp' });

  wss.on('connection', (ws, req) => {
    const clientId = (req.headers['x-client-id'] as string) ?? crypto.randomUUID();
    logger.info({ clientId }, 'ACP client connected');

    ws.on('message', async (data) => {
      await handleAcpMessage(ws, data.toString());
    });

    ws.on('close', () => {
      logger.info({ clientId }, 'ACP client disconnected');
    });

    ws.on('error', (err) => {
      logger.error({ clientId, err }, 'ACP WebSocket error');
    });
  });
}