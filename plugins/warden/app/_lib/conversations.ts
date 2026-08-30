import { asc, desc, eq } from 'drizzle-orm';
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import { sdk } from '@sovereignfs/sdk';
import { wardenConversation, wardenMessages } from '../_db/schema';
import type { WardenMessageRow } from '../_db/schema';

/**
 * Warden's persisted chat (RFC 0063 §3, epic task 22.5). One conversation
 * per user in this phase — `getOrCreateConversation` is the single place
 * that invariant lives, so every other function here can assume it already
 * holds.
 *
 * `createdAt` is millisecond-precision (`Date.now()`), not the more common
 * epoch-seconds — found necessary while writing this module's own tests:
 * ordering by a tied `createdAt` isn't guaranteed to preserve insertion
 * order (in SQL generally, and in the in-memory test fake specifically), so
 * second-granularity made `getRecentMessagesForContext`'s "last N" genuinely
 * ambiguous for two messages appended within the same second — a real
 * possibility for a fast local model's user+assistant pair. Milliseconds
 * don't make same-tick collisions impossible, only much less likely for
 * this access pattern (two sequential writes with a network round-trip to
 * an LLM in between); a fully robust fix would need a dedicated monotonic
 * sequence column, judged disproportionate for this phase.
 */

// The SDK returns an opaque, dialect-agnostic client; typed through this
// plugin's own sqlite-core schema (works on either live dialect). No `any`
// needed — BaseSQLiteDatabase's second generic (TRunResult) has no `extends`
// constraint, so `unknown` satisfies it exactly as well (same pattern as
// packages/db/src/client.ts's SqliteDb).
type Db = BaseSQLiteDatabase<'async', unknown>;

async function db(): Promise<Db> {
  return (await sdk.db.getClient()) as Db;
}

export interface MessageView {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  providerId: string | null;
  model: string;
  createdAt: number;
}

function toView(row: WardenMessageRow): MessageView {
  return {
    id: row.id,
    role: row.role === 'assistant' ? 'assistant' : 'user',
    content: row.content,
    providerId: row.providerId,
    model: row.model,
    createdAt: row.createdAt,
  };
}

async function getOrCreateConversation(userId: string, tenantId: string): Promise<string> {
  const database = await db();
  const existing = await database
    .select()
    .from(wardenConversation)
    .where(eq(wardenConversation.userId, userId))
    .limit(1);
  if (existing[0]) return existing[0].id;

  const id = crypto.randomUUID();
  await database.insert(wardenConversation).values({
    id,
    tenantId,
    userId,
    createdAt: Date.now(),
  });
  return id;
}

/** Full history, oldest first — for display. Not context-limited; the
 *  max-recent-turns guard only applies to what's replayed to the model
 *  (see `getRecentMessagesForContext`), not what the user can scroll back
 *  through. */
export async function listMessages(userId: string, tenantId: string): Promise<MessageView[]> {
  const database = await db();
  const conversationId = await getOrCreateConversation(userId, tenantId);
  const rows = await database
    .select()
    .from(wardenMessages)
    .where(eq(wardenMessages.conversationId, conversationId))
    .orderBy(asc(wardenMessages.createdAt));
  return rows.map(toView);
}

/** The last `maxTurns` turns (a "turn" ~= one message here), oldest first
 *  — the context-window guard for what actually gets replayed to a model.
 *  Queried with `ORDER BY ... DESC LIMIT` then reversed, not fetched in
 *  full and sliced, so this stays cheap as history grows. */
export async function getRecentMessagesForContext(
  userId: string,
  tenantId: string,
  maxTurns: number,
): Promise<MessageView[]> {
  const database = await db();
  const conversationId = await getOrCreateConversation(userId, tenantId);
  const rows = await database
    .select()
    .from(wardenMessages)
    .where(eq(wardenMessages.conversationId, conversationId))
    .orderBy(desc(wardenMessages.createdAt))
    .limit(Math.max(0, maxTurns));
  return rows.reverse().map(toView);
}

export async function appendMessage(
  userId: string,
  tenantId: string,
  input: { role: 'user' | 'assistant'; content: string; providerId: string | null; model: string },
): Promise<MessageView> {
  const database = await db();
  const conversationId = await getOrCreateConversation(userId, tenantId);
  const row: WardenMessageRow = {
    id: crypto.randomUUID(),
    conversationId,
    role: input.role,
    content: input.content,
    providerId: input.providerId,
    model: input.model,
    createdAt: Date.now(),
  };
  await database.insert(wardenMessages).values(row);
  return toView(row);
}

/** Deletes every message in the user's conversation — used by the
 *  "clear conversation" affordance and by the portability delete hook.
 *  The conversation row itself is left in place (it's the stable id
 *  everything else is keyed to); only its messages are removed. */
export async function clearMessages(userId: string, tenantId: string): Promise<void> {
  const database = await db();
  const conversationId = await getOrCreateConversation(userId, tenantId);
  await database.delete(wardenMessages).where(eq(wardenMessages.conversationId, conversationId));
}
