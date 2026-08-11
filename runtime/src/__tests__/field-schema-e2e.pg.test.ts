import { randomBytes, randomUUID } from 'node:crypto';
import { sql, eq } from 'drizzle-orm';
import { sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * Live-Postgres twin of field-schema-e2e.sqld.test.ts — proves the leg-3
 * write path is genuinely dialect-portable: the same sqlite-core table
 * definition (the documented plugin pattern — plugins query through their
 * sqlite-core schema on either dialect, `docs/plugin-database.md`), the same
 * helpers, the same seal/open path, against a real Postgres via the real
 * node-postgres drizzle client. Skipped unless TEST_DATABASE_URL is set.
 */
const PG_URL = process.env.TEST_DATABASE_URL;

const PLUGIN_ID = 'fs.test.e2e-plugin-pg';

vi.mock('next/headers', () => ({
  headers: async () => new Headers({ 'x-sovereign-plugin-id': PLUGIN_ID }),
}));

let testPdb: import('@sovereignfs/db').PlatformDb;
vi.mock('@sovereignfs/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sovereignfs/db')>();
  return { ...actual, getPlatformDb: async () => testPdb };
});

import { createClient } from '@sovereignfs/db';
import { blindIndex, encryptedText } from '@sovereignfs/sdk/drizzle';
import { provideHost, type SdkHost } from '@sovereignfs/sdk';

const KEYS_DDL = `CREATE TABLE IF NOT EXISTS field_encryption_keys (
  id text PRIMARY KEY NOT NULL,
  plugin_id text NOT NULL,
  class text NOT NULL,
  wrapped_dek text NOT NULL,
  wrapped_hmac_key text NOT NULL,
  wrapped_hmac_key_previous text,
  hmac_rotation_started_at bigint,
  kek_fingerprint text NOT NULL,
  created_at bigint NOT NULL,
  updated_at bigint NOT NULL
)`;
const KEYS_IDX = `CREATE UNIQUE INDEX IF NOT EXISTS field_encryption_keys_plugin_class_idx
  ON field_encryption_keys (plugin_id, class)`;
// Long-lived test databases may pre-date migration 0023 — add its columns
// tolerantly (sqlite has no ADD COLUMN IF NOT EXISTS; a duplicate errors and
// is ignored).
const KEYS_ALTERS = [
  `ALTER TABLE field_encryption_keys ADD COLUMN IF NOT EXISTS wrapped_hmac_key_previous text`,
  `ALTER TABLE field_encryption_keys ADD COLUMN IF NOT EXISTS hmac_rotation_started_at bigint`,
];

const TABLE_NAME = `e2e_entries_${randomUUID().slice(0, 8)}`;

/**
 * The live client, typed the way a plugin sees it: sdk.db.getClient() returns
 * `DrizzleClient = unknown` and plugins cast to their (sqlite-core-typed)
 * drizzle client regardless of the live dialect — querying a sqliteTable
 * through the postgres client is the documented pattern this test exists to
 * prove (docs/plugin-database.md), so the cast mirrors production usage.
 */
function liveDb() {
  if (testPdb.dialect !== 'postgres') throw new Error('expected the postgres dialect client');
  return testPdb.db as unknown as import('drizzle-orm/better-sqlite3').BetterSQLite3Database;
}

/** Raw SQL against the postgres-dialect drizzle client. */
async function rawRun(query: ReturnType<typeof sql.raw> | ReturnType<typeof sql>): Promise<void> {
  await (testPdb.db as { execute: (q: unknown) => Promise<unknown> }).execute(query);
}
async function rawGet<T>(query: ReturnType<typeof sql.raw>): Promise<T | undefined> {
  const result = await (testPdb.db as { execute: (q: unknown) => Promise<{ rows: T[] }> }).execute(
    query,
  );
  return result.rows[0];
}

const entries = sqliteTable(TABLE_NAME, {
  id: text('id').primaryKey(),
  notes: encryptedText('notes', { sensitivity: 'health' }),
  notesIdx: blindIndex('notes_bidx', { source: 'notes' }),
  title: text('title'),
});

describe.skipIf(!PG_URL)('leg 3 end-to-end (live Postgres, real crypto, real drizzle)', () => {
  const saved: Record<string, string | undefined> = {};

  beforeAll(async () => {
    for (const [k, v] of Object.entries({
      SOVEREIGN_FIELD_KEK: randomBytes(32).toString('base64'),
      SOVEREIGN_ENCRYPT_CLASSES: 'health',
    })) {
      saved[k] = process.env[k];
      if (v !== undefined) process.env[k] = v;
    }

    testPdb = createClient({ dialect: 'postgres', url: PG_URL });
    await rawRun(sql.raw(KEYS_DDL));
    await rawRun(sql.raw(KEYS_IDX));
    for (const alter of KEYS_ALTERS) {
      try {
        await rawRun(sql.raw(alter));
      } catch {
        // column already exists
      }
    }
    await rawRun(
      sql.raw(
        `CREATE TABLE IF NOT EXISTS ${TABLE_NAME} (
          id text PRIMARY KEY NOT NULL,
          notes text, notes_bidx text, title text
        )`,
      ),
    );

    const {
      encryptFieldValue,
      decryptFieldValue,
      hashFieldValue,
      hashFieldCandidatesValue,
      registerTablesValue,
      requireCryptoPluginContext,
    } = await import('../field-crypto');
    const manifest = { id: PLUGIN_ID, permissions: ['crypto:use'] };
    const resolve = (ctx: { tenantId: string; pluginId: string | null }) => {
      if (!ctx.pluginId) throw new Error('no plugin context');
      requireCryptoPluginContext(ctx.pluginId, manifest);
      return { tenantId: ctx.tenantId, pluginId: ctx.pluginId };
    };
    const crypto: SdkHost['crypto'] = {
      async encryptField(value, options, ctx) {
        return encryptFieldValue(value, options, resolve(ctx));
      },
      async decryptField(envelope, options, ctx) {
        return decryptFieldValue(envelope, options, resolve(ctx));
      },
      async hashField(value, options, ctx) {
        return hashFieldValue(value, options, resolve(ctx));
      },
      async hashFieldCandidates(value, options, ctx) {
        return hashFieldCandidatesValue(value, options, resolve(ctx));
      },
      async registerTables(metadata, ctx) {
        return registerTablesValue(metadata, resolve(ctx));
      },
    };
    provideHost({ crypto } as unknown as SdkHost);
  });

  afterAll(async () => {
    await rawRun(sql.raw(`DROP TABLE IF EXISTS ${TABLE_NAME}`));
    await rawRun(sql`DELETE FROM field_encryption_keys WHERE plugin_id = ${PLUGIN_ID}`);
    for (const [k, v] of Object.entries(saved)) {
      // Reflect.deleteProperty, not `delete env[k]` — next build's own ESLint
      // pass enforces @typescript-eslint/no-dynamic-delete over runtime/src.
      if (v === undefined) Reflect.deleteProperty(process.env, k);
      else process.env[k] = v;
    }
  });

  it('sealed insert → ciphertext at rest → tripwire → exact match → open, on Postgres', async () => {
    const { sdk } = await import('@sovereignfs/sdk');
    const sdkCrypto = sdk.crypto;
    const db = liveDb();

    const sealed = await sdkCrypto.seal(entries, {
      id: 'row-1',
      notes: 'blood pressure 120/80',
      title: 'checkup',
    });
    await db.insert(entries).values(sealed);

    const raw = await rawGet<{ notes: string; notes_bidx: string }>(
      sql.raw(`SELECT notes, notes_bidx FROM ${TABLE_NAME} WHERE id = 'row-1'`),
    );
    expect(raw?.notes.startsWith('svf1:')).toBe(true);
    expect(raw?.notes).not.toContain('blood pressure');

    await expect(
      db.insert(entries).values({ id: 'row-2', notes: 'raw plaintext' }),
    ).rejects.toThrow(/sdk\.crypto\.seal/);
    const leaked = await rawGet<{ c: string | number }>(
      sql.raw(`SELECT count(*) AS c FROM ${TABLE_NAME} WHERE id = 'row-2'`),
    );
    expect(Number(leaked?.c)).toBe(0);

    const needle = await sdkCrypto.hashField('blood pressure 120/80', { sensitivity: 'health' });
    const hits = await db.select().from(entries).where(eq(entries.notesIdx, needle));
    expect(hits).toHaveLength(1);

    const opened = await sdkCrypto.open(entries, hits);
    expect((opened[0] as { notes: string }).notes).toBe('blood pressure 120/80');
  });
});
