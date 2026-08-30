import { randomBytes, randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * Live-Postgres twin of field-rotation-e2e.sqld.test.ts (task 8.36) — the
 * Postgres `UPDATE`-batching path in `walkOneTable` (`../field-reseal.ts`)
 * had zero dialect coverage before this file; the sqld test only exercises
 * the SQLite branch. Mirrors field-schema-e2e.pg.test.ts's Postgres setup
 * conventions (bigint columns, `execute()`-based raw helpers). Skipped
 * unless TEST_DATABASE_URL is set.
 */
const PG_URL = process.env.TEST_DATABASE_URL;

const PLUGIN_ID = 'fs.test.reseal-plugin-pg';

vi.mock('next/headers', () => ({
  headers: async () => new Headers({ 'x-sovereign-plugin-id': PLUGIN_ID }),
}));

let testPdb: import('@sovereignfs/db').PlatformDb;
vi.mock('@sovereignfs/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sovereignfs/db')>();
  return { ...actual, getPlatformDb: async () => testPdb };
});

import {
  completeHmacRotation,
  createClient,
  fieldKekFromEnv,
  getFieldKeyRow,
  listOpenHmacRotations,
  startHmacRotation,
  wrapKeyMaterial,
} from '@sovereignfs/db';
import { blindIndex, blindIndexMatch, encryptedText } from '@sovereignfs/sdk/drizzle';
import { provideHost, type SdkHost } from '@sovereignfs/sdk';

const KEYS_DDL = `CREATE TABLE IF NOT EXISTS field_encryption_keys (
  id text PRIMARY KEY NOT NULL, plugin_id text NOT NULL, class text NOT NULL,
  wrapped_dek text NOT NULL, wrapped_hmac_key text NOT NULL,
  wrapped_hmac_key_previous text, hmac_rotation_started_at bigint,
  kek_fingerprint text NOT NULL, created_at bigint NOT NULL, updated_at bigint NOT NULL
)`;
const KEYS_IDX = `CREATE UNIQUE INDEX IF NOT EXISTS field_encryption_keys_plugin_class_idx
  ON field_encryption_keys (plugin_id, class)`;
const REG_DDL = `CREATE TABLE IF NOT EXISTS field_table_registrations (
  id text PRIMARY KEY NOT NULL, plugin_id text NOT NULL, table_name text NOT NULL,
  metadata text NOT NULL, updated_at bigint NOT NULL
)`;
const REG_IDX = `CREATE UNIQUE INDEX IF NOT EXISTS field_table_registrations_plugin_table_idx
  ON field_table_registrations (plugin_id, table_name)`;
const CKPT_DDL = `CREATE TABLE IF NOT EXISTS field_reseal_checkpoints (
  id text PRIMARY KEY NOT NULL, job text NOT NULL, plugin_id text NOT NULL,
  table_name text NOT NULL, last_pk text NOT NULL, updated_at bigint NOT NULL
)`;
const CKPT_IDX = `CREATE UNIQUE INDEX IF NOT EXISTS field_reseal_checkpoints_job_table_idx
  ON field_reseal_checkpoints (job, plugin_id, table_name)`;

const TABLE_NAME = `reseal_entries_${randomUUID().slice(0, 8)}`;

/**
 * The live client, typed the way a plugin sees it: sdk.db.getClient() returns
 * `DrizzleClient = unknown` and plugins cast to their (sqlite-core-typed)
 * drizzle client regardless of the live dialect — mirrors
 * field-schema-e2e.pg.test.ts's identical cast and its own doc comment.
 */
function liveDb() {
  if (testPdb.dialect !== 'postgres') throw new Error('expected the postgres dialect client');
  return testPdb.db as unknown as import('drizzle-orm/better-sqlite3').BetterSQLite3Database;
}

async function rawRun(query: ReturnType<typeof sql.raw> | ReturnType<typeof sql>): Promise<void> {
  await (testPdb.db as { execute: (q: unknown) => Promise<unknown> }).execute(query);
}
async function rawGet<T>(query: ReturnType<typeof sql.raw>): Promise<T | undefined> {
  const result = await (testPdb.db as { execute: (q: unknown) => Promise<{ rows: T[] }> }).execute(
    query,
  );
  return result.rows[0];
}

/**
 * Reconstruct the literal SQL text of a drizzle `SQL` object for test
 * assertions only — a `sql\`...\`` template's `queryChunks` nests raw-text
 * `StringChunk`s (`{ value: string[] }`) alongside further `SQL` sub-objects
 * (from `sql.raw()`/interpolated fragments, each with their own
 * `queryChunks`) and bound-parameter values (plain JS values, contributing
 * no literal text — they become `$1`/`$2` placeholders). Walks both nesting
 * shapes recursively and concatenates only the literal text.
 */
function flattenSqlText(node: unknown): string {
  if (node && typeof node === 'object') {
    const obj = node as { value?: unknown; queryChunks?: unknown[] };
    if (Array.isArray(obj.value)) return obj.value.map(String).join('');
    if (Array.isArray(obj.queryChunks)) return obj.queryChunks.map(flattenSqlText).join('');
  }
  return '';
}

const entries = sqliteTable(TABLE_NAME, {
  id: text('id').primaryKey(),
  notes: encryptedText('notes', { sensitivity: 'health' }),
  notesIdx: blindIndex('notes_bidx', { source: 'notes' }),
});

describe.skipIf(!PG_URL)('field-reseal walker (live Postgres, batched UPDATE)', () => {
  const saved: Record<string, string | undefined> = {};

  beforeAll(async () => {
    for (const [k, v] of Object.entries({
      DB_DIALECT: 'postgres',
      POSTGRES_DB_URL: PG_URL,
      SOVEREIGN_FIELD_KEK: randomBytes(32).toString('base64'),
      SOVEREIGN_ENCRYPT_CLASSES: 'health',
    })) {
      saved[k] = process.env[k];
      if (v !== undefined) process.env[k] = v;
    }

    testPdb = createClient({ dialect: 'postgres', url: PG_URL });
    for (const ddl of [KEYS_DDL, KEYS_IDX, REG_DDL, REG_IDX, CKPT_DDL, CKPT_IDX]) {
      await rawRun(sql.raw(ddl));
    }
    for (const alter of [
      `ALTER TABLE field_encryption_keys ADD COLUMN IF NOT EXISTS wrapped_hmac_key_previous text`,
      `ALTER TABLE field_encryption_keys ADD COLUMN IF NOT EXISTS hmac_rotation_started_at bigint`,
    ]) {
      await rawRun(sql.raw(alter));
    }
    await rawRun(
      sql.raw(
        `CREATE TABLE IF NOT EXISTS ${TABLE_NAME} (
          id text PRIMARY KEY NOT NULL, notes text, notes_bidx text
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

    const { sdk } = await import('@sovereignfs/sdk');
    await sdk.crypto.registerTables(entries);
  });

  afterAll(async () => {
    await rawRun(sql.raw(`DROP TABLE IF EXISTS ${TABLE_NAME}`));
    for (const table of [
      'field_encryption_keys',
      'field_table_registrations',
      'field_reseal_checkpoints',
    ]) {
      await rawRun(sql`DELETE FROM ${sql.raw(`"${table}"`)} WHERE plugin_id = ${PLUGIN_ID}`);
    }
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) Reflect.deleteProperty(process.env, k);
      else process.env[k] = v;
    }
  });

  async function searchNotes(term: string) {
    const { sdk } = await import('@sovereignfs/sdk');
    const candidates = await sdk.crypto.hashFieldCandidates(term, { sensitivity: 'health' });
    return liveDb().select().from(entries).where(blindIndexMatch(entries.notesIdx, candidates));
  }

  it('backfill: multi-row plaintext seal is findable afterward, sealed rows untouched', async () => {
    const { sdk } = await import('@sovereignfs/sdk');
    const { runReseal } = await import('../field-reseal');
    const db = liveDb();

    await db
      .insert(entries)
      .values(await sdk.crypto.seal(entries, { id: 'a', notes: 'aspirin 100mg' }));
    for (const [id, notes] of [
      ['b', 'ibuprofen 400mg'],
      ['c', 'paracetamol 500mg'],
      ['d', 'amoxicillin 250mg'],
    ] as const) {
      await rawRun(sql.raw(`INSERT INTO ${TABLE_NAME} (id, notes) VALUES ('${id}', '${notes}')`));
    }

    const backfill = await runReseal(testPdb, 'backfill', { pluginId: PLUGIN_ID });
    expect(backfill.skipped).toHaveLength(0);
    const table = backfill.tables.find((t) => t.tableName === TABLE_NAME);
    expect(table?.updated).toBe(3); // b, c, d -- a was already sealed, untouched

    for (const term of [
      'aspirin 100mg',
      'ibuprofen 400mg',
      'paracetamol 500mg',
      'amoxicillin 250mg',
    ]) {
      expect(await searchNotes(term)).toHaveLength(1);
    }
    const legacy = await rawGet<{ notes: string }>(
      sql.raw(`SELECT notes FROM ${TABLE_NAME} WHERE id = 'b'`),
    );
    expect(legacy?.notes.startsWith('svf1:')).toBe(true);
  });

  it('rotation: dual-read holds through the window, and re-seal updates every stale blind index', async () => {
    const { runReseal } = await import('../field-reseal');

    const kek = fieldKekFromEnv();
    if (!kek) throw new Error('KEK missing');
    const keyRow = await getFieldKeyRow(testPdb, PLUGIN_ID, 'health');
    if (!keyRow) throw new Error('key row missing');
    const opened = await startHmacRotation(
      testPdb,
      keyRow.id,
      wrapKeyMaterial(kek, randomBytes(32), {
        pluginId: PLUGIN_ID,
        class: 'health',
        purpose: 'hmac',
      }),
    );
    expect(opened).toBe(true);

    // During the window, before re-seal: dual-read still finds every row.
    for (const term of [
      'aspirin 100mg',
      'ibuprofen 400mg',
      'paracetamol 500mg',
      'amoxicillin 250mg',
    ]) {
      expect(await searchNotes(term)).toHaveLength(1);
    }

    const rotation = await runReseal(testPdb, 'rotate-index', { pluginId: PLUGIN_ID });
    expect(rotation.skipped).toHaveLength(0);
    const table = rotation.tables.find((t) => t.tableName === TABLE_NAME);
    expect(table?.updated).toBe(4); // every row's blind index is stale after rotation opens

    await completeHmacRotation(testPdb, keyRow.id);
    expect(await listOpenHmacRotations(testPdb)).toHaveLength(0);

    for (const term of [
      'aspirin 100mg',
      'ibuprofen 400mg',
      'paracetamol 500mg',
      'amoxicillin 250mg',
    ]) {
      expect(await searchNotes(term)).toHaveLength(1);
    }
  });

  it('issues one grouped UPDATE per batch, not one per row (task 8.36 regression guard)', async () => {
    const { runReseal } = await import('../field-reseal');

    const executeSpy = vi.spyOn(
      testPdb.db as unknown as { execute: (q: unknown) => Promise<unknown> },
      'execute',
    );
    executeSpy.mockClear();

    // Every row in this table shares the identical stale-blind-index shape
    // (rotate-index only ever touches notes_bidx here), so the whole batch
    // collapses into exactly one UPDATE group. Old per-row behavior would
    // have issued 4 UPDATEs (one per row); batched behavior issues 1.
    const summary = await runReseal(testPdb, 'rotate-index', { pluginId: PLUGIN_ID });
    const table = summary.tables.find((t) => t.tableName === TABLE_NAME);
    // Nothing left to update -- the prior test's rotation already re-sealed
    // every row and completed the window, so this call is a clean no-op
    // scan. Re-open a fresh rotation window to get real work to batch.
    expect(table?.updated).toBe(0);

    const kek = fieldKekFromEnv();
    if (!kek) throw new Error('KEK missing');
    const keyRow = await getFieldKeyRow(testPdb, PLUGIN_ID, 'health');
    if (!keyRow) throw new Error('key row missing');
    await startHmacRotation(
      testPdb,
      keyRow.id,
      wrapKeyMaterial(kek, randomBytes(32), {
        pluginId: PLUGIN_ID,
        class: 'health',
        purpose: 'hmac',
      }),
    );

    executeSpy.mockClear();
    const rotated = await runReseal(testPdb, 'rotate-index', { pluginId: PLUGIN_ID });
    const rotatedTable = rotated.tables.find((t) => t.tableName === TABLE_NAME);
    expect(rotatedTable?.updated).toBe(4);

    // Scope to queries against the walked data table itself -- runReseal
    // also issues SELECT/UPDATE/UPSERT calls against the metadata tables
    // (registrations, checkpoints), which aren't what this regression guard
    // is about.
    const tableRef = TABLE_NAME.toUpperCase();
    const calls = executeSpy.mock.calls
      .map((call) => flattenSqlText(call[0]).trim().toUpperCase())
      .filter((text) => text.includes(tableRef));
    const updateCalls = calls.filter((text) => text.startsWith('UPDATE'));
    const selectCalls = calls.filter((text) => text.startsWith('SELECT'));

    expect(selectCalls.length).toBe(1); // one batch, 4 rows fits under BATCH_SIZE
    // All 4 rows share the same changed-column shape (notes_bidx only) --
    // one UPDATE, not 4. This is the regression this task closes: pre-fix,
    // updateCalls.length would equal rotatedTable.updated (4).
    expect(updateCalls.length).toBe(1);

    await completeHmacRotation(testPdb, keyRow.id);
    executeSpy.mockRestore();
  });
});
