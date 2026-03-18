import { getHealth } from './health.service.js';
import type { Request, Response } from 'express';

export function healthController(_req: Request, res: Response): void {
  res.success(getHealth());
}
