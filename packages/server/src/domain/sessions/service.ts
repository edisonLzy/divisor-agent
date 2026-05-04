import { asc, desc, eq, sql } from "drizzle-orm";

import { db } from "../../db/index.js";
import { createLogger } from "../../shared/logger.js";
import { entries, sessions } from "./schema.js";
import type { AppendEntryInput, EntryOutput, SessionContextOutput } from "./types.js";

const logger = createLogger("sessions-service");

// ── Helpers ─────────────────────────────────────────────────────────────────

function toEntryOutput(row: typeof entries.$inferSelect): EntryOutput {
  return {
    id: row.id,
    sessionId: row.sessionId,
    parentId: row.parentId,
    type: row.type,
    timestamp: row.timestamp,
    data: (row.data ?? {}) as Record<string, unknown>,
  };
}

// ── Session CRUD ────────────────────────────────────────────────────────────

export async function createSession(opts: {
  id?: string;
  name?: string;
  cwd?: string;
  parentSessionId?: string | null;
}) {
  const [row] = await db
    .insert(sessions)
    .values({
      ...(opts.id ? { id: opts.id } : {}),
      name: opts.name ?? "",
      cwd: opts.cwd ?? "",
      parentSessionId: opts.parentSessionId ?? null,
    })
    .returning();

  logger.info({ id: row.id }, "Session created");
  return row;
}

export async function listSessions() {
  const rows = await db.select().from(sessions).orderBy(desc(sessions.updatedAt));

  return rows;
}

export async function getSession(id: string) {
  const [row] = await db.select().from(sessions).where(eq(sessions.id, id));
  return row ?? null;
}

export async function renameSession(id: string, name: string) {
  await db.update(sessions).set({ name, updatedAt: new Date() }).where(eq(sessions.id, id));
}

export async function deleteSession(id: string) {
  await db.delete(sessions).where(eq(sessions.id, id));
}

// ── Entry CRUD ──────────────────────────────────────────────────────────────

export async function appendEntry(input: AppendEntryInput): Promise<EntryOutput> {
  const [row] = await db
    .insert(entries)
    .values({
      sessionId: input.sessionId,
      parentId: input.parentId,
      type: input.type,
      data: input.data,
    })
    .returning();

  // Update session's leafEntryId and updatedAt
  await db
    .update(sessions)
    .set({
      leafEntryId: row.id,
      updatedAt: new Date(),
    })
    .where(eq(sessions.id, input.sessionId));

  logger.info({ entryId: row.id, sessionId: input.sessionId, type: input.type }, "Entry appended");
  return toEntryOutput(row);
}

export async function getEntry(id: string): Promise<EntryOutput | null> {
  const [row] = await db.select().from(entries).where(eq(entries.id, id));
  return row ? toEntryOutput(row) : null;
}

export async function getEntries(sessionId: string): Promise<EntryOutput[]> {
  const rows = await db
    .select()
    .from(entries)
    .where(eq(entries.sessionId, sessionId))
    .orderBy(asc(entries.timestamp));

  return rows.map(toEntryOutput);
}

// ── Tree operations (recursive CTE) ─────────────────────────────────────────

/**
 * Get the branch path from a leaf entry to the root.
 * Uses a recursive CTE to walk up the parentId chain.
 */
export async function getBranch(sessionId: string, leafId?: string): Promise<EntryOutput[]> {
  let targetLeafId = leafId;

  if (!targetLeafId) {
    const session = await getSession(sessionId);
    if (!session?.leafEntryId) return [];
    targetLeafId = session.leafEntryId;
  }

  const rows = await db.execute(sql`
    WITH RECURSIVE branch AS (
      SELECT *
      FROM entries
      WHERE id = ${targetLeafId} AND session_id = ${sessionId}
      UNION ALL
      SELECT e.*
      FROM entries e
      JOIN branch b ON e.id = b.parent_id
    )
    SELECT * FROM branch
    ORDER BY timestamp ASC
  `);

  return (rows as any[]).map((row: any) => ({
    id: row.id,
    sessionId: row.session_id,
    parentId: row.parent_id,
    type: row.type,
    timestamp: row.timestamp,
    data: typeof row.data === "string" ? JSON.parse(row.data) : (row.data ?? {}),
  }));
}

/**
 * Build session context: collect messages along the path from leaf to root.
 */
export async function buildContext(
  sessionId: string,
  leafId?: string,
): Promise<SessionContextOutput> {
  const branch = await getBranch(sessionId, leafId);

  const messages: SessionContextOutput["messages"] = [];
  let model: SessionContextOutput["model"] = null;

  for (const entry of branch) {
    if (entry.type === "message") {
      const data = entry.data as { role: string; content: unknown };
      messages.push({
        id: entry.id,
        role: data.role,
        content: data.content,
        timestamp: entry.timestamp,
      });
    } else if (entry.type === "model_change") {
      const data = entry.data as { provider: string; modelId: string };
      model = { provider: data.provider, modelId: data.modelId };
    }
  }

  return { messages, model };
}

/**
 * Get direct children of an entry.
 */
export async function getChildren(parentId: string): Promise<EntryOutput[]> {
  const rows = await db
    .select()
    .from(entries)
    .where(eq(entries.parentId, parentId))
    .orderBy(asc(entries.timestamp));

  return rows.map(toEntryOutput);
}

// ── Branch & Rewind ─────────────────────────────────────────────────────────

/**
 * Move the session's leaf pointer to a specific entry.
 * Next appendEntry will create a child of that entry, forming a new branch.
 */
export async function setLeaf(sessionId: string, entryId: string): Promise<void> {
  const entry = await getEntry(entryId);
  if (!entry || entry.sessionId !== sessionId) {
    throw new Error(`Entry ${entryId} not found in session ${sessionId}`);
  }

  await db
    .update(sessions)
    .set({ leafEntryId: entryId, updatedAt: new Date() })
    .where(eq(sessions.id, sessionId));

  logger.info({ sessionId, entryId }, "Leaf moved");
}

/**
 * Rewind to a specific entry.
 * Moves the session's leaf pointer to the target entry.
 */
export async function rewind(sessionId: string, entryId: string): Promise<void> {
  await setLeaf(sessionId, entryId);
  logger.info({ sessionId, entryId }, "Rewind completed");
}
