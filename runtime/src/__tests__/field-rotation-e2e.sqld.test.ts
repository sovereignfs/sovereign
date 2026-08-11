import { randomBytes, randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * Live-sqld end-to-end for leg 4 (RFC 0092 gate B, epic task 8.34): the
 * persisted table registration, the backfill transform, the blind-index
 * rotation window, and — the gate's core requirement — dual-read continuity:
 * exact-match search returns identical results before, during, and after a
 * rotation. Real crypto, real key rows, real walker, real drizzle client.
 */
const SQLD_URL = process.env.TEST_SQLD_URL;
const SQLD_ADMIN_URL = process.env.TEST_SQLD_ADMIN_URL;
const LIVE = Boolean(SQLD_URL && SQLD_ADMIN_URL);

const PLUGIN_ID = 'fs.test.rotation-plugin';

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
  wrapped_hmac_key_previous text, hmac_rotation_started_at integer,
  kek_fingerprint text NOT NULL, created_at integer NOT NULL, updated_at integer NOT NULL
)`;
const KEYS_IDX = `CREATE UNIQUE INDEX IF NOT EXISTS field_encryption_keys_plugin_class_idx
  ON field_encryption_keys (plugin_id, class)`;
const REG_DDL = `CREATE TABLE IF NOT EXISTS field_table_registrations (
  id text PRIMARY KEY NOT NULL, plugin_id text NOT NULL, table_name text NOT NULL,
  metadata text NOT NULL, updated_at integer NOT NULL
)`;
const REG_IDX = `CREATE UNIQUE INDEX IF NOT EXISTS field_table_registrations_plugin_table_idx
  ON field_table_registrations (plugin_id, table_name)`;
const CKPT_DDL = `CREATE TABLE IF NOT EXISTS field_reseal_checkpoints (
  id text PRIMARY KEY NOT NULL, job text NOT NULL, plugin_id text NOT NULL,
  table_name text NOT NULL, last_pk text NOT NULL, updated_at integer NOT NULL
)`;
const CKPT_IDX = `CREATE UNIQUE INDEX IF NOT EXISTS field_reseal_checkpoints_job_table_idx
  ON field_reseal_checkpoints (job, plugin_id, table_name)`;

const TABLE_NAME = `rot_entries_${randomUUID().slice(0, 8)}`;

function liveDb() {
  if (testPdb.dialect !== 'sqlite') throw new Error('expected the sqlite dialect client');
  return testPdb.db;
}

async function rawRun(query: ReturnType<typeof sql.raw> | ReturnType<typeof sql>): Promise<void> {
  await (testPdb.db as { run: (q: unknown) => Promise<unknown> }).run(query);
}
async function rawGet<T>(query: ReturnType<typeof sql.raw>): Promise<T | undefined> {
  const rows = await (testPdb.db as { all: <R>(q: unknown) => Promise<R[]> }).all<T>(query);
  return rows[0];
}

const entries = sqliteTable(TABLE_NAME, {
  id: text('id').primaryKey(),
  notes: encryptedText('notes', { sensitivity: 'health' }),
  notesIdx: blindIndex('notes_bidx', { source: 'notes' }),
});

describe.skipIf(!LIVE)('leg 4 end-to-end (rotation + backfill, live sqld)', () => {
  const saved: Record<string, string | undefined> = {};

  beforeAll(async () => {
    for (const [k, v] of Object.entries({
      DB_DIALECT: 'sqlite',
      SQLD_URL,
      SOVEREIGN_FIELD_KEK: randomBytes(32).toString('base64'),
      SOVEREIGN_ENCRYPT_CLASSES: 'health',
    })) {
      saved[k] = process.env[k];
      if (v !== undefined) process.env[k] = v;
    }

    testPdb = createClient({ dialect: 'sqlite' });
    for (const ddl of [KEYS_DDL, KEYS_IDX, REG_DDL, REG_IDX, CKPT_DDL, CKPT_IDX]) {
      await rawRun(sql.raw(ddl));
    }
    // Long-lived test databases may pre-date migration 0023 — add its columns
    // tolerantly (duplicate-column errors are expected and ignored).
    for (const alter of [
      `ALTER TABLE field_encryption_keys ADD COLUMN wrapped_hmac_key_previous text`,
      `ALTER TABLE field_encryption_keys ADD COLUMN hmac_rotation_started_at integer`,
    ]) {
      try {
        await rawRun(sql.raw(alter));
      } catch {
        // column already exists
      }
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

  it('registration persists; backfill seals pre-feature plaintext and svf0 rows; rotation dual-read holds throughout', async () => {
    const { sdk } = await import('@sovereignfs/sdk');
    const { runReseal } = await import('../field-reseal');
    const db = liveDb();

    // 0. Register the table (the persisted-metadata mechanism).
    await sdk.crypto.registerTables(entries);

    // 1. A sealed row (the normal path), plus a pre-feature plaintext row
    //    inserted via raw SQL (bypasses the tripwire, as legacy data did).
    await db
      .insert(entries)
      .values(await sdk.crypto.seal(entries, { id: 'a', notes: 'aspirin 100mg' }));
    await rawRun(sql.raw(`INSERT INTO ${TABLE_NAME} (id, notes) VALUES ('b', 'ibuprofen 400mg')`));

    // 2. Backfill: the plaintext row becomes svf1 + indexed; the sealed row is untouched.
    const backfill = await runReseal(testPdb, 'backfill', { pluginId: PLUGIN_ID });
    expect(backfill.skipped).toHaveLength(0);
    const legacy = await rawGet<{ notes: string; notes_bidx: string }>(
      sql.raw(`SELECT notes, notes_bidx FROM ${TABLE_NAME} WHERE id = 'b'`),
    );
    expect(legacy?.notes.startsWith('svf1:')).toBe(true);
    expect(legacy?.notes_bidx).toBeTruthy();
    expect(await searchNotes('ibuprofen 400mg')).toHaveLength(1);
    expect(await searchNotes('aspirin 100mg')).toHaveLength(1);

    // 3. Open a rotation window (what `sv keys rotate-blind-index` phase 1 does).
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

    // 4. DURING the window, before any re-seal: dual-read still finds both
    //    rows (their stored indexes are old-key; candidates include old).
    const during = await sdk.crypto.hashFieldCandidates('aspirin 100mg', {
      sensitivity: 'health',
    });
    expect(during).toHaveLength(2);
    expect(await searchNotes('aspirin 100mg')).toHaveLength(1);
    expect(await searchNotes('ibuprofen 400mg')).toHaveLength(1);

    // 5. New writes during the window use the new key and are findable too.
    await db
      .insert(entries)
      .values(await sdk.crypto.seal(entries, { id: 'c', notes: 'paracetamol 500mg' }));
    expect(await searchNotes('paracetamol 500mg')).toHaveLength(1);

    // 6. Re-seal (walker) + complete: window closes, old key gone.
    const rotation = await runReseal(testPdb, 'rotate-index', { pluginId: PLUGIN_ID });
    expect(rotation.skipped).toHaveLength(0);
    await completeHmacRotation(testPdb, keyRow.id);
    expect(await listOpenHmacRotations(testPdb)).toHaveLength(0);

    // 7. AFTER: single candidate again, and every row still findable.
    const after = await sdk.crypto.hashFieldCandidates('aspirin 100mg', {
      sensitivity: 'health',
    });
    expect(after).toHaveLength(1);
    for (const term of ['aspirin 100mg', 'ibuprofen 400mg', 'paracetamol 500mg']) {
      expect(await searchNotes(term)).toHaveLength(1);
    }
  });

  it('the walker resumes from a checkpoint instead of restarting', async () => {
    const { runReseal } = await import('../field-reseal');
    const { upsertResealCheckpoint } = await import('@sovereignfs/db');

    // Seed a checkpoint claiming rows <= 'b' are done; the walker must only
    // scan rows after it ('c'), proving resume-not-restart.
    await upsertResealCheckpoint(testPdb, 'rotate-index', PLUGIN_ID, TABLE_NAME, 'b');
    const summary = await runReseal(testPdb, 'rotate-index', { pluginId: PLUGIN_ID });
    const table = summary.tables.find((t) => t.tableName === TABLE_NAME);
    expect(table?.scanned).toBe(1);
  });
});
