import { eq, inArray } from 'drizzle-orm';
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import { sdk } from '@sovereignfs/sdk';
import { wardenSessions, wardenMessages } from '../_db/schema';
import { listMessages, listSessions } from './sessions';

/**
 * User data portability (RFC 0007, epic task 22.5) for Warden's chat
 * history. Scoped deliberately narrow — provider connections/API keys are
 * *not* touched here:
 *
 * - `sdk.connections`/`sdk.secrets` throw when called outside a real plugin
 *   route (no `x-sovereign-plugin-id` header to resolve) — unlike
 *   `sdk.db.getClient()`, they have no portability-context fallback
 *   (`runtime/src/sdk-host.ts`), so calling them from an export/import
 *   resolver isn't safe.
 * - Deletion doesn't need to touch them anyway: the platform's own account
 *   deletion cascade (`packages/db/src/platform-db.ts`) already deletes
 *   every `plugin_connections`/`plugin_secrets` row scoped to the deleted
 *   user, for every plugin, unconditionally — a plugin-specific deletion
 *   handler doing the same work would be redundant, not more thorough.
 */
export async function registerPortability(): Promise<void> {
  await sdk.portability.provideExport(async (ctx) => {
    // schemaVersion 2 (was 1): the export shape genuinely changed from one
    // flat message list to sessions grouped with their own messages, per
    // task 22.8's multi-session model — a hypothetical future import
    // resolver would need to branch on this.
    const sessions = await listSessions(ctx.userId, ctx.tenantId);
    const withMessages = await Promise.all(
      sessions.map(async (session) => ({
        ...session,
        messages: await listMessages(ctx.userId, ctx.tenantId, session.id),
      })),
    );
    return {
      pluginId: 'fs.sovereign.warden',
      schemaVersion: 2,
      data: { sessions: withMessages },
    };
  });

  await sdk.portability.provideDelete(async (ctx) => {
    // ctx.db is the plugin's own opaque Drizzle client (DeletionContext['db']: unknown),
    // same shape as sdk.db.getClient() — same generic-args pattern as sessions.ts's `Db`.
    const database = ctx.db as BaseSQLiteDatabase<'async', unknown>;
    const sessions = await database
      .select({ id: wardenSessions.id })
      .from(wardenSessions)
      .where(eq(wardenSessions.userId, ctx.userId));
    const sessionIds = sessions.map((s) => s.id);

    // Count via a separate select before the delete rather than a
    // delete-with-row-report clause — not every driver behind
    // `sdk.db.getClient()` (sqld/libsql vs. node-postgres) is guaranteed to
    // support that identically. Fixed at 4 queries regardless of session
    // count (task 22.7's fix, carried forward unchanged) via inArray,
    // instead of a per-session select+delete loop. inArray([]) is safe
    // here — drizzle-orm generates a constant `false` condition for an
    // empty array, not invalid `IN ()` SQL, so the zero-session case needs
    // no special-casing.
    const messages = await database
      .select({ id: wardenMessages.id })
      .from(wardenMessages)
      .where(inArray(wardenMessages.sessionId, sessionIds));
    await database.delete(wardenMessages).where(inArray(wardenMessages.sessionId, sessionIds));
    await database.delete(wardenSessions).where(eq(wardenSessions.userId, ctx.userId));

    return { deleted: messages.length + sessions.length };
  });
}
