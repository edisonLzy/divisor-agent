import { router, publicProcedure } from '../../shared/trpc.js';
import { listModels } from './service.js';

export const modelsRouter = router({
  list: publicProcedure.query(async () => {
    return listModels();
  }),
});
