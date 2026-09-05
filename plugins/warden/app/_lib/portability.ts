import { and, eq, inArray } from 'drizzle-orm';
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import { sdk } from '@sovereignfs/sdk';
import type { ImportContext, PluginExportSection } from '@sovereignfs/sdk';
import {
  wardenSessions,
  wardenMessages,
  wardenModelVisibilityOverrides,
  wardenUserSettings,
} from '../_db/schema';
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
 *
 * `provideImport` mirrors `provideExport`'s schemaVersion 3 shape exactly —
 * the manifest has declared `data:import` since task 22.5 shipped, but no
 * handler was ever registered for it, so a bundle containing this plugin's
 * section was silently skipped on restore ("no import handler registered
 * for this plugin") despite the permission claiming otherwise. Found and
 * fixed as a standalone follow-up, not part of any epic task.
 */

/** The shape `provideExport` produces at schemaVersion 3 — kept local
 *  rather than re-exported, since nothing outside this file needs it. */
interface WardenImportSession {
  id: string;
  title: string | null;
  pinnedAt: number | null;
  lastActiveAt: number;
  createdAt: number;
  messages: Array<{
    id: string;
    role: string;
    content: string;
    providerId: string | null;
    model: string;
    createdAt: number;
  }>;
}

interface WardenImportData {
  sessions: WardenImportSession[];
  modelVisibility: string[];
  defaultModelKey: string | null;
}

function isWardenImportData(value: unknown): value is WardenImportData {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<WardenImportData>;
  return (
    Array.isArray(candidate.sessions) &&
    Array.isArray(candidate.modelVisibility) &&
    (candidate.defaultModelKey === null || typeof candidate.defaultModelKey === 'string')
  );
}

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
    // schemaVersion 3 (was 2): per-user preferences now travel with the
    // history. `modelVisibility` is the exceptions-only override list, so
    // it reads as a set of model keys rather than a full catalog.
    const database = (await sdk.db.getClient()) as BaseSQLiteDatabase<'async', unknown>;
    const [visibility, settings] = await Promise.all([
      database
        .select({ modelKey: wardenModelVisibilityOverrides.modelKey })
        .from(wardenModelVisibilityOverrides)
        .where(eq(wardenModelVisibilityOverrides.userId, ctx.userId)),
      database
        .select({ defaultModelKey: wardenUserSettings.defaultModelKey })
        .from(wardenUserSettings)
        .where(eq(wardenUserSettings.userId, ctx.userId)),
    ]);

    return {
      pluginId: 'fs.sovereign.warden',
      schemaVersion: 3,
      data: {
        sessions: withMessages,
        modelVisibility: visibility.map((row) => row.modelKey),
        defaultModelKey: settings[0]?.defaultModelKey ?? null,
      },
    };
  });

  await sdk.portability.provideImport(async (section: PluginExportSection, ctx: ImportContext) => {
    if (section.schemaVersion !== 3 || !isWardenImportData(section.data)) {
      throw new Error('Warden import section has an unrecognized shape.');
    }
    const data = section.data;
    const database = (await sdk.db.getClient()) as BaseSQLiteDatabase<'async', unknown>;

    // Additive only, like every other plugin's import handler — nothing here
    // ever overwrites or removes a row the importing account already has.
    for (const session of data.sessions) {
      const newSessionId = ctx.remapId(session.id);
      await database.insert(wardenSessions).values({
        id: newSessionId,
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        title: session.title,
        // Preserved as exported, including pinnedAt — this can in principle
        // land more than MAX_PINNED_SESSIONS pinned rows for an account that
        // already had some pinned before importing a bundle that also has
        // some pinned. That cap is enforced at the interactive pinSession()
        // call site, not as a table invariant; nothing breaks if it's
        // temporarily exceeded by a restore, and the user can unpin down to
        // the cap afterward the same way they always can.
        pinnedAt: session.pinnedAt,
        lastActiveAt: session.lastActiveAt,
        createdAt: session.createdAt,
      });
      for (const message of session.messages) {
        await database.insert(wardenMessages).values({
          id: ctx.remapId(message.id),
          sessionId: newSessionId,
          // Defensive coercion, matching `sessions.ts`'s own `toMessageView`
          // — the DB column has no CHECK constraint, so a malformed bundle
          // could otherwise smuggle an arbitrary string into this column.
          role: message.role === 'assistant' ? 'assistant' : 'user',
          content: message.content,
          // Kept as-is, never remapped: this is `sdk.connections`' id for
          // the provider that answered, not one of this plugin's own ids —
          // remapId is for referential integrity between rows *this*
          // handler is inserting, and has no relationship to the connections
          // table. It almost certainly won't resolve to a real connection on
          // the importing account (a fresh account, or the same account on
          // a different instance), which is fine: like `model`, it's kept
          // as inert historical metadata, never dereferenced when rendering
          // past messages. Same posture as Tasks' own `assigneeId` field.
          providerId: message.providerId,
          model: message.model,
          createdAt: message.createdAt,
        });
      }
    }

    // Exceptions-only table (see the schema's own doc comment) — insert only
    // the overrides the importing account doesn't already have, so a second
    // import (or importing into an account that already made some choices)
    // never creates a duplicate row for the same model key.
    for (const modelKey of data.modelVisibility) {
      const existing = await database
        .select({ id: wardenModelVisibilityOverrides.id })
        .from(wardenModelVisibilityOverrides)
        .where(
          and(
            eq(wardenModelVisibilityOverrides.userId, ctx.userId),
            eq(wardenModelVisibilityOverrides.modelKey, modelKey),
          ),
        )
        .limit(1);
      if (existing[0]) continue;
      await database.insert(wardenModelVisibilityOverrides).values({
        id: crypto.randomUUID(),
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        modelKey,
        createdAt: Date.now(),
      });
    }

    // Per-user singleton (see the schema's own doc comment) — seeded only
    // when the importing account doesn't already have a settings row, same
    // "additive, never overwrites" rule Tasks' own notification-prefs import
    // follows for its one singleton table.
    if (data.defaultModelKey !== null) {
      const existingSettings = await database
        .select({ id: wardenUserSettings.id })
        .from(wardenUserSettings)
        .where(eq(wardenUserSettings.userId, ctx.userId))
        .limit(1);
      if (!existingSettings[0]) {
        await database.insert(wardenUserSettings).values({
          id: crypto.randomUUID(),
          tenantId: ctx.tenantId,
          userId: ctx.userId,
          defaultModelKey: data.defaultModelKey,
          createdAt: Date.now(),
        });
      }
    }
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
    // Warden owns four user-scoped tables, not two. The preference tables
    // were missed when they were introduced (task 22.9), leaving a deleted
    // account's model-visibility choices — which reveal exactly which
    // models they used — and their default model behind indefinitely.
    // Both carry `user_id` directly, so neither needs the session join.
    const [visibility, settings] = await Promise.all([
      database
        .select({ id: wardenModelVisibilityOverrides.id })
        .from(wardenModelVisibilityOverrides)
        .where(eq(wardenModelVisibilityOverrides.userId, ctx.userId)),
      database
        .select({ id: wardenUserSettings.id })
        .from(wardenUserSettings)
        .where(eq(wardenUserSettings.userId, ctx.userId)),
    ]);

    await database.delete(wardenMessages).where(inArray(wardenMessages.sessionId, sessionIds));
    await database.delete(wardenSessions).where(eq(wardenSessions.userId, ctx.userId));
    await database
      .delete(wardenModelVisibilityOverrides)
      .where(eq(wardenModelVisibilityOverrides.userId, ctx.userId));
    await database.delete(wardenUserSettings).where(eq(wardenUserSettings.userId, ctx.userId));

    return {
      deleted: messages.length + sessions.length + visibility.length + settings.length,
    };
  });
}
