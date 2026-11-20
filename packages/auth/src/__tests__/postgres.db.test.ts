import { randomBytes } from 'node:crypto';
import { migrate } from '@sovereignfs/database';
import pg from 'pg';
import { afterAll, describe, expect, it } from 'vitest';
import { CORE_SIGN_IN_MIGRATIONS_TABLE, coreSignInMigrations } from '../core/index';
import { postgresDatabase } from '../postgres';
import { ACCOUNT_MIGRATIONS_TABLE, accountMigrations } from '../server/index';

// The database an app hands the package from its own PostgreSQL pool (auth.md §3): the package's migrations run on it, under their own
// history tables, and its statements, transactions and sessions work as the repository's own database does. Runs only on the
// PostgreSQL leg of `pnpm test:db`, in a schema of its own.
const url = process.env.SV_POSTGRES_URL;
const onPostgres = process.env.SV_DB_DIALECT === 'postgres' && url !== undefined;
const schema = `t_${randomBytes(4).toString('hex')}`;
const pools: pg.Pool[] = [];

afterAll(async () => {
  if (!onPostgres) return;
  const admin = new pg.Client({ connectionString: url });
  await admin.connect();
  await admin.query(`drop schema if exists ${schema} cascade`);
  await admin.end();
  for (const pool of pools) await pool.end().catch(() => undefined);
});

describe.runIf(onPostgres)('an app’s own PostgreSQL pool, as the package’s database', () => {
  it('takes the package’s migrations, and runs statements, a transaction and a session', async () => {
    const admin = new pg.Client({ connectionString: url });
    await admin.connect();
    await admin.query(`create schema ${schema}`);
    await admin.end();
    const pool = new pg.Pool({ connectionString: url, options: `-c search_path=${schema}` });
    pools.push(pool);
    const db = await postgresDatabase(pool);

    await migrate(db, accountMigrations('postgres'), { table: ACCOUNT_MIGRATIONS_TABLE });
    await migrate(db, coreSignInMigrations('postgres'), { table: CORE_SIGN_IN_MIGRATIONS_TABLE });
    // A second start finds them done.
    await migrate(db, accountMigrations('postgres'), { table: ACCOUNT_MIGRATIONS_TABLE });

    await db.run(
      "insert into users (id, name, email, email_verified, two_factor_enabled, created_at, updated_at) values (?, 'Ada', ?, true, false, now(), now())",
      ['u1', 'ada@example.com'],
    );
    expect((await db.run('select email from users where id = ?', ['u1'])).rows).toEqual([
      { email: 'ada@example.com' },
    ]);
    // A question mark in quoted text is not a placeholder.
    expect((await db.run("select 'what?' as said")).rows[0]?.said).toBe('what?');

    await expect(
      db.transaction(async (tx) => {
        await tx.run('delete from users where id = ?', ['u1']);
        throw new Error('changed my mind');
      }),
    ).rejects.toThrow('changed my mind');
    // A pool made outside `connect` reads a count as node-postgres does, as text.
    expect(Number((await db.run('select count(*) as n from users')).rows[0]?.n)).toBe(1);

    await db.session(async (session) => {
      await expect(db.run('select 1')).rejects.toThrow(/use the executor/);
      expect((await session.run('select 1 as one')).rows[0]?.one).toBe(1);
    });
    await db.ping();
  });
});
