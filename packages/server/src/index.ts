import { createServer } from "node:http";

import { createApp } from "./app.js";
import { getPort } from "./config/env.js";
import { createLogger } from "./shared/logger.js";

const logger = createLogger("server");
const port = getPort();
const app = createApp();

const httpServer = createServer(app);

httpServer.listen(port, () => {
  logger.info({ port }, `Server running on http://localhost:${port}`);
});
