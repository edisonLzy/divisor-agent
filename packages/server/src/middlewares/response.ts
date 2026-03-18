import type { Request, Response, NextFunction } from 'express';
import type { ApiResponse } from '../types/index.js';

export function createResponseMiddleware() {
  return (_req: Request, res: Response, next: NextFunction) => {
    res.success = function <T>(data: T) {
      const response: ApiResponse<T> = {
        code: 0,
        data,
        timestamp: new Date().toISOString(),
      };
      res.status(200).json(response);
    };
    next();
  };
}
