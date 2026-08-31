import { eq } from 'drizzle-orm';
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import { sdk } from '@sovereignfs/sdk';
import { wardenUserSettings } from '../_db/schema';

/**
 * Warden's per-user preferences (RFC 0063 §11, epic task 22.9) — currently
 * just the default model for a brand-new session. Get-or-create, one row
 * per user, same lazy-row pattern the old single-conversation table used.
 */

type Db = BaseSQLiteDatabase<'async', unknown>;

async function db(): Promise<Db> {
  return (await sdk.db.getClient()) as Db;
}

async function getOrCreateRow(
  database: Db,
  userId: string,
  tenantId: string,
): Promise<{ id: string; defaultModelKey: string | null }> {
  const existing = await database
    .select()
    .from(wardenUserSettings)
    .where(eq(wardenUserSettings.userId, userId))
    .limit(1);
  if (existing[0]) return existing[0];

  const id = crypto.randomUUID();
  await database.insert(wardenUserSettings).values({
    id,
    tenantId,
    userId,
    defaultModelKey: null,
    createdAt: Date.now(),
  });
  return { id, defaultModelKey: null };
}

/** `null` means "no explicit default — fall back to the first visible
 *  model," the same behavior as before this setting existed. */
export async function getDefaultModelKey(userId: string, tenantId: string): Promise<string | null> {
  const database = await db();
  const row = await getOrCreateRow(database, userId, tenantId);
  return row.defaultModelKey;
}

/** Pass `null` to clear back to "no explicit default." */
export async function setDefaultModelKey(
  userId: string,
  tenantId: string,
  modelKey: string | null,
): Promise<void> {
  const database = await db();
  await getOrCreateRow(database, userId, tenantId);
  await database
    .update(wardenUserSettings)
    .set({ defaultModelKey: modelKey })
    .where(eq(wardenUserSettings.userId, userId));
}
