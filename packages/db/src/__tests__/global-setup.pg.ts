import { Pool } from 'pg';

/**
 * Vitest global setup (runs once, before any test file, in its own process —
 * see vitest.config.ts). Pre-creates the `drizzle` schema that drizzle-orm's
 * Postgres migrator (`PgDialect.migrate()`) unconditionally tries to create
 * via `CREATE SCHEMA IF NOT EXISTS "drizzle"` on every `migratePg()` call.
 *
 * Several `.pg.test.ts` files call `runMigrations()`/`runPluginMigrations()`
 * against the same live TEST_DATABASE_URL, and Vitest runs different test
 * files concurrently by default. Postgres's `CREATE SCHEMA IF NOT EXISTS` is
 * not safe under true concurrency: two sessions can both see "doesn't exist
 * yet" and both attempt the CREATE, and the loser gets a hard
 * `duplicate key value violates unique constraint "pg_namespace_nspname_index"`
 * error despite the IF NOT EXISTS clause — reproduced live running the full
 * `.pg.test.ts` suite once `migrate.pg.test.ts` gained a second describe
 * block exercising the real migration set. Once the schema already exists,
 * every concurrent caller's IF NOT EXISTS is a genuine no-op with no race —
 * so creating it once, up front, before any test file starts, removes the
 * race entirely without serializing the test suite.
 */
export default async function setup(): Promise<void> {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) return; // No live Postgres configured — every .pg.test.ts skips anyway.

  const pool = new Pool({ connectionString: url });
  try {
    await pool.query('CREATE SCHEMA IF NOT EXISTS "drizzle"');
  } finally {
    await pool.end();
  }
}
