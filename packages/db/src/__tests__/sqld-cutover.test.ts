import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Client, InStatement } from '@libsql/client';
import Database from 'better-sqlite3-multiple-ciphers';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SqldCutoverError, cutoverSqliteFileToSqld, previewSqliteFile } from '../sqld-cutover';

/**
 * A minimal `Client` test double backed by a real in-memory SQLite database
 * (not a stub returning canned values) — `cutoverSqliteFileToSqld` only ever
 * calls `execute`/`migrate`, both implemented here against an actual SQLite
 * engine, so these tests exercise real schema/FK/row behavior without
 * needing a live sqld server.
 */
function fakeSqldClient(): Client {
  const db = new Database(':memory:');
  return {
    async execute(stmt: InStatement) {
      const sql = typeof stmt === 'string' ? stmt : stmt.sql;
      const args = typeof stmt === 'string' ? [] : ((stmt.args as unknown[]) ?? []);
      if (/^\s*select/i.test(sql)) {
        const rows = db.prepare(sql).all(...args) as Record<string, unknown>[];
        const first = rows[0];
        return { rows, columns: first ? Object.keys(first) : [] } as never;
      }
      const info = db.prepare(sql).run(...args);
      return { rows: [], rowsAffected: info.changes } as never;
    },
    async migrate(stmts: InStatement[]) {
      const tx = db.transaction((items: InStatement[]) => {
        for (const stmt of items) {
          const sql = typeof stmt === 'string' ? stmt : stmt.sql;
          const args = typeof stmt === 'string' ? [] : ((stmt.args as unknown[]) ?? []);
          db.prepare(sql).run(...args);
        }
      });
      tx(stmts);
      return [];
    },
  } as unknown as Client;
}

describe('sqld cutover (workstream 0009 leg 4)', () => {
  let dataDir: string;
  let dbPath: string;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), 'sv-sqld-cutover-'));
    dbPath = join(dataDir, 'source.db');
    const source = new Database(dbPath);
    source.exec(`
      CREATE TABLE lists (id TEXT PRIMARY KEY, name TEXT NOT NULL);
      CREATE TABLE items (
        id TEXT PRIMARY KEY,
        list_id TEXT NOT NULL REFERENCES lists(id),
        title TEXT NOT NULL,
        done INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX items_list_id_idx ON items(list_id);
    `);
    source.prepare('INSERT INTO lists (id, name) VALUES (?, ?)').run('list-1', 'Groceries');
    const insertItem = source.prepare(
      'INSERT INTO items (id, list_id, title, done) VALUES (?, ?, ?, ?)',
    );
    insertItem.run('item-1', 'list-1', 'Milk', 0);
    insertItem.run('item-2', 'list-1', 'Eggs', 1);
    source.close();
  });

  afterEach(() => {
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('previewSqliteFile reports table/row counts with no destination involved', () => {
    const preview = previewSqliteFile(dbPath);
    expect(preview.sort((a, b) => a.table.localeCompare(b.table))).toEqual([
      { table: 'items', rows: 2 },
      { table: 'lists', rows: 1 },
    ]);
  });

  it('copies schema and every row into an empty destination', async () => {
    const client = fakeSqldClient();
    const results = await cutoverSqliteFileToSqld(dbPath, client);

    expect(results.sort((a, b) => a.table.localeCompare(b.table))).toEqual([
      { table: 'items', sourceRows: 2, destRows: 2 },
      { table: 'lists', sourceRows: 1, destRows: 1 },
    ]);

    const rows = await client.execute('SELECT id, list_id, title, done FROM items ORDER BY id');
    expect(rows.rows).toEqual([
      { id: 'item-1', list_id: 'list-1', title: 'Milk', done: 0 },
      { id: 'item-2', list_id: 'list-1', title: 'Eggs', done: 1 },
    ]);
  });

  it('refuses to run against a non-empty destination', async () => {
    const client = fakeSqldClient();
    await client.execute('CREATE TABLE lists (id TEXT PRIMARY KEY)');

    await expect(cutoverSqliteFileToSqld(dbPath, client)).rejects.toThrow(SqldCutoverError);
  });

  it('refuses to run against a source with no tables', async () => {
    const emptyPath = join(dataDir, 'empty.db');
    new Database(emptyPath).close();

    await expect(cutoverSqliteFileToSqld(emptyPath, fakeSqldClient())).rejects.toThrow(
      SqldCutoverError,
    );
  });

  it('refuses to run while another connection holds a write lock on the source', async () => {
    const writer = new Database(dbPath);
    writer.pragma('busy_timeout = 0');
    writer.exec('BEGIN IMMEDIATE');
    try {
      await expect(cutoverSqliteFileToSqld(dbPath, fakeSqldClient())).rejects.toThrow(
        SqldCutoverError,
      );
    } finally {
      writer.exec('ROLLBACK');
      writer.close();
    }

    // The lock is released — a subsequent attempt succeeds.
    const results = await cutoverSqliteFileToSqld(dbPath, fakeSqldClient());
    expect(results.length).toBe(2);
  });

  it('copies BLOB columns faithfully', async () => {
    const blobPath = join(dataDir, 'blob.db');
    const source = new Database(blobPath);
    source.exec('CREATE TABLE assets (id TEXT PRIMARY KEY, data BLOB NOT NULL)');
    source.prepare('INSERT INTO assets (id, data) VALUES (?, ?)').run('a1', Buffer.from([1, 2, 3]));
    source.close();

    const client = fakeSqldClient();
    await cutoverSqliteFileToSqld(blobPath, client);

    const rows = await client.execute({
      sql: 'SELECT data FROM assets WHERE id = ?',
      args: ['a1'],
    });
    const stored = (rows.rows[0] as unknown as { data: Uint8Array }).data;
    expect(Buffer.from(stored)).toEqual(Buffer.from([1, 2, 3]));
  });
});
