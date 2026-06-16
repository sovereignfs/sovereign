import { sql } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { type PlatformDb, createClient } from '../client';
import { dbAll, dbGet, dbRun } from '../exec';

describe('exec helpers (sqlite)', () => {
  let pdb: PlatformDb;

  beforeAll(async () => {
    pdb = createClient({ url: ':memory:' });
    await dbRun(pdb, sql.raw('CREATE TABLE t (id TEXT PRIMARY KEY, n INTEGER NOT NULL)'));
    await dbRun(pdb, sql`INSERT INTO t (id, n) VALUES (${'a'}, ${1})`);
    await dbRun(pdb, sql`INSERT INTO t (id, n) VALUES (${'b'}, ${2})`);
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
