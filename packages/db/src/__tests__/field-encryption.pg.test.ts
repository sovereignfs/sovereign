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
 * Live-Postgres round-trip for the field_encryption_keys row helpers (RFC
 * 0092, epic task 8.31): create-on-first-use, conflict-safe re-read, listing,
 * and the rotation rewrite. Skipped unless TEST_DATABASE_URL is set — same
 * convention as this package's other .pg.test.ts files. Plugin ids are
 * random per run so reruns against a long-lived database never collide.
 *
 * The CREATE TABLE mirrors migration 0022 (the authority) — IF NOT EXISTS so
 * a database that already ran platform migrations is fine too.
 */
const PG_URL = process.env.TEST_DATABASE_URL;

const DDL = `CREATE TABLE IF NOT EXISTS field_encryption_keys (
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
const DDL_IDX = `CREATE UNIQUE INDEX IF NOT EXISTS field_encryption_keys_plugin_class_idx
  ON field_encryption_keys (plugin_id, class)`;
// Long-lived test databases may pre-date migration 0023 — add its columns
// tolerantly (sqlite has no ADD COLUMN IF NOT EXISTS; a duplicate errors and
// is ignored).
const KEYS_ALTERS = [
  `ALTER TABLE field_encryption_keys ADD COLUMN IF NOT EXISTS wrapped_hmac_key_previous text`,
  `ALTER TABLE field_encryption_keys ADD COLUMN IF NOT EXISTS hmac_rotation_started_at bigint`,
];

describe.skipIf(!PG_URL)('field_encryption_keys row helpers (live Postgres)', () => {
  let pdb: PlatformDb;
  const kek = randomBytes(32);
  const pluginId = `fs.test.fek-${randomUUID().slice(0, 8)}`;

  beforeAll(async () => {
    process.env.POSTGRES_DB_URL = PG_URL;
    pdb = createClient({ dialect: 'postgres', url: PG_URL });
    await dbRun(pdb, sql.raw(DDL));
    await dbRun(pdb, sql.raw(DDL_IDX));
    for (const alter of KEYS_ALTERS) {
      try {
        await dbRun(pdb, sql.raw(alter));
      } catch {
        // column already exists
      }
    }
  });

  afterAll(async () => {
    await dbRun(pdb, sql`DELETE FROM field_encryption_keys WHERE plugin_id = ${pluginId}`);
  });

  it('creates on first use, and the stored material unwraps to 32-byte keys', async () => {
    expect(await getFieldKeyRow(pdb, pluginId, 'pii')).toBeUndefined();
    const row = await createFieldKeyRow(pdb, kek, pluginId, 'pii');
    expect(row.pluginId).toBe(pluginId);
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

  it('rotation rewrite: same DEK, new wrapping, new fingerprint — data rows untouched by design', async () => {
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
      null,
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
