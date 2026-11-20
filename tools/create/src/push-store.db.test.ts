import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { enqueuePush, generatePushKeys, runPushOutbox } from '@sovereignfs/push';
import { pushStoreConformance, sampleSubscription } from '@sovereignfs/push/testing';

/**
 * The template's push store (`lib/push.ts`) on a real PostgreSQL, with the template's own migration: it passes the conformance suite
 * every store passes, and a push queued in a transaction that is rolled back is never sent. Runs when SV_DB_DIALECT is postgres.
 */
const url = process.env.SV_POSTGRES_URL;
const run = process.env.SV_DB_DIALECT === 'postgres' && url !== undefined;
const here = path.dirname(fileURLToPath(import.meta.url));
const schema = `push_${randomBytes(6).toString('hex')}`;

// The template reads its secret by the placeholder's name: the store seals a device's keys with it.
process.env.__PREFIX___AUTH_SECRET = 'a-secret-for-the-push-store-test-only';
const { pushStore } = await import('../template/app/lib/push');

describe.runIf(run)("the template's push store on PostgreSQL", () => {
  let admin: pg.Pool;
  let pool: pg.Pool;

  beforeAll(async () => {
    admin = new pg.Pool({ connectionString: url, max: 1 });
    await admin.query(`CREATE SCHEMA ${schema}`);
    pool = new pg.Pool({ connectionString: url, max: 6, options: `-c search_path=${schema}` });
    await pool.query(
      readFileSync(path.join(here, '../template/app/migrations/002_push.sql'), 'utf8'),
    );
  });
  afterAll(async () => {
    await pool?.end();
    await admin?.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin?.end();
  });

  const fresh = async () => {
    await pool.query('TRUNCATE push_outbox, push_devices');
    return pushStore(pool);
  };

  describe('passes the conformance suite', () => {
    for (const { name, run: test } of pushStoreConformance(fresh)) it(name, test);
  });

  it('keeps the keys sealed, never as text', async () => {
    const store = await fresh();
    const device = sampleSubscription(3);
    await store.saveDevice('alice', device, 1);
    const { rows } = await pool.query<{ keys: string }>('SELECT keys FROM push_devices');
    expect(rows[0]?.keys).not.toContain(device.p256dh);
    expect(rows[0]?.keys).not.toContain(device.auth);
    expect(await store.devices('alice')).toEqual([device]);
  });

  it('never sends a push queued in a change that is rolled back', async () => {
    const store = await fresh();
    await store.saveDevice('alice', sampleSubscription(1), 1);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      expect(
        await enqueuePush(pushStore(client), {
          account: 'alice',
          message: { title: 'Hi' },
          now: 1,
        }),
      ).toBe(1);
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
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
