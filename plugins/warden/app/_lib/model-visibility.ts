import { and, eq, inArray } from 'drizzle-orm';
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import { sdk } from '@sovereignfs/sdk';
import { wardenModelVisibilityOverrides } from '../_db/schema';
import { isVisibleByDefault } from './model-visibility-policy';

/**
 * Per-user model visibility, split by source (RFC 0063 follow-up): the
 * local model defaults to visible (there's only ever one — no flood risk,
 * and it's meant to be a zero-friction bonus), while every provider-sourced
 * model defaults to hidden — a single provider's catalog can run into the
 * hundreds (OpenRouter alone returns 400+), so requiring an explicit opt-in
 * is what actually keeps the chat selector usable. See the table's own doc
 * comment (`_db/schema.ts`) for how a single "override" row means different
 * things depending on which default it's flipping away from.
 *
 * Re-exports the pure default/visibility functions from
 * `model-visibility-policy.ts` so existing server-side imports of this
 * module keep working — but a client component must import
 * `model-visibility-policy` directly, never this file, since this file
 * pulls in `@sovereignfs/sdk` (and transitively `next/headers`) at module
 * scope via `sdk.db.getClient()`.
 */
export { isModelVisible, isVisibleByDefault } from './model-visibility-policy';

// No `any` needed — see conversations.ts's `Db` for why `unknown` suffices.
type Db = BaseSQLiteDatabase<'async', unknown>;

async function db(): Promise<Db> {
  return (await sdk.db.getClient()) as Db;
}

/** Every model key this user has flipped away from its own computed default. */
export async function listVisibilityOverrides(
  userId: string,
  tenantId: string,
): Promise<Set<string>> {
  const database = await db();
  const rows = await database
    .select({ modelKey: wardenModelVisibilityOverrides.modelKey })
    .from(wardenModelVisibilityOverrides)
    .where(
      and(
        eq(wardenModelVisibilityOverrides.userId, userId),
        eq(wardenModelVisibilityOverrides.tenantId, tenantId),
      ),
    );
  return new Set(rows.map((row) => row.modelKey));
}

/**
 * Sets whether `modelKey` is visible for this user. If `visible` already
 * matches the key's computed default, any stale override row is removed
 * instead of stored — this table only ever holds genuine exceptions, so a
 * user toggling a model back to its default state shrinks the table rather
 * than leaving a redundant row.
 */
export async function setModelVisibility(
  userId: string,
  tenantId: string,
  modelKey: string,
  visible: boolean,
): Promise<void> {
  const database = await db();
  const matchesDefault = visible === isVisibleByDefault(modelKey);
  const existing = await database
    .select({ id: wardenModelVisibilityOverrides.id })
    .from(wardenModelVisibilityOverrides)
    .where(
      and(
        eq(wardenModelVisibilityOverrides.userId, userId),
        eq(wardenModelVisibilityOverrides.tenantId, tenantId),
        eq(wardenModelVisibilityOverrides.modelKey, modelKey),
      ),
    )
    .limit(1);

  if (matchesDefault) {
    if (!existing[0]) return;
    await database
      .delete(wardenModelVisibilityOverrides)
      .where(
        and(
          eq(wardenModelVisibilityOverrides.userId, userId),
          eq(wardenModelVisibilityOverrides.tenantId, tenantId),
          eq(wardenModelVisibilityOverrides.modelKey, modelKey),
        ),
      );
    return;
  }

  if (existing[0]) return;
  await database.insert(wardenModelVisibilityOverrides).values({
    id: crypto.randomUUID(),
    tenantId,
    userId,
    modelKey,
    createdAt: Date.now(),
  });
}

/**
 * `setModelVisibility` for a whole provider's catalog at once — the Models
 * page's per-group "Show all" / "Hide all". One read of the user's existing
 * overrides, then at most one bulk insert and one bulk delete, rather than
 * a select-and-write per key: a single provider's catalog can run to
 * several hundred models. Same exceptions-only invariant as the single
 * version — a key ending up at its computed default has no row.
 */
export async function setModelVisibilityMany(
  userId: string,
  tenantId: string,
  modelKeys: string[],
  visible: boolean,
): Promise<void> {
  if (modelKeys.length === 0) return;
  const database = await db();
  const unique = [...new Set(modelKeys)];
  const existing = await listVisibilityOverrides(userId, tenantId);

  // A row means "flipped away from the default": keys whose requested
  // state differs from their default need a row; the rest must have none.
  const needsRow = unique.filter((key) => visible !== isVisibleByDefault(key));
  const needsNoRow = unique.filter((key) => visible === isVisibleByDefault(key));

  const toInsert = needsRow.filter((key) => !existing.has(key));
  const toDelete = needsNoRow.filter((key) => existing.has(key));

  if (toDelete.length > 0) {
    await database
      .delete(wardenModelVisibilityOverrides)
      .where(
        and(
          eq(wardenModelVisibilityOverrides.userId, userId),
          eq(wardenModelVisibilityOverrides.tenantId, tenantId),
          inArray(wardenModelVisibilityOverrides.modelKey, toDelete),
        ),
      );
  }
  if (toInsert.length > 0) {
    const now = Date.now();
    await database.insert(wardenModelVisibilityOverrides).values(
      toInsert.map((modelKey) => ({
        id: crypto.randomUUID(),
        tenantId,
        userId,
        modelKey,
        createdAt: now,
      })),
    );
  }
}
