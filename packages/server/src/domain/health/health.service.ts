import type { HealthResponse } from './health.dto.js';

export function getHealth(): HealthResponse {
  return { status: 'ok' };
}
