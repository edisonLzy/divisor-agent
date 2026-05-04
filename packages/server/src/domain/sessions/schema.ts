import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

// ── Sessions ────────────────────────────────────────────────────────────────

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull().default(""),
    cwd: text("cwd").notNull().default(""),
    parentSessionId: uuid("parent_session_id").references((): any => sessions.id, {
      onDelete: "set null",
    }),
    leafEntryId: uuid("leaf_entry_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_sessions_updated_at").on(t.updatedAt.desc())],
);

// ── Entries (append-only tree) ───────────────────────────────────────────────

export const entries = pgTable(
  "entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    parentId: uuid("parent_id").references((): any => entries.id, {
      onDelete: "no action",
    }),
    type: text("type").notNull(),
    timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),

    // Unified JSONB field for type-specific data
    // message:      { role, content }
    // model_change: { provider, modelId }
    data: jsonb("data").notNull().default({}),
  },
  (t) => [
    index("idx_entries_session").on(t.sessionId),
    index("idx_entries_parent").on(t.parentId),
    index("idx_entries_session_type").on(t.sessionId, t.type),
  ],
);
