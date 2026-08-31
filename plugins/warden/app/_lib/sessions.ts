import { asc, desc, eq, inArray } from 'drizzle-orm';
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import { sdk } from '@sovereignfs/sdk';
import { wardenSessions, wardenMessages } from '../_db/schema';
import type { WardenMessageRow, WardenSessionRow } from '../_db/schema';

/**
 * Warden's persisted chat (RFC 0063 §3/§10, epic task 22.8). Replaces
 * `conversations.ts`'s single-conversation-per-user model with multiple
 * named, pinnable sessions — every function here is ownership-checked
 * (`getOwnSession`), never trusting a caller-supplied `sessionId` to belong
 * to the calling user just because it parses as one.
 *
 * `createdAt`/`lastActiveAt` are millisecond-precision (`Date.now()`), not
 * the more common epoch-seconds — same reasoning `conversations.ts`
 * originally documented: ordering by a tied timestamp isn't guaranteed to
 * preserve insertion order, and a fast local model's user+assistant pair
 * can land in the same second.
 */

// The SDK returns an opaque, dialect-agnostic client; typed through this
// plugin's own sqlite-core schema (works on either live dialect).
type Db = BaseSQLiteDatabase<'async', unknown>;

async function db(): Promise<Db> {
  return (await sdk.db.getClient()) as Db;
}

/** Sessions pinned above this count are rejected outright at pin time
 *  (RFC 0063 §10) — not silently auto-evicting the oldest pin. */
export const MAX_PINNED_SESSIONS = 5;

const TITLE_MAX_CHARS = 60;

export class SessionNotFoundError extends Error {
  constructor() {
    super('Session not found.');
    this.name = 'SessionNotFoundError';
  }
}

export class SessionPinLimitError extends Error {
  constructor() {
    super(`You can pin up to ${MAX_PINNED_SESSIONS} sessions — unpin one first.`);
    this.name = 'SessionPinLimitError';
  }
}

export interface SessionView {
  id: string;
  title: string | null;
  pinnedAt: number | null;
  lastActiveAt: number;
  createdAt: number;
}

export interface MessageView {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  providerId: string | null;
  model: string;
  createdAt: number;
}

function toSessionView(row: WardenSessionRow): SessionView {
  return {
    id: row.id,
    title: row.title,
    pinnedAt: row.pinnedAt,
    lastActiveAt: row.lastActiveAt,
    createdAt: row.createdAt,
  };
}

function toMessageView(row: WardenMessageRow): MessageView {
  return {
    id: row.id,
    role: row.role === 'assistant' ? 'assistant' : 'user',
    content: row.content,
    providerId: row.providerId,
    model: row.model,
    createdAt: row.createdAt,
  };
}

/**
 * A lightweight, no-model-call default title derived from a session's
 * first message. RFC 0063 leaves "which model generates the title" an open
 * question; spending a real LLM request (extra latency, cost, a second
 * failure mode, and picking which provider answers it) isn't justified for
 * a title the user can always rename — see workstream 0021's completion
 * note for this task. Never throws.
 */
function deriveTitle(content: string): string {
  const collapsed = content.trim().replace(/\s+/g, ' ');
  if (!collapsed) return 'New chat';
  if (collapsed.length <= TITLE_MAX_CHARS) return collapsed;
  return `${collapsed.slice(0, TITLE_MAX_CHARS - 1).trimEnd()}…`;
}

/** Fetches one of *this user's* sessions, or null — never another user's.
 *  Ownership is verified in code after the read, not just implied by a
 *  query filter, so a guessed/leaked session id belonging to someone else
 *  never returns data or lets a mutation through. */
async function getOwnSession(
  database: Db,
  userId: string,
  sessionId: string,
): Promise<WardenSessionRow | null> {
  const rows = await database
    .select()
    .from(wardenSessions)
    .where(eq(wardenSessions.id, sessionId))
    .limit(1);
  const row = rows[0];
  if (!row || row.userId !== userId) return null;
  return row;
}

/** Every session for this user, most recently active first. */
export async function listSessions(userId: string, _tenantId: string): Promise<SessionView[]> {
  const database = await db();
  const rows = await database
    .select()
    .from(wardenSessions)
    .where(eq(wardenSessions.userId, userId))
    .orderBy(desc(wardenSessions.lastActiveAt));
  return rows.map(toSessionView);
}

/**
 * The single most recently active session, or null if the user has none
 * yet. Used by the pre-sidebar chat page (task 22.10 ships the sidebar that
 * lets a user actually pick among sessions) to keep the existing "continue
 * where you left off" behavior working against the new schema.
 */
export async function getMostRecentSession(
  userId: string,
  _tenantId: string,
): Promise<SessionView | null> {
  const database = await db();
  const rows = await database
    .select()
    .from(wardenSessions)
    .where(eq(wardenSessions.userId, userId))
    .orderBy(desc(wardenSessions.lastActiveAt))
    .limit(1);
  return rows[0] ? toSessionView(rows[0]) : null;
}

/**
 * Creates a new, empty session. Deliberately not called until a session's
 * first message is actually sent (RFC 0063 §3/§10) — the chat route calls
 * this only when the client sends no `sessionId`, never eagerly on "+ New"
 * being clicked, so idle clicking through empty sessions never clutters the
 * sidebar (task 22.10) with rows that have nothing in them.
 */
export async function createSession(userId: string, tenantId: string): Promise<SessionView> {
  const database = await db();
  const now = Date.now();
  const row: WardenSessionRow = {
    id: crypto.randomUUID(),
    tenantId,
    userId,
    title: null,
    pinnedAt: null,
    lastActiveAt: now,
    createdAt: now,
  };
  await database.insert(wardenSessions).values(row);
  return toSessionView(row);
}

export async function renameSession(
  userId: string,
  _tenantId: string,
  sessionId: string,
  title: string,
): Promise<SessionView> {
  const database = await db();
  const existing = await getOwnSession(database, userId, sessionId);
  if (!existing) throw new SessionNotFoundError();
  const trimmed = title.trim() || null;
  await database
    .update(wardenSessions)
    .set({ title: trimmed })
    .where(eq(wardenSessions.id, sessionId));
  return toSessionView({ ...existing, title: trimmed });
}

/**
 * Pins a session, rejecting outright once `MAX_PINNED_SESSIONS` is already
 * pinned rather than silently evicting the oldest pin — a deliberate
 * decision (workstream 0021): silently undoing something the user pinned
 * earlier, without them asking for it, is a surprising loss of intent.
 * Idempotent if already pinned.
 */
export async function pinSession(
  userId: string,
  _tenantId: string,
  sessionId: string,
): Promise<SessionView> {
  const database = await db();
  const existing = await getOwnSession(database, userId, sessionId);
  if (!existing) throw new SessionNotFoundError();
  if (existing.pinnedAt !== null) return toSessionView(existing);

  const allSessions = await database
    .select()
    .from(wardenSessions)
    .where(eq(wardenSessions.userId, userId));
  const pinnedCount = allSessions.filter((s) => s.pinnedAt !== null).length;
  if (pinnedCount >= MAX_PINNED_SESSIONS) throw new SessionPinLimitError();

  const now = Date.now();
  await database
    .update(wardenSessions)
    .set({ pinnedAt: now })
    .where(eq(wardenSessions.id, sessionId));
  return toSessionView({ ...existing, pinnedAt: now });
}

export async function unpinSession(
  userId: string,
  _tenantId: string,
  sessionId: string,
): Promise<SessionView> {
  const database = await db();
  const existing = await getOwnSession(database, userId, sessionId);
  if (!existing) throw new SessionNotFoundError();
  await database
    .update(wardenSessions)
    .set({ pinnedAt: null })
    .where(eq(wardenSessions.id, sessionId));
  return toSessionView({ ...existing, pinnedAt: null });
}

/** Deletes a session and every one of its messages. Idempotent: deleting an
 *  already-gone or not-ours id is a silent no-op, matching
 *  `deleteProvider()`'s own convention. No "recently deleted" recovery
 *  path — same posture as incognito's own no-recovery behavior. */
export async function deleteSession(
  userId: string,
  _tenantId: string,
  sessionId: string,
): Promise<void> {
  const database = await db();
  const existing = await getOwnSession(database, userId, sessionId);
  if (!existing) return;
  await database.delete(wardenMessages).where(eq(wardenMessages.sessionId, sessionId));
  await database.delete(wardenSessions).where(eq(wardenSessions.id, sessionId));
}

/** Full history for one session, oldest first — for display. Not
 *  context-limited; the max-recent-turns guard only applies to what's
 *  replayed to the model (`getRecentMessagesForContext`). */
export async function listMessages(
  userId: string,
  _tenantId: string,
  sessionId: string,
): Promise<MessageView[]> {
  const database = await db();
  const existing = await getOwnSession(database, userId, sessionId);
  if (!existing) throw new SessionNotFoundError();
  const rows = await database
    .select()
    .from(wardenMessages)
    .where(eq(wardenMessages.sessionId, sessionId))
    .orderBy(asc(wardenMessages.createdAt));
  return rows.map(toMessageView);
}

/** The last `maxTurns` turns (a "turn" ~= one message here) of one session,
 *  oldest first — the context-window guard for what actually gets replayed
 *  to a model. Queried with `ORDER BY ... DESC LIMIT` then reversed, not
 *  fetched in full and sliced, so this stays cheap as history grows. */
export async function getRecentMessagesForContext(
  userId: string,
  _tenantId: string,
  sessionId: string,
  maxTurns: number,
): Promise<MessageView[]> {
  const database = await db();
  const existing = await getOwnSession(database, userId, sessionId);
  if (!existing) throw new SessionNotFoundError();
  const rows = await database
    .select()
    .from(wardenMessages)
    .where(eq(wardenMessages.sessionId, sessionId))
    .orderBy(desc(wardenMessages.createdAt))
    .limit(Math.max(0, maxTurns));
  return rows.reverse().map(toMessageView);
}

/** Appends one message to a session, bumps its `lastActiveAt`, and — on a
 *  session's first user message — sets its title via `deriveTitle()`. */
export async function appendMessage(
  userId: string,
  _tenantId: string,
  sessionId: string,
  input: { role: 'user' | 'assistant'; content: string; providerId: string | null; model: string },
): Promise<MessageView> {
  const database = await db();
  const existing = await getOwnSession(database, userId, sessionId);
  if (!existing) throw new SessionNotFoundError();

  const now = Date.now();
  const row: WardenMessageRow = {
    id: crypto.randomUUID(),
    sessionId,
    role: input.role,
    content: input.content,
    providerId: input.providerId,
    model: input.model,
    createdAt: now,
  };
  await database.insert(wardenMessages).values(row);

  const updates: { lastActiveAt: number; title?: string } = { lastActiveAt: now };
  if (existing.title === null && input.role === 'user') {
    updates.title = deriveTitle(input.content);
  }
  await database.update(wardenSessions).set(updates).where(eq(wardenSessions.id, sessionId));

  return toMessageView(row);
}

/**
 * Manual retention (RFC 0063 §11, epic task 22.9) — deletes every one of
 * this user's *unpinned* sessions whose `lastActiveAt` is older than
 * `olderThanDays`, along with their messages. Pinned sessions are never
 * touched, deliberately — a user pinned it on purpose, so a bulk cleanup
 * action shouldn't silently take it away. An on-demand action, not a
 * scheduled job (Warden declares no `sdk.schedules` capability today).
 * Fixed at 2 delete queries via `inArray`, matching task 22.7's pattern,
 * not a per-session loop. Returns the number of sessions deleted.
 */
export async function deleteInactiveSessions(
  userId: string,
  _tenantId: string,
  olderThanDays: number,
): Promise<number> {
  const database = await db();
  const cutoff = Date.now() - olderThanDays * 24 * 60 * 60 * 1000;
  const allSessions = await database
    .select()
    .from(wardenSessions)
    .where(eq(wardenSessions.userId, userId));
  const staleIds = allSessions
    .filter((s) => s.pinnedAt === null && s.lastActiveAt < cutoff)
    .map((s) => s.id);
  if (staleIds.length === 0) return 0;

  await database.delete(wardenMessages).where(inArray(wardenMessages.sessionId, staleIds));
  await database.delete(wardenSessions).where(inArray(wardenSessions.id, staleIds));
  return staleIds.length;
}

/** Deletes every message in a session — kept for parity with the original
 *  single-conversation `clearMessages()`, scoped to one session now. Not
 *  currently wired to any UI. */
export async function clearMessages(
  userId: string,
  _tenantId: string,
  sessionId: string,
): Promise<void> {
  const database = await db();
  const existing = await getOwnSession(database, userId, sessionId);
  if (!existing) throw new SessionNotFoundError();
  await database.delete(wardenMessages).where(eq(wardenMessages.sessionId, sessionId));
}
