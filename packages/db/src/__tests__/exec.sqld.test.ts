import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { createClient } from '../client';
import { dbAll, dbGet, dbRun } from '../exec';

/**
 * Live-sqld regression coverage for a real bug found running `pnpm dev`
 * against a genuinely live sqld instance for the first time (previously,
 * native dev had no working sqld at all — see scripts/ensure-sqld.ts):
 * drizzle-orm@0.45.2's libsql session `.get()` crashes with `TypeError:
 * Cannot convert undefined or null to object` whenever a raw `sql\`\`` query
 * genuinely matches zero rows (drizzle-orm/libsql/session.cjs's
 * `normalizeRow` calls `Object.keys()` on the row without checking it's
 * defined first) — completely independent of any schema attached to the
 * client. This crashed platform boot on literally the first "does this
 * setting exist yet" query. `dbGet` (packages/db/src/exec.ts) now routes
 * through `.all()` instead, which doesn't share the bug.
 *
 * Skipped unless TEST_SQLD_URL/TEST_SQLD_ADMIN_URL point at a live sqld
 * instance, so the default `pnpm test` stays Docker-free — same convention
 * as this package's other `.sqld.test.ts` files.
 */
const SQLD_URL = process.env.TEST_SQLD_URL;
const SQLD_ADMIN_URL = process.env.TEST_SQLD_ADMIN_URL;
const LIVE = Boolean(SQLD_URL && SQLD_ADMIN_URL);

describe.skipIf(!LIVE)('dbGet — live sqld zero-row regression', () => {
  const originalDialect = process.env.DB_DIALECT;
  const originalUrl = process.env.SQLD_URL;
  process.env.DB_DIALECT = 'sqlite';
  process.env.SQLD_URL = SQLD_URL;

  afterAll(() => {
    if (originalDialect === undefined) delete process.env.DB_DIALECT;
    else process.env.DB_DIALECT = originalDialect;
    if (originalUrl === undefined) delete process.env.SQLD_URL;
    else process.env.SQLD_URL = originalUrl;
  });

  it('returns undefined (not a crash) when a query genuinely matches zero rows', async () => {
    const client = createClient({ dialect: 'sqlite' });
    const table = `t_${randomUUID().replace(/-/g, '_')}`;
    await dbRun(client, sql.raw(`CREATE TABLE ${table} (id TEXT PRIMARY KEY)`));

    // No rows inserted — this table is genuinely empty.
    await expect(
      dbGet(client, sql`SELECT id FROM ${sql.raw(table)} WHERE id = ${'nope'}`),
    ).resolves.toBeUndefined();
  });

  it('still returns the row when exactly one matches', async () => {
    const client = createClient({ dialect: 'sqlite' });
    const table = `t_${randomUUID().replace(/-/g, '_')}`;
    await dbRun(client, sql.raw(`CREATE TABLE ${table} (id TEXT PRIMARY KEY, v TEXT)`));
    await dbRun(client, sql`INSERT INTO ${sql.raw(table)} (id, v) VALUES (${'a'}, ${'hello'})`);

    const row = await dbGet<{ v: string }>(
      client,
      sql`SELECT v FROM ${sql.raw(table)} WHERE id = ${'a'}`,
    );
    expect(row).toEqual({ v: 'hello' });
  });

  it('dbAll on the same empty query returns [] (already worked — the fix routes dbGet through it)', async () => {
    const client = createClient({ dialect: 'sqlite' });
    const table = `t_${randomUUID().replace(/-/g, '_')}`;
    await dbRun(client, sql.raw(`CREATE TABLE ${table} (id TEXT PRIMARY KEY)`));

    await expect(
      dbAll(client, sql`SELECT id FROM ${sql.raw(table)} WHERE id = ${'nope'}`),
    ).resolves.toEqual([]);
  });
});
