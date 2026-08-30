import { randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { PlatformDb } from '../client';
import { runMigrations, runPluginMigrations } from '../migrate';
import { getPlatformSetting, setPlatformSetting } from '../platform-db';
import { pluginMigrationsTableName } from '../plugin-client';
import type { PluginDb } from '../plugin-client';

/**
 * Live-Postgres regression coverage for a real production incident
 * (workstream: legacy per-plugin SQLite → Postgres migration, task 8.25's
 * follow-up): drizzle-orm's node-postgres migrator tracks applied migrations
 * in a fixed `drizzle` schema regardless of the connecting pool's
 * search_path, so every isolated-mode Postgres plugin left on the untouched
 * default table name (`__drizzle_migrations`) shares that ONE table across
 * every plugin. The second plugin's migrator compares its own (older)
 * migration timestamps against whatever the first plugin's migrations left
 * as the newest row and concludes "already applied" — skipping its DDL
 * entirely, silently, with no error. This is the exact isolated-Postgres
 * analogue of the shared-mode collision migrate.test.ts already covers for
 * SQLite; unlike that one, this was never exercised until a second isolated
 * Postgres plugin actually existed in production.
 *
 * Skipped unless TEST_DATABASE_URL points at a Postgres instance (same gate
 * as every other .pg.test.ts in this package).
 */
const PG_URL = process.env.TEST_DATABASE_URL;

/** Builds a minimal on-disk Drizzle Postgres migrations folder (journal +
 *  one .sql file), mirroring migrate.test.ts's SQLite fixture helper. */
function fixturePostgresMigrationsFolder(createSql: string, whenMs: number): string {
  const dir = mkdtempSync(join(tmpdir(), 'sv-pg-plugin-migrations-'));
  mkdirSync(join(dir, 'meta'), { recursive: true });
  writeFileSync(
    join(dir, 'meta', '_journal.json'),
    JSON.stringify({
      version: '7',
      dialect: 'postgresql',
      entries: [{ idx: 0, version: '7', when: whenMs, tag: '0000_init', breakpoints: true }],
    }),
  );
  writeFileSync(join(dir, '0000_init.sql'), createSql);
  return dir;
}

describe.skipIf(!PG_URL)(
  'runPluginMigrations — isolated Postgres plugin migration-table collision',
  () => {
    let pool: Pool;

    beforeAll(() => {
      pool = new Pool({ connectionString: PG_URL });
    });

    afterAll(async () => {
      await pool.end();
    });

    async function freshSchemaPluginDb(): Promise<{ schema: string; pluginDb: PluginDb }> {
      // randomUUID, not a per-run counter: the migrations-tracking table this
      // creates lives in a separate, fixed `drizzle` schema that this block's
      // afterEach only partially cleans (see below) — a counter resets to 0
      // on every fresh `vitest run` process, so a *second* invocation would
      // reuse a prior run's leftover tracking-table name, see its old rows,
      // and conclude its migrations are "already applied" against a schema
      // that was actually just freshly dropped and recreated. Found live:
      // this exact staleness broke a rerun of this file in the same session.
      const schema = `test_pg_migrate_${randomUUID().replace(/-/g, '_')}`;
      await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await pool.query(`CREATE SCHEMA "${schema}"`);
      const scopedPool = new Pool({
        connectionString: PG_URL,
        options: `-c search_path="${schema}"`,
      });
      return { schema, pluginDb: { dialect: 'postgres', db: drizzlePg(scopedPool) } };
    }

    afterEach(async () => {
      // The default-named tracking table this suite's first test populates,
      // plus the two fixed plugin-id tracking tables the "fix:" test below
      // uses (pluginMigrationsTableName('plugin-a'/'plugin-b') — fixed
      // deliberately, mirroring a real plugin's stable id, so unlike
      // freshSchemaPluginDb()'s own schema name these can't be made
      // per-run-unique without changing what's under test). Never the whole
      // `drizzle` schema. Other concurrently-running test files (and
      // better-auth's own Postgres migrator, via apps/auth's
      // runAuthMigrations()) also keep real tables in that same schema under
      // their own distinct names; a blanket `DROP SCHEMA … CASCADE` here
      // raced them, deleting tables mid-use in a real run — found live
      // running the full suite once apps/auth also depended on this schema
      // existing.
      await pool.query(`DROP TABLE IF EXISTS "drizzle"."__drizzle_migrations"`);
      await pool.query(`DROP TABLE IF EXISTS "drizzle"."${pluginMigrationsTableName('plugin-a')}"`);
      await pool.query(`DROP TABLE IF EXISTS "drizzle"."${pluginMigrationsTableName('plugin-b')}"`);
    });

    it('reproduces the incident: a second isolated plugin silently skips its migration on the shared default table name', async () => {
      const a = await freshSchemaPluginDb();
      const b = await freshSchemaPluginDb();

      // Plugin A's migration runs "late" (a high timestamp), exactly like
      // com.mooniak.tritext's real migration history did in production.
      const folderA = fixturePostgresMigrationsFolder(
        'CREATE TABLE plugin_a_widgets (id text primary key);',
        1786282278465,
      );
      // Plugin B's migration has an earlier timestamp — exactly like
      // plainwrite's real 2026-era migrations did relative to tritext's.
      const folderB = fixturePostgresMigrationsFolder(
        'CREATE TABLE plugin_b_widgets (id text primary key);',
        1783296000000,
      );

      // No migrationsTable passed — the exact bug: both share the untouched
      // default (`drizzle.__drizzle_migrations`).
      await runPluginMigrations(a.pluginDb, folderA);
      await runPluginMigrations(b.pluginDb, folderB);

      const aTable = await pool.query(`SELECT to_regclass('"${a.schema}".plugin_a_widgets') as t`);
      const bTable = await pool.query(`SELECT to_regclass('"${b.schema}".plugin_b_widgets') as t`);
      expect(aTable.rows[0].t).not.toBeNull();
      // Reproduces the incident: B's table was never created because its
      // older timestamp looked "already applied" against A's newer row in
      // the shared tracking table.
      expect(bTable.rows[0].t).toBeNull();
    });

    it('fix: a plugin-specific migrationsTable keeps every isolated Postgres plugin on an independent history', async () => {
      const a = await freshSchemaPluginDb();
      const b = await freshSchemaPluginDb();

      const folderA = fixturePostgresMigrationsFolder(
        'CREATE TABLE plugin_a_widgets (id text primary key);',
        1786282278465,
      );
      const folderB = fixturePostgresMigrationsFolder(
        'CREATE TABLE plugin_b_widgets (id text primary key);',
        1783296000000,
      );

      await runPluginMigrations(a.pluginDb, folderA, pluginMigrationsTableName('plugin-a'));
      await runPluginMigrations(b.pluginDb, folderB, pluginMigrationsTableName('plugin-b'));

      const aTable = await pool.query(`SELECT to_regclass('"${a.schema}".plugin_a_widgets') as t`);
      const bTable = await pool.query(`SELECT to_regclass('"${b.schema}".plugin_b_widgets') as t`);
      expect(aTable.rows[0].t).not.toBeNull();
      expect(bTable.rows[0].t).not.toBeNull();
    });
  },
);

/**
 * Live-Postgres coverage for runMigrations()'s version tracking / downgrade
 * guard, and runPluginMigrations()'s shared-mode isolation from the
 * platform's own migration history. Previously ran against `:memory:`
 * SQLite (free, instant); that fallback no longer exists now that SQLite is
 * sqld-backed only, which needs a live server just like Postgres. The
 * behavior under test is dialect-agnostic (runMigrations()/
 * runPluginMigrations() branch on pdb.dialect internally), so Postgres
 * proves it just as validly.
 */
describe.skipIf(!PG_URL)('runMigrations — version tracking & downgrade guard', () => {
  let pool: Pool;

  // Mirrors migrate.ts's own LOCK_KEY exactly (not exported — it's an
  // implementation detail of the lock/unlock pair, not part of the module's
  // public surface), so the leak-regression test below can independently
  // probe the same lock from a fresh connection.
  const LOCK_KEY = 3141592653;

  beforeAll(() => {
    pool = new Pool({ connectionString: PG_URL });
  });

  afterAll(async () => {
    await pool.end();
  });

  // runMigrations() tracks applied migrations in a table that, by default, is
  // shared across every call in the whole test process regardless of which
  // schema is actually being targeted (the platform only ever calls it once
  // per process in production, against one database, so this has never
  // mattered before). Each test here targets a fresh, empty schema — without
  // a per-test migrationsTable override, drizzle's migrator would see a
  // later test's migrations as "already applied" (per an earlier test's
  // timestamps in that shared table) and silently skip every CREATE TABLE —
  // same bug class as task 8.26, reproduced live writing these tests.
  //
  // randomUUID, not a per-run counter: the migrationsTable this derives lives
  // in a separate, fixed `drizzle` schema that no test here ever cleans up —
  // a counter resets to 0 on every fresh `vitest run` process, so a second
  // invocation in the same session would reuse a prior run's leftover
  // tracking-table name, see its old "already applied" rows, and skip every
  // CREATE TABLE against a schema that was actually just freshly dropped and
  // recreated. Found live: this exact staleness broke a rerun of this file.
  async function freshPlatformDb(): Promise<{ db: PlatformDb; migrationsTable: string }> {
    const schema = `test_migrate_version_${randomUUID().replace(/-/g, '_')}`;
    await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await pool.query(`CREATE SCHEMA "${schema}"`);
    const scopedPool = new Pool({
      connectionString: PG_URL,
      options: `-c search_path="${schema}"`,
    });
    return {
      db: { dialect: 'postgres', db: drizzlePg(scopedPool) },
      // Postgres silently truncates identifiers over 63 bytes (NAMEDATALEN)
      // with no error — concatenating this prefix onto the full 36-char
      // `schema` name above produced a 78-char string, truncated to a prefix
      // that collided with other tests' equally-truncated names once enough
      // ran concurrently (exactly what CI's single-Postgres-instance suite
      // does, and what running this file's full suite together reproduced
      // locally). A short, independent random suffix keeps this well under
      // the limit regardless of which prefix gets concatenated.
      migrationsTable: `__drizzle_migrations_${randomUUID().slice(0, 8)}`,
    };
  }

  // Each test runs the platform's full, real Postgres migration set (21
  // files) at least once — a fresh schema plus real DDL is legitimately
  // slower than the tiny synthetic fixtures elsewhere in this file, so these
  // need a longer-than-default timeout.
  it('records the running version and reports no downgrade on a fresh install', async () => {
    const { db, migrationsTable } = await freshPlatformDb();
    const result = await runMigrations(db, migrationsTable);

    expect(result.previousVersion).toBeNull();
    expect(result.downgradeDetected).toBe(false);
    // The running version is now persisted for the next startup to compare.
    expect(await getPlatformSetting(db, 'platform_version')).toBe(result.currentVersion);
  }, 120000);

  it('reports no downgrade on an unchanged restart', async () => {
    const { db, migrationsTable } = await freshPlatformDb();
    const first = await runMigrations(db, migrationsTable);
    const second = await runMigrations(db, migrationsTable);

    expect(second.previousVersion).toBe(first.currentVersion);
    expect(second.downgradeDetected).toBe(false);
  }, 120000);

  it('detects a downgrade and keeps the higher stored version (watermark)', async () => {
    const { db, migrationsTable } = await freshPlatformDb();
    await runMigrations(db, migrationsTable);
    // Simulate the DB having been written by a much newer binary.
    await setPlatformSetting(db, 'platform_version', '999.0.0');

    const result = await runMigrations(db, migrationsTable);

    expect(result.previousVersion).toBe('999.0.0');
    expect(result.downgradeDetected).toBe(true);
    // The warning must persist: the stored version stays at the high-water mark
    // rather than being overwritten with the older running version.
    expect(await getPlatformSetting(db, 'platform_version')).toBe('999.0.0');
  }, 120000);

  // Regression coverage for a real production incident: pg_advisory_lock/
  // unlock are session-scoped, not query-scoped. Routing the lock and unlock
  // calls through dbGet(pdb, ...) independently let the connection pool
  // serve each from a *different* physical session, silently no-op'ing the
  // unlock (Postgres only lets the owning session release its own advisory
  // lock) and leaking the lock forever — every subsequent runMigrations()
  // call (i.e. every later container restart) then hung indefinitely
  // waiting to reacquire a lock nothing would ever release, taking down the
  // entire app. Reproduced live in production before this fix; this proves
  // the fix (a single client pinned for the whole lock→migrate→unlock
  // window) actually closes the leak rather than just "looking right."
  it('does not leak the migration advisory lock (regression: production hang)', async () => {
    const { db, migrationsTable } = await freshPlatformDb();
    await runMigrations(db, migrationsTable);

    // A completely independent connection — not the pool runMigrations()
    // used — proves the lock is genuinely released at the session level,
    // not just "no longer awaited by this test's own pool instance."
    const checker = new Pool({ connectionString: PG_URL });
    try {
      const acquired = await checker.query('SELECT pg_try_advisory_lock($1) AS ok', [LOCK_KEY]);
      expect(acquired.rows[0].ok).toBe(true);
      await checker.query('SELECT pg_advisory_unlock($1)', [LOCK_KEY]);
    } finally {
      await checker.end();
    }
  }, 120000);
});

describe.skipIf(!PG_URL)(
  'runPluginMigrations — shared-mode plugin isolation from the platform history',
  () => {
    let pool: Pool;

    beforeAll(() => {
      pool = new Pool({ connectionString: PG_URL });
    });

    afterAll(async () => {
      await pool.end();
    });

    // See the sibling describe block's identical comment — each test's
    // runMigrations(db) call needs its own migrationsTable, or a later
    // test's migrations look "already applied" against an earlier test's
    // tracking rows and get silently skipped. randomUUID (not a per-run
    // counter) for the same cross-process-rerun staleness reason documented
    // in the sibling describe block above.
    async function freshPlatformDb(): Promise<{
      schema: string;
      db: PlatformDb;
      migrationsTable: string;
      tableSuffix: string;
    }> {
      const schema = `test_migrate_shared_${randomUUID().replace(/-/g, '_')}`;
      await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await pool.query(`CREATE SCHEMA "${schema}"`);
      const scopedPool = new Pool({
        connectionString: PG_URL,
        options: `-c search_path="${schema}"`,
      });
      // Short and independent of `schema` (a full 36-char UUID) — see the
      // sibling describe block's identical comment on why concatenating a
      // prefix onto the full schema name silently overflows Postgres's
      // 63-byte identifier limit. Returned separately so callers deriving
      // their own plugin-specific migrationsTable names (below) build on
      // this short suffix instead of `schema` itself.
      const tableSuffix = randomUUID().slice(0, 8);
      return {
        schema,
        db: { dialect: 'postgres', db: drizzlePg(scopedPool) },
        migrationsTable: `__drizzle_migrations_${tableSuffix}`,
        tableSuffix,
      };
    }

    // Each test runs the platform's full, real migration set once — see the
    // sibling describe block's identical timeout comment.
    it('applies a plugin migration whose timestamp predates the platform migrations already in the shared DB', async () => {
      const { schema, db, migrationsTable, tableSuffix } = await freshPlatformDb();
      // Platform migrations run first, exactly as instrumentation.ts orders it —
      // this populates the platform's own migrations table with 2026+ timestamps.
      await runMigrations(db, migrationsTable);

      const folder = fixturePostgresMigrationsFolder(
        'CREATE TABLE plugin_x_widgets (id text primary key);',
        946684800000, // deliberately old (year-2000-ish)
      );

      // Without a dedicated migrationsTable, Drizzle's migrator would compare
      // this migration's old `when` against the shared table's newest row
      // (the platform's) and skip it as "already applied" — reproducing the
      // bug this test guards against. Suffixed with `tableSuffix` (unique
      // per call, and short — see freshPlatformDb()'s own doc comment on why
      // `schema` itself is too long to concatenate here) so repeat runs
      // against the same long-lived test Postgres instance don't see a stale
      // row from an earlier run and flake.
      await runPluginMigrations(
        db as unknown as PluginDb,
        folder,
        `__drizzle_migrations_plugin_x_${tableSuffix}`,
      );

      const row = await pool.query(`SELECT to_regclass('"${schema}".plugin_x_widgets') as t`);
      expect(row.rows[0].t).not.toBeNull();
    }, 120000);

    it('keeps two plugins sharing the platform DB on independent migration histories', async () => {
      const { schema, db, migrationsTable, tableSuffix } = await freshPlatformDb();
      await runMigrations(db, migrationsTable);

      const folderA = fixturePostgresMigrationsFolder(
        'CREATE TABLE plugin_a_things (id text primary key);',
        946684800000,
      );
      const folderB = fixturePostgresMigrationsFolder(
        'CREATE TABLE plugin_b_things (id text primary key);',
        946684800001,
      );

      // Suffixed with `tableSuffix` (unique per call, and short) — see the
      // sibling test's identical comment.
      await runPluginMigrations(
        db as unknown as PluginDb,
        folderA,
        `__drizzle_migrations_plugin_a_${tableSuffix}`,
      );
      await runPluginMigrations(
        db as unknown as PluginDb,
        folderB,
        `__drizzle_migrations_plugin_b_${tableSuffix}`,
      );

      for (const table of ['plugin_a_things', 'plugin_b_things']) {
        const row = await pool.query(`SELECT to_regclass('"${schema}".${table}') as t`);
        expect(row.rows[0].t).not.toBeNull();
      }
    }, 120000);
  },
);
