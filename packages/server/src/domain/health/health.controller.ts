import type { Request, Response } from 'express';
import { getHealth } from './health.service.js';

export function healthController(_req: Request, res: Response): void {
  res.success(getHealth());
}
