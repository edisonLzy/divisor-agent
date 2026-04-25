import "dotenv/config";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import cors from "cors";
import express from "express";

import { createGlobalErrorHandlerMiddleware } from "./middlewares/error.js";
import { createResponseMiddleware } from "./middlewares/response.js";
import { appRouter } from "./router.js";
import { createLogger, createRequestLoggerMiddleware } from "./shared/logger.js";

const logger = createLogger("server");

export function createApp(): express.Application {
  const app = express();
  app.use(createRequestLoggerMiddleware(logger));
  app.use(cors());
  app.use(express.json());

  app.use("/trpc", createExpressMiddleware({ router: appRouter }));

  app.use(createResponseMiddleware());
  app.use(createGlobalErrorHandlerMiddleware());

  return app;
}
