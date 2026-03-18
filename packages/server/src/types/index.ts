export interface ApiResponse<T = unknown> {
  code: number;
  message?: string;
  data: T;
  timestamp: string;
  traceId?: string;
}
