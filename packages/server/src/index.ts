import { createServer } from 'node:http';
import { createApp } from './app.js';
import { getPort } from './config/env.js';
import { setupACPServerConnection } from './domain/agent/router.js';
import { createLogger } from './shared/logger.js';

const logger = createLogger('server');
const port = getPort();
const app = createApp();

const httpServer = createServer(app);

setupACPServerConnection(httpServer);

httpServer.listen(port, () => {
  logger.info({ port }, `Server running on http://localhost:${port}`);
  logger.info({ port }, `ACP WebSocket on ws://localhost:${port}/acp`);
});
