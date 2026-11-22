import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate, readMigrations, type Database } from '@sovereignfs/database';
import { createTestDatabase, type TestDatabase } from '@sovereignfs/database/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { enqueuePush, generatePushKeys, runPushOutbox } from '@sovereignfs/push';
import { pushStoreConformance, sampleSubscription } from '@sovereignfs/push/testing';

/**
 * The template's push store (`lib/push.ts`) on the database the run names (a SQLite file, sqld or PostgreSQL), with the template's own
 * migrations for that form: it passes the conformance suite every store passes, and a push queued in a transaction that is rolled back
 * is never sent.
 */
const here = path.dirname(fileURLToPath(import.meta.url));

// The template reads its secret by the placeholder's name: the store seals a device's keys with it.
process.env.__PREFIX___AUTH_SECRET = 'a-secret-for-the-push-store-test-only';
const { pushStore } = await import('../template/app/lib/push');

describe('the template’s push store', () => {
  let target: TestDatabase;
  let db: Database;

  beforeAll(async () => {
    target = await createTestDatabase();
    db = await target.open();
    const folder = path.join(here, '../template/app/migrations', db.family);
    await migrate(db, readMigrations(folder), { table: 'app_migrations' });
  });
  afterAll(async () => {
    await db?.close();
    await target?.cleanup();
  });

  const fresh = async () => {
    await db.run('DELETE FROM push_outbox');
    await db.run('DELETE FROM push_devices');
    return pushStore(db);
  };

  describe('passes the conformance suite', () => {
    for (const { name, run: test } of pushStoreConformance(fresh)) it(name, test);
  });

  it('keeps the keys sealed, never as text', async () => {
    const store = await fresh();
    const device = sampleSubscription(3);
    await store.saveDevice('alice', device, 1);
    const { rows } = await db.run('SELECT keys FROM push_devices');
    expect(String(rows[0]?.keys)).not.toContain(device.p256dh);
    expect(String(rows[0]?.keys)).not.toContain(device.auth);
    expect(await store.devices('alice')).toEqual([device]);
  });

  it('never sends a push queued in a change that is rolled back', async () => {
    const store = await fresh();
    await store.saveDevice('alice', sampleSubscription(1), 1);
    await expect(
      db.transaction(async (tx) => {
        expect(
          await enqueuePush(pushStore(tx), { account: 'alice', message: { title: 'Hi' }, now: 1 }),
        ).toBe(1);
        throw new Error('the change failed');
      }),
    ).rejects.toThrow('the change failed');
    const sent: string[] = [];
    const pass = await runPushOutbox({
      store,
      settings: { ...generatePushKeys(), subject: 'https://app.example.com' },
      now: 2,
      fetch: async (endpoint) => {
        sent.push(String(endpoint));
        return new Response(null, { status: 201 });
      },
    });
    expect(pass).toEqual({ sent: 0, retry: 0, dropped: 0, forgotten: 0 });
    expect(sent).toEqual([]);
  });
});
