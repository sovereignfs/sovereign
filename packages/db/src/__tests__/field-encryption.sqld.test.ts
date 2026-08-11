import { randomBytes, randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient, type PlatformDb } from '../client';
import { dbRun } from '../exec';
import {
  createFieldKeyRow,
  getFieldKeyRow,
  kekFingerprint,
  listFieldKeyRows,
  unwrapKeyMaterial,
  updateFieldKeyRowWrapped,
  wrapKeyMaterial,
} from '../field-encryption';

/**
 * Live-sqld twin of field-encryption.pg.test.ts — proves the same portable
 * raw SQL (including the ON CONFLICT arbiter on the unique index) behaves
 * identically on the sqlite dialect. Skipped unless TEST_SQLD_URL /
 * TEST_SQLD_ADMIN_URL point at a live sqld instance, per this package's
 * .sqld.test.ts convention. Plugin ids are random per run — the sqld
 * namespace is long-lived across reruns.
 *
 * The CREATE TABLE mirrors migration 0022 (the authority).
 */
const SQLD_URL = process.env.TEST_SQLD_URL;
const SQLD_ADMIN_URL = process.env.TEST_SQLD_ADMIN_URL;
const LIVE = Boolean(SQLD_URL && SQLD_ADMIN_URL);

const DDL = `CREATE TABLE IF NOT EXISTS field_encryption_keys (
  id text PRIMARY KEY NOT NULL,
  plugin_id text NOT NULL,
  class text NOT NULL,
  wrapped_dek text NOT NULL,
  wrapped_hmac_key text NOT NULL,
  kek_fingerprint text NOT NULL,
  created_at integer NOT NULL,
  updated_at integer NOT NULL
)`;
const DDL_IDX = `CREATE UNIQUE INDEX IF NOT EXISTS field_encryption_keys_plugin_class_idx
  ON field_encryption_keys (plugin_id, class)`;

describe.skipIf(!LIVE)('field_encryption_keys row helpers (live sqld)', () => {
  const originalDialect = process.env.DB_DIALECT;
  const originalUrl = process.env.SQLD_URL;
  let pdb: PlatformDb;
  const kek = randomBytes(32);
  const pluginId = `fs.test.fek-${randomUUID().slice(0, 8)}`;

  beforeAll(async () => {
    process.env.DB_DIALECT = 'sqlite';
    process.env.SQLD_URL = SQLD_URL;
    pdb = createClient({ dialect: 'sqlite' });
    await dbRun(pdb, sql.raw(DDL));
    await dbRun(pdb, sql.raw(DDL_IDX));
  });

  afterAll(async () => {
    await dbRun(pdb, sql`DELETE FROM field_encryption_keys WHERE plugin_id = ${pluginId}`);
    if (originalDialect === undefined) delete process.env.DB_DIALECT;
    else process.env.DB_DIALECT = originalDialect;
    if (originalUrl === undefined) delete process.env.SQLD_URL;
    else process.env.SQLD_URL = originalUrl;
  });

  it('creates on first use, and the stored material unwraps to 32-byte keys', async () => {
    expect(await getFieldKeyRow(pdb, pluginId, 'pii')).toBeUndefined();
    const row = await createFieldKeyRow(pdb, kek, pluginId, 'pii');
    expect(row.kekFingerprint).toBe(kekFingerprint(kek));
    const ctx = { pluginId, class: 'pii' } as const;
    expect(unwrapKeyMaterial(kek, row.wrappedDek, { ...ctx, purpose: 'dek' })).toHaveLength(32);
    expect(unwrapKeyMaterial(kek, row.wrappedHmacKey, { ...ctx, purpose: 'hmac' })).toHaveLength(
      32,
    );
  });

  it('a second create for the same (plugin × class) returns the same row (ON CONFLICT race)', async () => {
    const first = await getFieldKeyRow(pdb, pluginId, 'pii');
    if (!first) throw new Error('expected the row created by the previous test');
    const second = await createFieldKeyRow(pdb, randomBytes(32), pluginId, 'pii');
    expect(second.id).toBe(first.id);
    expect(second.wrappedDek).toBe(first.wrappedDek);
  });

  it('rotation rewrite: same DEK under a new KEK, new fingerprint', async () => {
    const row = await createFieldKeyRow(pdb, kek, pluginId, 'pii');
    const ctx = { pluginId, class: 'pii' } as const;
    const dek = unwrapKeyMaterial(kek, row.wrappedDek, { ...ctx, purpose: 'dek' });
    const hmacKey = unwrapKeyMaterial(kek, row.wrappedHmacKey, { ...ctx, purpose: 'hmac' });

    const newKek = randomBytes(32);
    await updateFieldKeyRowWrapped(
      pdb,
      row.id,
      wrapKeyMaterial(newKek, dek, { ...ctx, purpose: 'dek' }),
      wrapKeyMaterial(newKek, hmacKey, { ...ctx, purpose: 'hmac' }),
      kekFingerprint(newKek),
    );

    const rotated = await getFieldKeyRow(pdb, pluginId, 'pii');
    if (!rotated) throw new Error('row disappeared during rotation');
    expect(rotated.kekFingerprint).toBe(kekFingerprint(newKek));
    expect(unwrapKeyMaterial(newKek, rotated.wrappedDek, { ...ctx, purpose: 'dek' })).toEqual(dek);
  });

  it('listFieldKeyRows includes every class row for the plugin', async () => {
    await createFieldKeyRow(pdb, kek, pluginId, 'health');
    const mine = (await listFieldKeyRows(pdb)).filter((r) => r.pluginId === pluginId);
    expect(mine.map((r) => r.class).sort()).toEqual(['health', 'pii']);
  });
});
