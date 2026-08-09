import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { runPluginMigrations } from '../migrate';
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
    let schemaCounter = 0;

    beforeAll(() => {
      pool = new Pool({ connectionString: PG_URL });
    });

    afterAll(async () => {
      await pool.end();
    });

    async function freshSchemaPluginDb(): Promise<{ schema: string; pluginDb: PluginDb }> {
      const schema = `test_pg_migrate_${schemaCounter++}`;
      await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await pool.query(`CREATE SCHEMA "${schema}"`);
      const scopedPool = new Pool({
        connectionString: PG_URL,
        options: `-c search_path="${schema}"`,
      });
      return { schema, pluginDb: { dialect: 'postgres', db: drizzlePg(scopedPool) } };
    }

    afterEach(async () => {
      await pool.query(`DROP SCHEMA IF EXISTS "drizzle" CASCADE`);
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
