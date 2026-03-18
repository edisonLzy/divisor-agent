import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createLogger, createRequestLoggerMiddleware } from './shared/logger.js';
import { createResponseMiddleware } from './middlewares/response.js';
import { createGlobalErrorHandlerMiddleware } from './middlewares/error.js';
import { healthRoutes } from './domain/health/health.routes.js';

const logger = createLogger('server');

export function createApp(): express.Application {
  const app = express();
  app.use(createRequestLoggerMiddleware(logger));
  app.use(cors());
  app.use(express.json());

  app.use(healthRoutes);
  app.use(createResponseMiddleware());
  app.use(createGlobalErrorHandlerMiddleware());

  return app;
}
