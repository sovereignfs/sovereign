import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { PlatformDb } from '../client';
import { runPluginMigrations } from '../migrate';
import {
  PluginIsolationMigrationError,
  discoverPluginTables,
  migratePluginSharedToIsolated,
  sharedToIsolatedMigrationsTableName,
} from '../plugin-isolation-migration';
import { pluginMigrationsTableName } from '../plugin-client';
import type { PluginDb } from '../plugin-client';

/**
 * Live Postgres coverage for `sv plugin migrate-to-isolated`. Skipped unless
 * TEST_DATABASE_URL points at a Postgres instance (same gate as
 * postgres.pg.test.ts), so the default `pnpm test` stays Docker-free.
 *
 * TRANSITIONAL TOOLING — see the note atop ../plugin-isolation-migration.ts.
 */
const PG_URL = process.env.TEST_DATABASE_URL;

/** Builds a minimal on-disk Drizzle Postgres migrations folder (journal +
 *  one .sql file), mirroring migrate.pg.test.ts's own fixture helper. */
function fixturePostgresMigrationsFolder(createSql: string, whenMs: number): string {
  const dir = mkdtempSync(join(tmpdir(), 'sv-pg-iso-transition-migrations-'));
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

describe.skipIf(!PG_URL)('migratePluginSharedToIsolated', () => {
  let pool: Pool;
  let schemaCounter = 0;

  beforeAll(() => {
    pool = new Pool({ connectionString: PG_URL });
  });

  afterAll(async () => {
    await pool.end();
  });

  async function freshSchema(prefix: string): Promise<string> {
    const schema = `${prefix}_${schemaCounter++}`;
    await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await pool.query(`CREATE SCHEMA "${schema}"`);
    return schema;
  }

  function dbFor(schema: string): PlatformDb & PluginDb {
    const scopedPool = new Pool({
      connectionString: PG_URL,
      options: `-c search_path="${schema}"`,
    });
    return { dialect: 'postgres', db: drizzle(scopedPool) } as unknown as PlatformDb & PluginDb;
  }

  it('copies every row of every table from the platform source into the isolated destination', async () => {
    const platformSchema = await freshSchema('test_iso_migration_platform');
    const isolatedSchema = await freshSchema('test_iso_migration_isolated');
    const platformDb = dbFor(platformSchema);
    const pluginDb = dbFor(isolatedSchema);

    await pool.query(
      `CREATE TABLE "${platformSchema}".tasks_lists (id TEXT PRIMARY KEY, name TEXT NOT NULL)`,
    );
    await pool.query(
      `CREATE TABLE "${isolatedSchema}".tasks_lists (id TEXT PRIMARY KEY, name TEXT NOT NULL)`,
    );
    await pool.query(
      `INSERT INTO "${platformSchema}".tasks_lists (id, name) VALUES ('l1', 'Groceries')`,
    );

    const results = await migratePluginSharedToIsolated(['tasks_lists'], platformDb, pluginDb);
    expect(results).toEqual([{ table: 'tasks_lists', sourceRows: 1, destRows: 1 }]);

    const { rows } = await pool.query(`SELECT name FROM "${isolatedSchema}".tasks_lists`);
    expect(rows).toEqual([{ name: 'Groceries' }]);
  });

  it('leaves the platform source untouched after a successful migration', async () => {
    const platformSchema = await freshSchema('test_iso_migration_platform');
    const isolatedSchema = await freshSchema('test_iso_migration_isolated');
    const platformDb = dbFor(platformSchema);
    const pluginDb = dbFor(isolatedSchema);

    await pool.query(
      `CREATE TABLE "${platformSchema}".tasks_lists (id TEXT PRIMARY KEY, name TEXT NOT NULL)`,
    );
    await pool.query(
      `CREATE TABLE "${isolatedSchema}".tasks_lists (id TEXT PRIMARY KEY, name TEXT NOT NULL)`,
    );
    await pool.query(
      `INSERT INTO "${platformSchema}".tasks_lists (id, name) VALUES ('l1', 'Groceries')`,
    );

    await migratePluginSharedToIsolated(['tasks_lists'], platformDb, pluginDb);

    const { rows } = await pool.query(`SELECT name FROM "${platformSchema}".tasks_lists`);
    expect(rows).toEqual([{ name: 'Groceries' }]);
  });

  it('migrates multiple tables atomically in one transaction', async () => {
    const platformSchema = await freshSchema('test_iso_migration_platform');
    const isolatedSchema = await freshSchema('test_iso_migration_isolated');
    const platformDb = dbFor(platformSchema);
    const pluginDb = dbFor(isolatedSchema);

    for (const schema of [platformSchema, isolatedSchema]) {
      await pool.query(`CREATE TABLE "${schema}".tasks_lists (id TEXT PRIMARY KEY)`);
      await pool.query(
        `CREATE TABLE "${schema}".tasks_items (id TEXT PRIMARY KEY, list_id TEXT NOT NULL)`,
      );
    }
    await pool.query(`INSERT INTO "${platformSchema}".tasks_lists (id) VALUES ('l1')`);
    await pool.query(
      `INSERT INTO "${platformSchema}".tasks_items (id, list_id) VALUES ('i1', 'l1')`,
    );

    const results = await migratePluginSharedToIsolated(
      ['tasks_lists', 'tasks_items'],
      platformDb,
      pluginDb,
    );
    expect(results).toEqual(
      expect.arrayContaining([
        { table: 'tasks_lists', sourceRows: 1, destRows: 1 },
        { table: 'tasks_items', sourceRows: 1, destRows: 1 },
      ]),
    );
  });

  it('refuses when a destination table already has rows', async () => {
    const platformSchema = await freshSchema('test_iso_migration_platform');
    const isolatedSchema = await freshSchema('test_iso_migration_isolated');
    const platformDb = dbFor(platformSchema);
    const pluginDb = dbFor(isolatedSchema);

    await pool.query(`CREATE TABLE "${platformSchema}".tasks_lists (id TEXT PRIMARY KEY)`);
    await pool.query(`CREATE TABLE "${isolatedSchema}".tasks_lists (id TEXT PRIMARY KEY)`);
    await pool.query(`INSERT INTO "${platformSchema}".tasks_lists (id) VALUES ('l1')`);
    await pool.query(`INSERT INTO "${isolatedSchema}".tasks_lists (id) VALUES ('existing')`);

    await expect(
      migratePluginSharedToIsolated(['tasks_lists'], platformDb, pluginDb),
    ).rejects.toThrow(PluginIsolationMigrationError);
  });

  it('rolls back rows already copied if a later table fails mid-transaction', async () => {
    const platformSchema = await freshSchema('test_iso_migration_platform');
    const isolatedSchema = await freshSchema('test_iso_migration_isolated');
    const platformDb = dbFor(platformSchema);
    const pluginDb = dbFor(isolatedSchema);

    await pool.query(`CREATE TABLE "${platformSchema}".tasks_lists (id TEXT PRIMARY KEY)`);
    await pool.query(`CREATE TABLE "${isolatedSchema}".tasks_lists (id TEXT PRIMARY KEY)`);
    // Isolated destination for tasks_items has a NOT NULL column the source
    // can't satisfy — a genuine Postgres-level failure partway through.
    await pool.query(`CREATE TABLE "${platformSchema}".tasks_items (id TEXT PRIMARY KEY)`);
    await pool.query(
      `CREATE TABLE "${isolatedSchema}".tasks_items (id TEXT PRIMARY KEY, required_field TEXT NOT NULL)`,
    );

    await pool.query(`INSERT INTO "${platformSchema}".tasks_lists (id) VALUES ('l1')`);
    await pool.query(`INSERT INTO "${platformSchema}".tasks_items (id) VALUES ('i1')`);

    await expect(
      migratePluginSharedToIsolated(['tasks_lists', 'tasks_items'], platformDb, pluginDb),
    ).rejects.toThrow();

    const { rows } = await pool.query(
      `SELECT count(*)::int AS n FROM "${isolatedSchema}".tasks_lists`,
    );
    expect(rows[0].n).toBe(0);
  });

  it('refuses on a dialect mismatch between platform and plugin', async () => {
    const platformSchema = await freshSchema('test_iso_migration_platform');
    const platformDb = dbFor(platformSchema);
    const fakeSqlitePluginDb = { dialect: 'sqlite', db: {} } as unknown as PluginDb;

    await expect(
      migratePluginSharedToIsolated(['tasks_lists'], platformDb, fakeSqlitePluginDb),
    ).rejects.toThrow(PluginIsolationMigrationError);
  });
});

describe.skipIf(!PG_URL)(
  'runPluginMigrations — shared→isolated transition table-name collision',
  () => {
    let pool: Pool;
    let schemaCounter = 0;

    beforeAll(() => {
      pool = new Pool({ connectionString: PG_URL });
    });

    afterAll(async () => {
      await pool.end();
    });

    async function freshSchemaPluginDb(): Promise<{ schema: string; pluginDb: PluginDb }> {
      const schema = `test_pg_iso_transition_${schemaCounter++}`;
      await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await pool.query(`CREATE SCHEMA "${schema}"`);
      const scopedPool = new Pool({
        connectionString: PG_URL,
        options: `-c search_path="${schema}"`,
      });
      return { schema, pluginDb: { dialect: 'postgres', db: drizzle(scopedPool) } };
    }

    afterEach(async () => {
      await pool.query(`DROP SCHEMA IF EXISTS "drizzle" CASCADE`);
    });

    it('reproduces the incident: reusing pluginMigrationsTableName for the isolated transition sees prior shared-mode history as already applied and skips table creation', async () => {
      const pluginId = 'fs.sovereign.tasks';
      const migrationsTable = pluginMigrationsTableName(pluginId);

      // Simulate years of real shared-mode migration history already
      // recorded under this exact table name — shared-mode migrations
      // always use pluginMigrationsTableName to avoid colliding with the
      // platform's own __drizzle_migrations table.
      const historic = await freshSchemaPluginDb();
      const historicFolder = fixturePostgresMigrationsFolder(
        'CREATE TABLE tasks_lists (id text primary key);',
        1700000000000,
      );
      await runPluginMigrations(historic.pluginDb, historicFolder, migrationsTable);

      // Provision a brand-new, empty isolated schema for the same plugin —
      // exactly what `sv plugin migrate-to-isolated` does before copying
      // data — but reusing the SAME migrations-table name, which already
      // has history from above (Drizzle's Postgres migrator tracks applied
      // migrations in a fixed `drizzle` schema, not scoped per connection's
      // search_path).
      const isolated = await freshSchemaPluginDb();
      const isolatedFolder = fixturePostgresMigrationsFolder(
        'CREATE TABLE tasks_items (id text primary key);',
        1650000000000, // older than the historic entry above
      );
      await runPluginMigrations(isolated.pluginDb, isolatedFolder, migrationsTable);

      const table = await pool.query(`SELECT to_regclass('"${isolated.schema}".tasks_items') as t`);
      // Reproduces the bug: the isolated schema's table was never created —
      // its migration's older timestamp looked "already applied" against
      // the historic shared-mode entry sharing the same tracking table.
      expect(table.rows[0].t).toBeNull();
    });

    it('fix: sharedToIsolatedMigrationsTableName keeps the one-time transition independent of prior shared-mode history', async () => {
      const pluginId = 'fs.sovereign.tasks';
      const sharedTable = pluginMigrationsTableName(pluginId);
      const transitionTable = sharedToIsolatedMigrationsTableName(pluginId);

      const historic = await freshSchemaPluginDb();
      const historicFolder = fixturePostgresMigrationsFolder(
        'CREATE TABLE tasks_lists (id text primary key);',
        1700000000000,
      );
      await runPluginMigrations(historic.pluginDb, historicFolder, sharedTable);

      const isolated = await freshSchemaPluginDb();
      const isolatedFolder = fixturePostgresMigrationsFolder(
        'CREATE TABLE tasks_items (id text primary key);',
        1650000000000,
      );
      await runPluginMigrations(isolated.pluginDb, isolatedFolder, transitionTable);

      const table = await pool.query(`SELECT to_regclass('"${isolated.schema}".tasks_items') as t`);
      expect(table.rows[0].t).not.toBeNull();
    });
  },
);

describe('discoverPluginTables', () => {
  let dir: string;

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('extracts table names from double-quoted (Postgres) CREATE TABLE statements', () => {
    dir = mkdtempSync(join(tmpdir(), 'sv-discover-tables-pg-'));
    writeFileSync(
      join(dir, '0000_initial.sql'),
      'CREATE TABLE "tasks_lists" (\n\t"id" text PRIMARY KEY NOT NULL\n);\n' +
        'CREATE TABLE "tasks_items" (\n\t"id" text PRIMARY KEY NOT NULL\n);',
    );
    expect(discoverPluginTables(dir)).toEqual(['tasks_lists', 'tasks_items']);
  });

  it('extracts table names from backtick-quoted (SQLite) CREATE TABLE statements, including IF NOT EXISTS', () => {
    dir = mkdtempSync(join(tmpdir(), 'sv-discover-tables-sqlite-'));
    writeFileSync(
      join(dir, '0000_initial.sql'),
      'CREATE TABLE IF NOT EXISTS `tasks_lists` (\n\t`id` text PRIMARY KEY NOT NULL\n);\n' +
        'CREATE TABLE `tasks_items` (\n\t`id` text PRIMARY KEY NOT NULL\n);',
    );
    expect(discoverPluginTables(dir)).toEqual(['tasks_lists', 'tasks_items']);
  });

  it('preserves first-seen order across multiple migration files, sorted by filename', () => {
    dir = mkdtempSync(join(tmpdir(), 'sv-discover-tables-multi-'));
    writeFileSync(join(dir, '0000_initial.sql'), 'CREATE TABLE "tasks_lists" ("id" text);');
    writeFileSync(join(dir, '0001_add_items.sql'), 'CREATE TABLE "tasks_items" ("id" text);');
    expect(discoverPluginTables(dir)).toEqual(['tasks_lists', 'tasks_items']);
  });

  it('de-duplicates a table name that appears more than once', () => {
    dir = mkdtempSync(join(tmpdir(), 'sv-discover-tables-dedup-'));
    writeFileSync(
      join(dir, '0000_initial.sql'),
      'CREATE TABLE "tasks_lists" ("id" text);\nCREATE TABLE "tasks_items" ("id" text);',
    );
    writeFileSync(
      join(dir, '0001_noop.sql'),
      '-- a later migration that only ALTERs, not CREATEs\nALTER TABLE "tasks_lists" ADD COLUMN "archived" integer;',
    );
    expect(discoverPluginTables(dir)).toEqual(['tasks_lists', 'tasks_items']);
  });
});
