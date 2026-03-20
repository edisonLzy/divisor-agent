import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import { createApp } from './app.js';
import { getPort } from './config/env.js';
import { handleAcpMessage } from './domain/acp/acp-handler.js';
import { createLogger } from './shared/logger.js';

const logger = createLogger('server');
const port = getPort();
const app = createApp();

const httpServer = createServer(app);

// ACP WebSocket server co-located on the same HTTP server
const wss = new WebSocketServer({ server: httpServer, path: '/acp' });

wss.on('connection', (ws, req) => {
  const clientId = req.headers['x-client-id'] as string ?? crypto.randomUUID();
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

httpServer.listen(port, () => {
  logger.info({ port }, `Server running on http://localhost:${port}`);
  logger.info({ port }, `ACP WebSocket on ws://localhost:${port}/acp`);
});
