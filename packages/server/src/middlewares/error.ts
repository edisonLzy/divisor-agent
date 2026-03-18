import type { ErrorRequestHandler } from 'express';
import type { ApiResponse } from '../../types/index.js';
import { AppError } from '../../errors/app-error.js';
import { getTraceId } from '../../shared/logger.js';

const isDev = process.env.NODE_ENV !== 'production';

export const createGlobalErrorHandlerMiddleware = (): ErrorRequestHandler => {
  return (err: AppError, _req, res, _next) => {
    let statusCode = 500;
    let code = 500;
    let message = 'Internal Server Error';

    if (err instanceof AppError) {
      statusCode = err.statusCode;
      message = err.message;
      code = err.code ?? err.statusCode;
    } else if (err instanceof Error) {
      message = err.message;
      if (isDev) console.error('[Global Error]', err);
    }

    const response: ApiResponse<null> = {
      code,
      message,
      data: null,
      timestamp: new Date().toISOString(),
      traceId: getTraceId(),
    };

    res.status(statusCode).json(response);
  };
};
