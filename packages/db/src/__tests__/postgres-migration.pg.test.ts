import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3-multiple-ciphers';
import { Pool } from 'pg';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  PostgresMigrationError,
  migratePluginSqliteToPostgres,
  previewSqliteFileForPostgres,
} from '../postgres-migration';

/**
 * Live Postgres coverage for `sv db migrate-to-postgres`. Skipped unless
 * TEST_DATABASE_URL points at a Postgres instance (same gate as
 * postgres.pg.test.ts), so the default `pnpm test` stays Docker-free.
 *
 * TRANSITIONAL TOOLING — see the note atop ../postgres-migration.ts.
 */
const PG_URL = process.env.TEST_DATABASE_URL;

describe.skipIf(!PG_URL)('migratePluginSqliteToPostgres', () => {
  let pool: Pool;
  let dataDir: string;
  let schemaCounter = 0;

  beforeAll(() => {
    pool = new Pool({ connectionString: PG_URL });
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), 'sv-pg-migration-'));
  });

  afterEach(async () => {
    rmSync(dataDir, { recursive: true, force: true });
  });

  async function freshSchema(): Promise<string> {
    const schema = `test_pg_migration_${schemaCounter++}`;
    await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await pool.query(`CREATE SCHEMA "${schema}"`);
    return schema;
  }

  function sourceDb(): { path: string; db: InstanceType<typeof Database> } {
    const path = join(dataDir, 'source.db');
    const db = new Database(path);
    return { path, db };
  }

  it('previewSqliteFileForPostgres reports table/row counts with no destination involved', () => {
    const { path, db } = sourceDb();
    db.exec('CREATE TABLE notes (id TEXT PRIMARY KEY, title TEXT NOT NULL)');
    db.prepare('INSERT INTO notes (id, title) VALUES (?, ?)').run('n1', 'Hello');
    db.close();

    expect(previewSqliteFileForPostgres(path)).toEqual([{ table: 'notes', rows: 1 }]);
  });

  it('copies rows, coercing booleans and timestamps to native Postgres types', async () => {
    const schema = await freshSchema();
    await pool.query(
      `CREATE TABLE "${schema}".items (
         id TEXT PRIMARY KEY,
         title TEXT NOT NULL,
         done BOOLEAN NOT NULL DEFAULT false,
         created_at TIMESTAMPTZ NOT NULL,
         payload BYTEA
       )`,
    );

    const { path, db } = sourceDb();
    db.exec(`CREATE TABLE items (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      done INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      payload BLOB
    )`);
    const epochSeconds = 1_755_000_000;
    db.prepare(
      'INSERT INTO items (id, title, done, created_at, payload) VALUES (?, ?, ?, ?, ?)',
    ).run('i1', 'Buy milk', 1, epochSeconds, Buffer.from([1, 2, 3]));
    db.prepare(
      'INSERT INTO items (id, title, done, created_at, payload) VALUES (?, ?, ?, ?, ?)',
    ).run('i2', 'Buy eggs', 0, epochSeconds, null);
    db.close();

    const results = await migratePluginSqliteToPostgres(path, pool, schema);
    expect(results).toEqual([{ table: 'items', sourceRows: 2, destRows: 2 }]);

    const { rows } = await pool.query(
      `SELECT id, title, done, created_at, payload FROM "${schema}".items ORDER BY id`,
    );
    expect(rows[0].done).toBe(true);
    expect(rows[1].done).toBe(false);
    expect(rows[0].created_at.toISOString()).toBe(new Date(epochSeconds * 1000).toISOString());
    expect(Buffer.from(rows[0].payload)).toEqual(Buffer.from([1, 2, 3]));
    expect(rows[1].payload).toBeNull();
  });

  it('leaves the original SQLite file untouched', async () => {
    const schema = await freshSchema();
    await pool.query(`CREATE TABLE "${schema}".notes (id TEXT PRIMARY KEY, title TEXT NOT NULL)`);

    const { path, db } = sourceDb();
    db.exec('CREATE TABLE notes (id TEXT PRIMARY KEY, title TEXT NOT NULL)');
    db.prepare('INSERT INTO notes (id, title) VALUES (?, ?)').run('n1', 'Hello');
    db.close();

    await migratePluginSqliteToPostgres(path, pool, schema);

    const after = new Database(path, { readonly: true });
    const row = after.prepare('SELECT title FROM notes WHERE id = ?').get('n1') as {
      title: string;
    };
    expect(row.title).toBe('Hello');
    after.close();
  });

  it('refuses when the destination is missing a table the source has', async () => {
    const schema = await freshSchema();
    // No tables created in the destination schema at all.

    const { path, db } = sourceDb();
    db.exec('CREATE TABLE notes (id TEXT PRIMARY KEY)');
    db.close();

    await expect(migratePluginSqliteToPostgres(path, pool, schema)).rejects.toThrow(
      PostgresMigrationError,
    );
  });

  it('refuses when the destination table already has rows', async () => {
    const schema = await freshSchema();
    await pool.query(`CREATE TABLE "${schema}".notes (id TEXT PRIMARY KEY)`);
    await pool.query(`INSERT INTO "${schema}".notes (id) VALUES ('existing')`);

    const { path, db } = sourceDb();
    db.exec('CREATE TABLE notes (id TEXT PRIMARY KEY)');
    db.prepare('INSERT INTO notes (id) VALUES (?)').run('n1');
    db.close();

    await expect(migratePluginSqliteToPostgres(path, pool, schema)).rejects.toThrow(
      PostgresMigrationError,
    );
  });

  it('refuses when the destination table is missing a column the source has (would drop data)', async () => {
    const schema = await freshSchema();
    // Destination lacks the "notes" column present in the source.
    await pool.query(`CREATE TABLE "${schema}".notes (id TEXT PRIMARY KEY)`);

    const { path, db } = sourceDb();
    db.exec('CREATE TABLE notes (id TEXT PRIMARY KEY, notes TEXT)');
    db.prepare('INSERT INTO notes (id, notes) VALUES (?, ?)').run('n1', 'secret');
    db.close();

    await expect(migratePluginSqliteToPostgres(path, pool, schema)).rejects.toThrow(
      PostgresMigrationError,
    );
  });

  it('tolerates a destination column absent from the source (left at its default)', async () => {
    const schema = await freshSchema();
    await pool.query(
      `CREATE TABLE "${schema}".notes (id TEXT PRIMARY KEY, title TEXT NOT NULL, archived BOOLEAN NOT NULL DEFAULT false)`,
    );

    const { path, db } = sourceDb();
    db.exec('CREATE TABLE notes (id TEXT PRIMARY KEY, title TEXT NOT NULL)');
    db.prepare('INSERT INTO notes (id, title) VALUES (?, ?)').run('n1', 'Hello');
    db.close();

    const results = await migratePluginSqliteToPostgres(path, pool, schema);
    expect(results).toEqual([{ table: 'notes', sourceRows: 1, destRows: 1 }]);

    const { rows } = await pool.query(`SELECT archived FROM "${schema}".notes WHERE id = 'n1'`);
    expect(rows[0].archived).toBe(false);
  });

  it('refuses to run against a source with no tables', async () => {
    const schema = await freshSchema();
    const emptyPath = join(dataDir, 'empty.db');
    new Database(emptyPath).close();

    await expect(migratePluginSqliteToPostgres(emptyPath, pool, schema)).rejects.toThrow(
      PostgresMigrationError,
    );
  });

  it('opens an RFC 0071 encrypted source with the right key, and refuses with a wrong one', async () => {
    const schema = await freshSchema();
    await pool.query(`CREATE TABLE "${schema}".notes (id TEXT PRIMARY KEY, title TEXT NOT NULL)`);

    const path = join(dataDir, 'encrypted.db');
    const key = Buffer.alloc(32, 7);
    const setup = new Database(path);
    setup.pragma(`cipher='sqlcipher'`);
    setup.key(key);
    setup.pragma('journal_mode = WAL');
    setup.exec('CREATE TABLE notes (id TEXT PRIMARY KEY, title TEXT NOT NULL)');
    setup.prepare('INSERT INTO notes (id, title) VALUES (?, ?)').run('n1', 'Secret note');
    setup.close();

    await expect(
      migratePluginSqliteToPostgres(path, pool, schema, Buffer.alloc(32, 9)),
    ).rejects.toThrow(PostgresMigrationError);

    const results = await migratePluginSqliteToPostgres(path, pool, schema, key);
    expect(results).toEqual([{ table: 'notes', sourceRows: 1, destRows: 1 }]);

    const { rows } = await pool.query(`SELECT title FROM "${schema}".notes WHERE id = 'n1'`);
    expect(rows[0].title).toBe('Secret note');
  });

  it('refuses while another connection holds a write lock on the source', async () => {
    const schema = await freshSchema();
    await pool.query(`CREATE TABLE "${schema}".notes (id TEXT PRIMARY KEY)`);

    const { path, db } = sourceDb();
    db.exec('CREATE TABLE notes (id TEXT PRIMARY KEY)');

    const writer = new Database(path);
    writer.pragma('busy_timeout = 0');
    writer.exec('BEGIN IMMEDIATE');
    try {
      await expect(migratePluginSqliteToPostgres(path, pool, schema)).rejects.toThrow(
        PostgresMigrationError,
      );
    } finally {
      writer.exec('ROLLBACK');
      writer.close();
    }
    db.close();

    // The lock is released — a subsequent attempt succeeds.
    const results = await migratePluginSqliteToPostgres(path, pool, schema);
    expect(results).toEqual([{ table: 'notes', sourceRows: 0, destRows: 0 }]);
  });

  it('rolls back rows already copied if a later table fails mid-transaction', async () => {
    const schema = await freshSchema();
    // "notes" (copies cleanly, first alphabetically) and "zzz_items" (has a
    // NOT NULL column with no default the source can't satisfy) both exist in
    // the destination, so the failure surfaces only once "notes" has already
    // been inserted inside the same transaction — a real mid-transaction
    // failure, not one caught by the upfront table-existence check.
    await pool.query(`CREATE TABLE "${schema}".notes (id TEXT PRIMARY KEY)`);
    await pool.query(
      `CREATE TABLE "${schema}".zzz_items (id TEXT PRIMARY KEY, required_field TEXT NOT NULL)`,
    );

    const { path, db } = sourceDb();
    db.exec('CREATE TABLE notes (id TEXT PRIMARY KEY)');
    db.prepare('INSERT INTO notes (id) VALUES (?)').run('n1');
    // Source has no "required_field" column at all for zzz_items — the
    // INSERT omits it entirely, tripping the destination's NOT NULL
    // constraint at execution time (a genuine Postgres-level failure, not
    // this tool's own upfront column check, which only catches the reverse
    // case — a source column missing from the destination).
    db.exec('CREATE TABLE zzz_items (id TEXT PRIMARY KEY)');
    db.prepare('INSERT INTO zzz_items (id) VALUES (?)').run('z1');
    db.close();

    await expect(migratePluginSqliteToPostgres(path, pool, schema)).rejects.toThrow();

    const { rows } = await pool.query(`SELECT COUNT(*)::int AS n FROM "${schema}".notes`);
    expect(rows[0].n).toBe(0);
  });
});
