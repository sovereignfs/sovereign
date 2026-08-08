import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { dropPluginDb, getPluginDb, provisionPluginDb } from '../plugin-client';
import { sql } from 'drizzle-orm';

/**
 * Live Postgres coverage for `getPluginDb`'s isolated-schema pinning.
 * Skipped unless TEST_DATABASE_URL points at a Postgres instance, so the
 * default `pnpm test` stays Docker-free — same convention as postgres.pg.test.ts.
 *
 *   TEST_DATABASE_URL=postgres://user:pass@localhost:5432/db pnpm test
 *
 * Guards against the `pool.on('connect', ...)` + unawaited `client.query()`
 * regression: search_path must be correct on every connection, under real
 * concurrency, with zero "already executing a query" deprecation warnings —
 * not just on a single lazily-opened connection.
 */
const PG_URL = process.env.TEST_DATABASE_URL;
const PLUGIN_ID = 'fs.test.pg-race';

describe.skipIf(!PG_URL)('getPluginDb (Postgres search_path pinning)', () => {
  let deprecationWarnings: string[] = [];
  const onWarning = (w: Error) => {
    if (w.name === 'DeprecationWarning' && /already executing a query/.test(w.message)) {
      deprecationWarnings.push(w.message);
    }
  };

  beforeAll(async () => {
    process.on('warning', onWarning);
    process.env.DATABASE_URL = PG_URL;
    process.env.DB_DIALECT = 'postgres';
    await provisionPluginDb(PLUGIN_ID);
  });

  afterAll(async () => {
    process.off('warning', onWarning);
    await dropPluginDb(PLUGIN_ID);
    delete process.env.DATABASE_URL;
    delete process.env.DB_DIALECT;
  });

  it('every connection in a concurrent burst sees the plugin schema on search_path, with no deprecation warnings', async () => {
    deprecationWarnings = [];
    const pluginDb = getPluginDb(PLUGIN_ID);
    if (pluginDb.dialect !== 'postgres') throw new Error('expected postgres dialect');
    const { db } = pluginDb;

    const N = 25;
    const results = await Promise.all(
      Array.from({ length: N }, async () => {
        const result = await db.execute<{ search_path: string }>(sql`SHOW search_path`);
        const [row] = result.rows;
        if (!row) throw new Error('SHOW search_path returned no rows');
        return row.search_path;
      }),
    );

    const schema = `plugin_${PLUGIN_ID.replace(/[.-]/g, '_')}`;
    for (const searchPath of results) {
      expect(searchPath).toContain(schema);
    }
    expect(deprecationWarnings).toEqual([]);
  });
});

describe.skipIf(!PG_URL)('dropPluginDb (Postgres pool cleanup)', () => {
  const DROP_PLUGIN_ID = 'fs.test.pg-drop';

  beforeAll(async () => {
    process.env.DATABASE_URL = PG_URL;
    process.env.DB_DIALECT = 'postgres';
    await provisionPluginDb(DROP_PLUGIN_ID);
  });

  afterAll(async () => {
    delete process.env.DATABASE_URL;
    delete process.env.DB_DIALECT;
  });

  it('ends the cached pool so its connection cannot be used after drop', async () => {
    const pluginDb = getPluginDb(DROP_PLUGIN_ID);
    if (pluginDb.dialect !== 'postgres') throw new Error('expected postgres dialect');
    const { db } = pluginDb;

    // Establish a real connection before dropping, so there's an actual pool
    // client to leak if dropPluginDb doesn't end it.
    await db.execute(sql`SELECT 1`);

    await dropPluginDb(DROP_PLUGIN_ID);

    // The old pool must be ended — further queries against it reject rather
    // than silently succeeding against a schema that no longer exists.
    await expect(db.execute(sql`SELECT 1`)).rejects.toThrow();

    // A fresh getPluginDb call after drop opens a brand-new pool and works
    // once the schema is re-provisioned — confirms drop didn't wedge the
    // registry into a permanently-broken state for this plugin id.
    await provisionPluginDb(DROP_PLUGIN_ID);
    const fresh = getPluginDb(DROP_PLUGIN_ID);
    if (fresh.dialect !== 'postgres') throw new Error('expected postgres dialect');
    await expect(fresh.db.execute(sql`SELECT 1`)).resolves.toBeDefined();
    await dropPluginDb(DROP_PLUGIN_ID);
  });
});
