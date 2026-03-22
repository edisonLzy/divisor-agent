import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createExpressMiddleware } from '@trpc/server/adapters/express';
import { createLogger, createRequestLoggerMiddleware } from './shared/logger.js';
import { createResponseMiddleware } from './middlewares/response.js';
import { createGlobalErrorHandlerMiddleware } from './middlewares/error.js';
import { appRouter } from './router.js';

const logger = createLogger('server');

export function createApp(): express.Application {
  const app = express();
  app.use(createRequestLoggerMiddleware(logger));
  app.use(cors());
  app.use(express.json());

  app.use('/trpc', createExpressMiddleware({ router: appRouter }));

  app.use(createResponseMiddleware());
  app.use(createGlobalErrorHandlerMiddleware());

  return app;
}
