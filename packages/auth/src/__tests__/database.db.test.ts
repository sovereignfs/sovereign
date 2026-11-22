import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { openDatabase, runMigrations } from '../database';

/**
 * The app's own database from its variables (`@sovereignfs/auth/database`), on the form the run names: a SQLite file of its own, a
 * namespace of its own on sqld (made because it is not there), or PostgreSQL, as an app with the prefix `NOTES` would read them.
 */
const dialect = process.env.SV_DB_DIALECT;
const name = `t_${randomBytes(4).toString('hex')}`;
const folder = mkdtempSync(path.join(tmpdir(), 'sv-auth-database-'));
afterAll(() => rmSync(folder, { recursive: true, force: true }));

function appEnv(): Record<string, string | undefined> {
  if (dialect === 'sqlite')
    return {
      NOTES_DB_DIALECT: 'sqlite',
      NOTES_SQLITE_URL: `file:${path.join(folder, 'notes.db')}`,
    };
  if (dialect === 'sqld')
    return {
      NOTES_DB_DIALECT: 'sqld',
      NOTES_SQLD_URL: process.env.SV_SQLD_URL,
      NOTES_SQLD_ADMIN_URL: process.env.SV_SQLD_ADMIN_URL,
      NOTES_SQLD_NAMESPACE: name,
    };
  return { NOTES_DB_DIALECT: 'postgres', NOTES_POSTGRES_URL: process.env.SV_POSTGRES_URL };
}

describe(`the app's own database (${dialect})`, () => {
  it('opens from the app’s variables, takes migrations under a table of its own, and runs a transaction', async () => {
    const database = await openDatabase({ prefix: 'NOTES', env: appEnv() });
    try {
      const table = `${name}_things`;
      const done = await runMigrations(
        database,
        [
          {
            name: '0001_things',
            sql: `CREATE TABLE ${table} (id text PRIMARY KEY, body text NOT NULL)`,
          },
        ],
        { table: `${name}_migrations` },
      );
      expect(done.applied).toEqual(['0001_things']);
      await database.transaction(async (tx) => {
        await tx.run(`insert into ${table} (id, body) values (?, ?)`, ['1', 'kept']);
      });
      expect((await database.run(`select body from ${table} where id = ?`, ['1'])).rows).toEqual([
        { body: 'kept' },
      ]);
      await database.run(`drop table ${table}`);
      await database.run(`drop table ${name}_migrations`);
    } finally {
      await database.close();
    }
  });

  it('stops on a variable that is missing, naming it', async () => {
    await expect(
      openDatabase({ prefix: 'NOTES', env: { NOTES_DB_DIALECT: 'sqlite' } }),
    ).rejects.toThrow(/NOTES_SQLITE_URL/);
  });
});
