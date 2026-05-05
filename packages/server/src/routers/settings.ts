import { router, publicProcedure } from '../trpc.js';
import type { AppSettings } from '../types/session.js';

const DEFAULT_SETTINGS: AppSettings = {
  model: {
    provider: 'anthropic',
    name: 'claude-sonnet-4-20250514',
  },
  app: {},
};

export const settingsRouter = router({
  get: publicProcedure.query(async (): Promise<AppSettings> => {
    // TODO: persist user settings to disk
    return DEFAULT_SETTINGS;
  }),
});
