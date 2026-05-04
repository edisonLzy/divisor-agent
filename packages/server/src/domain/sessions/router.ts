import { TRPCError } from "@trpc/server";
import { z } from "zod/v4";

import { publicProcedure, router } from "../../shared/trpc.js";
import {
  appendEntry,
  buildContext,
  createSession,
  deleteSession,
  getBranch,
  getChildren,
  getEntries,
  getEntry,
  getSession,
  listSessions,
  renameSession,
  rewind,
  setLeaf,
} from "./service.js";
import { AppendEntrySchema } from "./types.js";

export const sessionsRouter = router({
  // ── Session CRUD ──────────────────────────────────────────────────────────

  create: publicProcedure
    .input(
      z.object({
        id: z.string().optional(),
        name: z.string().optional(),
        cwd: z.string().optional(),
        parentSessionId: z.string().nullable().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      return createSession(input);
    }),

  list: publicProcedure.query(async () => {
    return listSessions();
  }),

  get: publicProcedure.input(z.object({ id: z.string().uuid() })).query(async ({ input }) => {
    const session = await getSession(input.id);
    if (!session) {
      throw new TRPCError({ code: "NOT_FOUND", message: `Session ${input.id} not found` });
    }
    return session;
  }),

  rename: publicProcedure
    .input(z.object({ id: z.string().uuid(), name: z.string().min(1) }))
    .mutation(async ({ input }) => {
      await renameSession(input.id, input.name);
      return { success: true };
    }),

  delete: publicProcedure.input(z.object({ id: z.string().uuid() })).mutation(async ({ input }) => {
    await deleteSession(input.id);
    return { success: true };
  }),

  // ── Entry CRUD ────────────────────────────────────────────────────────────

  appendEntry: publicProcedure.input(AppendEntrySchema).mutation(async ({ input }) => {
    return appendEntry(input);
  }),

  getEntry: publicProcedure.input(z.object({ id: z.string().uuid() })).query(async ({ input }) => {
    const entry = await getEntry(input.id);
    if (!entry) {
      throw new TRPCError({ code: "NOT_FOUND", message: `Entry ${input.id} not found` });
    }
    return entry;
  }),

  getEntries: publicProcedure
    .input(z.object({ sessionId: z.string().uuid() }))
    .query(async ({ input }) => {
      return getEntries(input.sessionId);
    }),

  // ── Tree operations ───────────────────────────────────────────────────────

  getBranch: publicProcedure
    .input(
      z.object({
        sessionId: z.string().uuid(),
        leafId: z.string().uuid().optional(),
      }),
    )
    .query(async ({ input }) => {
      return getBranch(input.sessionId, input.leafId);
    }),

  buildContext: publicProcedure
    .input(
      z.object({
        sessionId: z.string().uuid(),
        leafId: z.string().uuid().optional(),
      }),
    )
    .query(async ({ input }) => {
      return buildContext(input.sessionId, input.leafId);
    }),

  getChildren: publicProcedure
    .input(z.object({ parentId: z.string().uuid() }))
    .query(async ({ input }) => {
      return getChildren(input.parentId);
    }),

  // ── Branch & Rewind ───────────────────────────────────────────────────────

  setLeaf: publicProcedure
    .input(z.object({ sessionId: z.string().uuid(), entryId: z.string().uuid() }))
    .mutation(async ({ input }) => {
      await setLeaf(input.sessionId, input.entryId);
      return { success: true };
    }),

  rewind: publicProcedure
    .input(z.object({ sessionId: z.string().uuid(), entryId: z.string().uuid() }))
    .mutation(async ({ input }) => {
      await rewind(input.sessionId, input.entryId);
      return { success: true };
    }),
});
