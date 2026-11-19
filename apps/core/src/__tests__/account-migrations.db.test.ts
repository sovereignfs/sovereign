import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ACCOUNT_MIGRATIONS_TABLE, accountMigrations } from '@sovereignfs/auth/server';
import { migrate, type Database } from '@sovereignfs/database';
import { createTestDatabase, testDialect } from '@sovereignfs/database/testing';
import { afterAll, describe, expect, it } from 'vitest';
import { migrateCore } from '../db/migrate';

// The sign-in package's account migrations, which an app runs, make the same columns as core's own history for the tables they share
// (auth.md §10): a store made either way is the same store to better-auth.
const MIGRATIONS = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../migrations');
const TABLES = [
  'users',
  'sessions',
  'accounts',
  'verifications',
  'rate_limits',
  'two_factors',
  'passkeys',
];

async function shape(db: Database, table: string): Promise<Map<string, string>> {
  if (db.family === 'postgres') {
    const { rows } = await db.run(
      'select column_name as name, data_type as type, is_nullable as nullable from information_schema.columns where table_schema = current_schema() and table_name = ?',
      [table],
    );
    return new Map(rows.map((r) => [String(r.name), `${String(r.type)} ${String(r.nullable)}`]));
  }
  const { rows } = await db.run(`pragma table_info(${table})`);
  return new Map(rows.map((r) => [String(r.name), `${String(r.type)} ${String(r.notnull)}`]));
}

describe(`the sign-in package’s account migrations on ${testDialect}`, () => {
  const made: { cleanup(): Promise<void>; db: Database }[] = [];
  afterAll(async () => {
    for (const { db, cleanup } of made) {
      await db.close();
      await cleanup();
    }
  });

  it('make what core’s own history makes, for every column they share', async () => {
    const [ours, theirs] = await Promise.all([createTestDatabase(), createTestDatabase()]);
    const core = await ours.open();
    const app = await theirs.open();
    made.push({ db: core, cleanup: ours.cleanup }, { db: app, cleanup: theirs.cleanup });
    await migrateCore(core, MIGRATIONS);
    await migrate(app, accountMigrations(app.family), { table: ACCOUNT_MIGRATIONS_TABLE });

    const differences: string[] = [];
    for (const table of TABLES) {
      const coreColumns = await shape(core, table);
      const appColumns = await shape(app, table);
      expect(appColumns.size, table).toBeGreaterThan(0);
      for (const [name, column] of appColumns) {
        if (coreColumns.get(name) !== column) {
          differences.push(`${table}.${name}: ${column}, core ${coreColumns.get(name) ?? 'none'}`);
        }
      }
    }
    expect(differences).toEqual([]);
  });
});
