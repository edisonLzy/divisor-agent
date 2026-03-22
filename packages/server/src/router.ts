import { sessionsRouter } from './domain/sessions/router.js';
import { modelsRouter } from './domain/models/router.js';
import { router } from './shared/trpc.js';

export const appRouter = router({
  sessions: sessionsRouter,
  models: modelsRouter,
});

export type AppRouter = typeof appRouter;