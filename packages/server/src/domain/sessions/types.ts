import { z } from "zod/v4";

// ── Entry data schemas (type-specific JSONB content) ────────────────────────

export const MessageDataSchema = z.object({
  role: z.enum(["user", "assistant", "tool"]),
  content: z.union([
    z.string(),
    z.array(
      z.object({
        type: z.string(),
        text: z.string(),
      }),
    ),
  ]),
});

export const ModelChangeDataSchema = z.object({
  provider: z.string(),
  modelId: z.string(),
});

// ── Append entry input ──────────────────────────────────────────────────────

export const AppendEntrySchema = z.object({
  sessionId: z.uuid(),
  parentId: z.uuid().nullable(),
  type: z.enum(["message", "model_change"]),
  data: z.union([MessageDataSchema, ModelChangeDataSchema]),
});

export type AppendEntryInput = z.infer<typeof AppendEntrySchema>;

// ── Entry output ────────────────────────────────────────────────────────────

export interface EntryOutput {
  id: string;
  sessionId: string;
  parentId: string | null;
  type: string;
  timestamp: Date;
  data: Record<string, unknown>;
}

// ── Session context (messages collected from leaf to root) ──────────────────

export interface SessionContextOutput {
  messages: Array<{
    id: string;
    role: string;
    content: unknown;
    timestamp: Date;
  }>;
  model: { provider: string; modelId: string } | null;
}
