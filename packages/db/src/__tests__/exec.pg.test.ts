import { sql } from 'drizzle-orm';
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PlatformDb } from '../client';
import { dbAll, dbGet, dbRun } from '../exec';

/**
 * Live-Postgres coverage for the dialect-agnostic exec helpers. Skipped
 * unless TEST_DATABASE_URL points at a Postgres instance — same convention
 * as every other `.pg.test.ts` in this package. Previously ran against
 * `:memory:` SQLite (free, instant); that fallback no longer exists now that
 * SQLite is sqld-backed only, which needs a live server just like Postgres.
 */
const PG_URL = process.env.TEST_DATABASE_URL;

describe.skipIf(!PG_URL)('exec helpers', () => {
  let pool: Pool;
  let pdb: PlatformDb;

  beforeAll(async () => {
    const adminPool = new Pool({ connectionString: PG_URL });
    const schema = 'test_exec_helpers';
    await adminPool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await adminPool.query(`CREATE SCHEMA "${schema}"`);
    await adminPool.end();

    pool = new Pool({ connectionString: PG_URL, options: `-c search_path="${schema}"` });
    pdb = { dialect: 'postgres', db: drizzlePg(pool) };
    await dbRun(pdb, sql.raw('CREATE TABLE t (id TEXT PRIMARY KEY, n INTEGER NOT NULL)'));
    await dbRun(pdb, sql`INSERT INTO t (id, n) VALUES (${'a'}, ${1})`);
    await dbRun(pdb, sql`INSERT INTO t (id, n) VALUES (${'b'}, ${2})`);
  });

  afterAll(async () => {
    if (pool) await pool.end();
  });

  it('dbGet returns a single parameterised row', async () => {
    const row = await dbGet<{ id: string; n: number }>(
      pdb,
      sql`SELECT id, n FROM t WHERE id = ${'a'}`,
    );
    expect(row).toEqual({ id: 'a', n: 1 });
  });

  it('dbGet returns undefined when no row matches', async () => {
    expect(await dbGet(pdb, sql`SELECT id FROM t WHERE id = ${'missing'}`)).toBeUndefined();
  });

  it('dbAll returns every matching row', async () => {
    const rows = await dbAll<{ id: string }>(pdb, sql`SELECT id FROM t ORDER BY id`);
    expect(rows.map((r) => r.id)).toEqual(['a', 'b']);
  });

  it('dbRun executes a statement for its side effects', async () => {
    await dbRun(pdb, sql`DELETE FROM t WHERE id = ${'b'}`);
    expect(await dbAll(pdb, sql`SELECT id FROM t`)).toHaveLength(1);
  });
});
