import { router } from '../trpc.js';
import { sessionsRouter } from '../domain/sessions/sessions.router.js';
import { settingsRouter } from '../domain/settings/settings.router.js';

export const appRouter = router({
  sessions: sessionsRouter,
  settings: settingsRouter,
});

export type AppRouter = typeof appRouter;

// Re-export shared types for frontend consumption
export type {
  SessionNode,
  HistoryMessage,
  HistoryResponse,
  MessageBlock,
  TextBlock,
  ThinkingBlock,
  ToolResultBlock,
  AppSettings,
} from '../types/session.js';
