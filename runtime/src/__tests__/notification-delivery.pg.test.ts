import { randomUUID } from 'node:crypto';
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * Live-Postgres coverage for `deliverNotification()`'s mute-policy matrix
 * (RFC 0048 §6) — the funnel every notification send path (plugin sends,
 * admin/broadcast sends, message-generated notifications) now goes through.
 * Skipped unless TEST_DATABASE_URL is set, matching every other `.pg.test.ts`
 * in this repo (`TEST_DATABASE_URL=postgres://user:pass@localhost:5432/db pnpm test`).
 *
 * `deliverNotification`'s 'delivered' path fire-and-forgets
 * `fanOutPushToUser` (`../push`) — no test here asserts on push delivery
 * itself (that's `push.test.ts`'s job), so it's mocked to a no-op rather
 * than exercised for real. This also sidesteps two real problems a first
 * attempt hit going through the real thing: `fanOutPushToUser` resolves
 * `@sovereignfs/db`'s `getPlatformDb()` singleton internally, which by
 * default points at `POSTGRES_DB_URL`'s default schema — the *same* default
 * schema `messages.pg.test.ts` (a sibling file needing the same full
 * platform schema, running concurrently in its own worker process against
 * the same shared `TEST_DATABASE_URL`) also bootstraps into. Pointing both
 * at the real migrator there raced in CI ("relation already exists" — the
 * advisory lock serializes the two `runMigrations()` calls against each
 * other, not against each other's already-committed state); routing both
 * through `bootstrapPlatformDb()` instead raced too, just via a different
 * mechanism (`CREATE TABLE IF NOT EXISTS` is not safe against true
 * concurrency either — two sessions can both pass the existence check, then
 * collide inserting into `pg_catalog.pg_type`). Both reproduced live against
 * a real `postgres:16` container before landing on the fix below: this file
 * gets its own fresh, `randomUUID()`-suffixed schema (`freshSchema()`, same
 * technique `packages/db`'s own `platform-db.pg.test.ts` uses) — nothing
 * shared with `messages.pg.test.ts`'s own isolated schema to race over —
 * and mocking `fanOutPushToUser` means nothing ever needs `getPlatformDb()`
 * to resolve to this file's schema-scoped `pdb` in the first place, so
 * there's no singleton to pin and no background query left running after
 * this file's own tests (and their pool) are done.
 *
 * Isolation *within* this file comes from a fresh `randomUUID()`
 * recipientUserId per test, the same strategy `field-schema-e2e.pg.test.ts`
 * uses via a randomly-suffixed table name.
 */
const PG_URL = process.env.TEST_DATABASE_URL;

vi.mock('../push', () => ({ fanOutPushToUser: async () => {} }));

import {
  bootstrapPlatformDb,
  countUnreadNotifications,
  listUserNotifications,
  setNotificationPrefs,
} from '@sovereignfs/db';
import { deliverNotification } from '../notification-delivery';

let pdb: import('@sovereignfs/db').PlatformDb;
let schemaPool: Pool;

/** A fresh, isolated Postgres schema for this file — see the header comment for why. */
async function freshSchema(): Promise<import('@sovereignfs/db').PlatformDb> {
  const admin = new Pool({ connectionString: PG_URL });
  const schema = `test_notification_delivery_${randomUUID().replace(/-/g, '_')}`;
  try {
    await admin.query(`CREATE SCHEMA "${schema}"`);
  } finally {
    await admin.end();
  }
  schemaPool = new Pool({ connectionString: PG_URL, options: `-c search_path="${schema}"` });
  return {
    dialect: 'postgres',
    db: drizzlePg(schemaPool),
  } as unknown as import('@sovereignfs/db').PlatformDb;
}

beforeAll(async () => {
  if (!PG_URL) return;
  process.env.DB_DIALECT = 'postgres';
  process.env.POSTGRES_DB_URL = PG_URL;
  pdb = await freshSchema();
  await bootstrapPlatformDb(pdb);
});

afterAll(async () => {
  if (schemaPool) await schemaPool.end();
});

describe.skipIf(!PG_URL)('deliverNotification (RFC 0048 §6 mute policy)', () => {
  it('delivers a non-muted notification: row exists, unread, broker/push attempted', async () => {
    const userId = randomUUID();
    const result = await deliverNotification(pdb, {
      recipientUserId: userId,
      source: 'com.example.notes',
      sourceType: 'plugin',
      title: 'Export ready',
      category: 'info',
    });

    expect(result.outcome).toBe('delivered');
    expect(result.id).toBeTruthy();
    expect(await countUnreadNotifications(pdb, userId)).toBe(1);
    const items = await listUserNotifications(pdb, userId);
    expect(items[0]).toMatchObject({ dismissedAt: null, readAt: null });
  });

  it('drops a muted plugin-sourced notification entirely — no row at all', async () => {
    const userId = randomUUID();
    await setNotificationPrefs(pdb, userId, { mutedCategories: ['info'] });

    const result = await deliverNotification(pdb, {
      recipientUserId: userId,
      source: 'com.example.notes',
      sourceType: 'plugin',
      title: 'Export ready',
      category: 'info',
    });

    expect(result).toEqual({ id: null, outcome: 'dropped' });
    expect(await countUnreadNotifications(pdb, userId)).toBe(0);
    expect(await listUserNotifications(pdb, userId, { includeDismissed: true })).toHaveLength(0);
  });

  it('stores a muted admin-sourced notification silently — row exists for audit, but pre-dismissed and not unread', async () => {
    const userId = randomUUID();
    await setNotificationPrefs(pdb, userId, { mutedCategories: ['announcement'] });

    const result = await deliverNotification(pdb, {
      recipientUserId: userId,
      source: 'admin',
      sourceType: 'admin',
      title: 'Instance notice',
      category: 'announcement',
    });

    expect(result.outcome).toBe('stored-silent');
    expect(result.id).toBeTruthy();
    expect(await countUnreadNotifications(pdb, userId)).toBe(0);
    // Invisible to the default inbox view (dismissed rows excluded)...
    expect(await listUserNotifications(pdb, userId)).toHaveLength(0);
    // ...but still present for audit when explicitly requested.
    const audited = await listUserNotifications(pdb, userId, { includeDismissed: true });
    expect(audited).toHaveLength(1);
    expect(audited[0]).toMatchObject({
      dismissedAt: expect.any(Number),
      readAt: expect.any(Number),
    });
  });

  it('always delivers a security-category notification, even when a different category is muted', async () => {
    const userId = randomUUID();
    await setNotificationPrefs(pdb, userId, { mutedCategories: ['announcement'] });

    const result = await deliverNotification(pdb, {
      recipientUserId: userId,
      source: 'admin',
      sourceType: 'admin',
      title: 'Suspicious sign-in',
      category: 'security',
    });

    expect(result.outcome).toBe('delivered');
    expect(await countUnreadNotifications(pdb, userId)).toBe(1);
  });

  it('security notifications survive even a literal (server-side-stripped) security mute attempt', async () => {
    const userId = randomUUID();
    // setNotificationPrefs strips 'security' from mutedCategories at the
    // write boundary (platform-db.ts) — confirms that stripping, not just
    // deliverNotification's own bypass, is what makes this unmutable.
    const prefs = await setNotificationPrefs(pdb, userId, { mutedCategories: ['security'] });
    expect(prefs.mutedCategories).not.toContain('security');

    const result = await deliverNotification(pdb, {
      recipientUserId: userId,
      source: 'admin',
      sourceType: 'admin',
      title: 'Suspicious sign-in',
      category: 'security',
    });

    expect(result.outcome).toBe('delivered');
  });

  it('dual-writes actionUrl/url and derives summary from body when omitted (RFC 0048 §8 compat)', async () => {
    const userId = randomUUID();
    await deliverNotification(pdb, {
      recipientUserId: userId,
      source: 'com.example.notes',
      sourceType: 'plugin',
      title: 'Export ready',
      body: 'Your CSV export finished successfully and is ready to download.',
      actionUrl: '/notes/exports/1',
      category: 'info',
    });

    const items = await listUserNotifications(pdb, userId);
    expect(items[0]).toMatchObject({
      url: '/notes/exports/1',
      actionUrl: '/notes/exports/1',
      summary: 'Your CSV export finished successfully and is ready to download.',
    });
  });
});
