import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { createClient, type PlatformDb } from '../client';
import { dbGet } from '../exec';
import { runMigrations, runPluginMigrations } from '../migrate';
import { getPlatformSetting, setPlatformSetting } from '../platform-db';
import type { PluginDb } from '../plugin-client';

/**
 * runMigrations() applies the real on-disk SQLite migrations to an in-memory DB
 * (the migrator finds them via findWorkspaceRoot() → repo root in the test cwd),
 * then seeds rows and returns a MigrationResult. These tests exercise the
 * downgrade-detection / version high-water-mark behaviour (RFC 0006).
 */
function memDb(): PlatformDb {
  return createClient({ url: ':memory:' });
}

describe('runMigrations — version tracking & downgrade guard', () => {
  it('records the running version and reports no downgrade on a fresh install', async () => {
    const db = memDb();
    const result = await runMigrations(db);

    expect(result.previousVersion).toBeNull();
    expect(result.downgradeDetected).toBe(false);
    // The running version is now persisted for the next startup to compare.
    expect(await getPlatformSetting(db, 'platform_version')).toBe(result.currentVersion);
  });

  it('reports no downgrade on an unchanged restart', async () => {
    const db = memDb();
    const first = await runMigrations(db);
    const second = await runMigrations(db);

    expect(second.previousVersion).toBe(first.currentVersion);
    expect(second.downgradeDetected).toBe(false);
  });

  it('detects a downgrade and keeps the higher stored version (watermark)', async () => {
    const db = memDb();
    await runMigrations(db);
    // Simulate the DB having been written by a much newer binary.
    await setPlatformSetting(db, 'platform_version', '999.0.0');

    const result = await runMigrations(db);

    expect(result.previousVersion).toBe('999.0.0');
    expect(result.downgradeDetected).toBe(true);
    // The warning must persist: the stored version stays at the high-water mark
    // rather than being overwritten with the older running version.
    expect(await getPlatformSetting(db, 'platform_version')).toBe('999.0.0');
  });
});

/** Builds a minimal on-disk Drizzle migrations folder (journal + one .sql
 *  file) so runPluginMigrations can read it via readMigrationFiles(). `when`
 *  is deliberately old (year-2000-ish) — the platform's own migrations carry
 *  2026+ timestamps, reproducing the exact ordering that broke shared-mode
 *  plugin migrations (see runPluginMigrations' doc comment). */
function fixtureMigrationsFolder(createSql: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'sv-plugin-migrations-'));
  mkdirSync(join(dir, 'meta'), { recursive: true });
  writeFileSync(
    join(dir, 'meta', '_journal.json'),
    JSON.stringify({
      version: '7',
      dialect: 'sqlite',
      entries: [{ idx: 0, version: '6', when: 946684800000, tag: '0000_init', breakpoints: true }],
    }),
  );
  writeFileSync(join(dir, '0000_init.sql'), createSql);
  return dir;
}

describe('runPluginMigrations — shared-mode plugin isolation from the platform history', () => {
  it('applies a plugin migration whose timestamp predates the platform migrations already in the shared DB', async () => {
    const db = memDb();
    // Platform migrations run first, exactly as instrumentation.ts orders it —
    // this populates __drizzle_migrations with 2026+ timestamps.
    await runMigrations(db);

    const folder = fixtureMigrationsFolder('CREATE TABLE plugin_x_widgets (id text primary key);');

    // Without a dedicated migrationsTable, Drizzle's migrator would compare
    // this migration's old `when` against __drizzle_migrations' newest row
    // (the platform's) and skip it as "already applied" — reproducing the
    // bug this test guards against.
    await runPluginMigrations(db as unknown as PluginDb, folder, '__drizzle_migrations_plugin_x');

    const row = await dbGet(
      db,
      sql`SELECT name FROM sqlite_master WHERE type='table' AND name='plugin_x_widgets'`,
    );
    expect(row).toBeTruthy();
  });

  it('keeps two plugins sharing the platform DB on independent migration histories', async () => {
    const db = memDb();
    await runMigrations(db);

    const folderA = fixtureMigrationsFolder('CREATE TABLE plugin_a_things (id text primary key);');
    const folderB = fixtureMigrationsFolder('CREATE TABLE plugin_b_things (id text primary key);');

    await runPluginMigrations(db as unknown as PluginDb, folderA, '__drizzle_migrations_plugin_a');
    await runPluginMigrations(db as unknown as PluginDb, folderB, '__drizzle_migrations_plugin_b');

    for (const table of ['plugin_a_things', 'plugin_b_things']) {
      const row = await dbGet(
        db,
        sql.raw(`SELECT name FROM sqlite_master WHERE type='table' AND name='${table}'`),
      );
      expect(row).toBeTruthy();
    }
  });
});
