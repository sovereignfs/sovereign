import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { createClient } from '../client';
import { dropPluginDb, getPluginDb, provisionPluginDb } from '../plugin-client';
import { dropSqldNamespace, provisionSqldNamespace } from '../sqld';

/**
 * Live-sqld coverage for the SQLite dialect's actual code path — every
 * SQLite database is sqld-backed now, no plain-file fallback, so this is the
 * SQLite-dialect analogue of the package's `.pg.test.ts` files. Skipped
 * unless TEST_SQLD_URL/TEST_SQLD_ADMIN_URL point at a live sqld instance, so
 * the default `pnpm test` stays Docker-free — same convention as Postgres.
 *
 *   TEST_SQLD_URL=http://localhost:28080 \
 *   TEST_SQLD_ADMIN_URL=http://localhost:28081 \
 *   pnpm test
 *
 * Deliberately separate env vars from SQLD_URL/SQLD_ADMIN_URL (the ones the
 * running app reads) — same reasoning as TEST_DATABASE_URL vs.
 * POSTGRES_DB_URL: test config opts in explicitly rather than accidentally
 * pointing a test run at whatever sqld a developer's own `.env` configures.
 *
 * Use a single-label hostname (`localhost`, or a Docker service name like
 * `sqld`) — never a raw IP address. Found live: with `--enable-namespaces`,
 * sqld infers the default (no `x-namespace` header) namespace from the Host
 * header's first dot-separated label. `127.0.0.1` parses as namespace `127`,
 * which doesn't exist, and every unnamespaced query 404s
 * (`{"error":"Namespace \`127\` doesn't exist"}`) — silently working for any
 * *named* namespace (those go through the `x-namespace` header instead,
 * unaffected), so this only bites the platform's own default-namespace path.
 */
const SQLD_URL = process.env.TEST_SQLD_URL;
const SQLD_ADMIN_URL = process.env.TEST_SQLD_ADMIN_URL;
const LIVE = Boolean(SQLD_URL && SQLD_ADMIN_URL);

/** Only called from inside describe.skipIf(!LIVE) blocks, where this is always set. */
function adminUrl(): string {
  if (!SQLD_ADMIN_URL) throw new Error('TEST_SQLD_ADMIN_URL is not set');
  return SQLD_ADMIN_URL;
}

function withSqldEnv<T>(fn: () => T): T {
  const originalDialect = process.env.DB_DIALECT;
  const originalUrl = process.env.SQLD_URL;
  const originalAdminUrl = process.env.SQLD_ADMIN_URL;
  process.env.DB_DIALECT = 'sqlite';
  process.env.SQLD_URL = SQLD_URL;
  process.env.SQLD_ADMIN_URL = SQLD_ADMIN_URL;
  try {
    return fn();
  } finally {
    if (originalDialect === undefined) delete process.env.DB_DIALECT;
    else process.env.DB_DIALECT = originalDialect;
    if (originalUrl === undefined) delete process.env.SQLD_URL;
    else process.env.SQLD_URL = originalUrl;
    if (originalAdminUrl === undefined) delete process.env.SQLD_ADMIN_URL;
    else process.env.SQLD_ADMIN_URL = originalAdminUrl;
  }
}

describe.skipIf(!LIVE)('createClient — sqlite (live sqld)', () => {
  it('writes and reads back through the default namespace', async () => {
    const client = withSqldEnv(() => createClient({ dialect: 'sqlite' }));
    if (client.dialect !== 'sqlite') throw new Error('expected sqlite');
    const table = `t_${randomUUID().replace(/-/g, '_')}`;
    await client.db.run(sql.raw(`CREATE TABLE ${table} (id TEXT PRIMARY KEY, v TEXT)`));
    await client.db.run(sql`INSERT INTO ${sql.raw(table)} (id, v) VALUES (${'a'}, ${'hello'})`);
    const row = await client.db.get<{ v: string }>(
      sql`SELECT v FROM ${sql.raw(table)} WHERE id = ${'a'}`,
    );
    expect(row?.v).toBe('hello');
  });

  it('isolates a named namespace from the default one', async () => {
    const namespace = `test_ns_${randomUUID().replace(/-/g, '_')}`;
    await provisionSqldNamespace(adminUrl(), namespace);
    try {
      const namespaced = withSqldEnv(() => createClient({ dialect: 'sqlite', namespace }));
      const defaultNs = withSqldEnv(() => createClient({ dialect: 'sqlite' }));
      if (namespaced.dialect !== 'sqlite' || defaultNs.dialect !== 'sqlite') {
        throw new Error('expected sqlite');
      }

      const table = `t_${randomUUID().replace(/-/g, '_')}`;
      await namespaced.db.run(sql.raw(`CREATE TABLE ${table} (id TEXT PRIMARY KEY)`));

      // The same table name must not exist on the default namespace — a
      // genuinely separate database, not a shared one (sqld.ts's own doc
      // comment: "the no-header default namespace is a third, genuinely
      // separate database").
      await expect(defaultNs.db.get(sql.raw(`SELECT 1 FROM ${table} LIMIT 1`))).rejects.toThrow();
    } finally {
      await dropSqldNamespace(adminUrl(), namespace);
    }
  });
});

describe.skipIf(!LIVE)('getPluginDb / provisionPluginDb / dropPluginDb (live sqld)', () => {
  const pluginId = `fs.test.sqld-${randomUUID().replace(/-/g, '')}`;

  afterAll(async () => {
    await withSqldEnv(() => dropPluginDb(pluginId));
  });

  it('provisions a dedicated namespace, writes/reads through it, then drops it', async () => {
    await withSqldEnv(() => provisionPluginDb(pluginId));
    const pluginDb = withSqldEnv(() => getPluginDb(pluginId));
    if (pluginDb.dialect !== 'sqlite') throw new Error('expected sqlite');

    await pluginDb.db.run(sql.raw('CREATE TABLE items (id TEXT PRIMARY KEY, v TEXT)'));
    await pluginDb.db.run(sql`INSERT INTO items (id, v) VALUES (${'a'}, ${'plugin data'})`);
    const row = await pluginDb.db.get<{ v: string }>(sql`SELECT v FROM items WHERE id = ${'a'}`);
    expect(row?.v).toBe('plugin data');

    await withSqldEnv(() => dropPluginDb(pluginId));

    // A dropped namespace is gone — re-provisioning starts genuinely empty,
    // not resurrecting the deleted data.
    await withSqldEnv(() => provisionPluginDb(pluginId));
    const fresh = withSqldEnv(() => getPluginDb(pluginId));
    if (fresh.dialect !== 'sqlite') throw new Error('expected sqlite');
    await expect(fresh.db.get(sql.raw('SELECT 1 FROM items LIMIT 1'))).rejects.toThrow();
  });
});
