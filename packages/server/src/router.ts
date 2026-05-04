import { sessionsRouter } from "./domain/sessions/router.js";
import { router } from "./shared/trpc.js";

export const appRouter = router({
  sessions: sessionsRouter,
});

export type AppRouter = typeof appRouter;
