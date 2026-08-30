import { eq, inArray } from 'drizzle-orm';
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import { sdk } from '@sovereignfs/sdk';
import { wardenConversation, wardenMessages } from '../_db/schema';
import { listMessages } from './conversations';

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
    const messages = await listMessages(ctx.userId, ctx.tenantId);
    return {
      pluginId: 'fs.sovereign.warden',
      schemaVersion: 1,
      data: { messages },
    };
  });

  await sdk.portability.provideDelete(async (ctx) => {
    // ctx.db is the plugin's own opaque Drizzle client (DeletionContext['db']: unknown),
    // same shape as sdk.db.getClient() — same generic-args pattern as conversations.ts's `Db`.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- required by BaseSQLiteDatabase's own generic signature
    const database = ctx.db as BaseSQLiteDatabase<'async', any, any>;
    const conversations = await database
      .select({ id: wardenConversation.id })
      .from(wardenConversation)
      .where(eq(wardenConversation.userId, ctx.userId));
    const conversationIds = conversations.map((c) => c.id);

    // Count via a separate select before the delete rather than a
    // delete-with-row-report clause — not every driver behind
    // `sdk.db.getClient()` (sqld/libsql vs. node-postgres) is guaranteed to
    // support that identically. Fixed at 4 queries regardless of
    // conversation count (was 2n + 2) via inArray, instead of a
    // per-conversation select+delete loop. inArray([]) is safe here —
    // drizzle-orm generates a constant `false` condition for an empty array,
    // not invalid `IN ()` SQL, so the zero-conversation case needs no
    // special-casing.
    const messages = await database
      .select({ id: wardenMessages.id })
      .from(wardenMessages)
      .where(inArray(wardenMessages.conversationId, conversationIds));
    await database
      .delete(wardenMessages)
      .where(inArray(wardenMessages.conversationId, conversationIds));
    await database.delete(wardenConversation).where(eq(wardenConversation.userId, ctx.userId));

    return { deleted: messages.length + conversations.length };
  });
}
