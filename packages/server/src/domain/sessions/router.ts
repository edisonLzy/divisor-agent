import { TRPCError } from "@trpc/server";
import { z } from "zod/v4";

import { router, publicProcedure } from "../../shared/trpc.js";
import { listSessions, getSessionHistory, renameSession, deleteSession } from "./service.js";

export const sessionsRouter = router({
  list: publicProcedure.query(async () => {
    return listSessions();
  }),

  history: publicProcedure
    .input(z.object({ id: z.string(), cursor: z.string().optional() }))
    .query(async ({ input }) => {
      return getSessionHistory(input.id, input.cursor);
    }),

  rename: publicProcedure
    .input(z.object({ id: z.string(), name: z.string().min(1) }))
    .mutation(async ({ input }) => {
      try {
        await renameSession(input.id, input.name);
        return { success: true };
      } catch {
        throw new TRPCError({ code: "NOT_FOUND", message: `Session ${input.id} not found` });
      }
    }),

  delete: publicProcedure.input(z.object({ id: z.string() })).mutation(async ({ input }) => {
    try {
      await deleteSession(input.id);
      return { success: true };
    } catch {
      throw new TRPCError({ code: "NOT_FOUND", message: `Session ${input.id} not found` });
    }
  }),
});
