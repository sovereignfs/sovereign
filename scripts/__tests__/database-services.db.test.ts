/**
 * Smoke test for the database each CI leg starts. It proves the leg is the dialect
 * it claims to be and behaves the way the rest of the project will rely on, so a
 * leg can never pass by running nothing. Real database tests live next to the
 * code they test, are named `*.db.test.ts`, and run in the same legs.
 *
 * The leg is chosen with SV_DB_DIALECT (`sqld`, `sqlite` or `postgres`) and its
 * URL: SV_SQLD_URL and SV_SQLD_ADMIN_URL, SV_SQLITE_URL, or SV_POSTGRES_URL.
 */
import { randomBytes } from 'node:crypto';
import { rmSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import pg from 'pg';
import { afterAll, describe, expect, it } from 'vitest';

const DIALECTS = ['sqld', 'sqlite', 'postgres'];
const dialect = process.env.SV_DB_DIALECT;

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set; the ${dialect ?? 'database'} leg needs it`);
  return value;
}

const suffix = () => randomBytes(4).toString('hex');

it('SV_DB_DIALECT names a supported dialect', () => {
  expect(DIALECTS, 'SV_DB_DIALECT must be one of these').toContain(dialect);
});

type SqldResult = {
  type: 'ok' | 'error';
  error?: { message: string };
  response?: { result: { rows: unknown[][] } };
};

describe.skipIf(dialect !== 'sqld')('sqld', () => {
  const base = () => required('SV_SQLD_URL').replace(/\/$/, '');
  const admin = () => required('SV_SQLD_ADMIN_URL').replace(/\/$/, '');
  const namespaces: string[] = [];

  // Every request names its namespace, `default` included. With namespaces enabled
  // sqld otherwise takes the namespace from the first DNS label of the Host header,
  // so a URL such as http://127.0.0.1:8080 is read as the namespace "127" and
  // answers 404 ("Namespace `127` doesn't exist").
  async function execute(sql: string, namespace = 'default'): Promise<unknown[][]> {
    const response = await fetch(`${base()}/v2/pipeline`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-namespace': namespace },
      body: JSON.stringify({ requests: [{ type: 'execute', stmt: { sql } }, { type: 'close' }] }),
    });
    expect(response.ok, `sqld answered ${response.status}`).toBe(true);
    const { results } = (await response.json()) as { results: SqldResult[] };
    const first = results[0];
    if (first?.type === 'error') throw new Error(first.error?.message ?? 'sqld error');
    return first?.response?.result.rows ?? [];
  }

  afterAll(async () => {
    for (const name of namespaces) {
      await fetch(`${admin()}/v1/namespaces/${name}`, { method: 'DELETE' }).catch(() => {});
    }
  });

  it('answers its health check', async () => {
    const response = await fetch(`${base()}/health`);
    expect(response.status).toBe(200);
  });

  it('runs a query', async () => {
    expect(await execute('select 1 as one')).toHaveLength(1);
  });

  it('keeps namespaces apart, which older sqld releases ignored', async () => {
    const namespace = `ci_${suffix()}`;
    const created = await fetch(`${admin()}/v1/namespaces/${namespace}/create`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    expect(created.ok, `creating the namespace answered ${created.status}`).toBe(true);
    namespaces.push(namespace);

    await execute('create table isolation_probe (id integer primary key)', namespace);
    const probe = "select name from sqlite_master where name = 'isolation_probe'";
    expect(await execute(probe, namespace), 'the table exists in its own namespace').toHaveLength(
      1,
    );
    expect(await execute(probe), 'and is invisible in the default one').toHaveLength(0);
  });
});

describe.skipIf(dialect !== 'sqlite')('SQLite file', () => {
  it('opens the configured file, writes and reads back', () => {
    const url = required('SV_SQLITE_URL');
    expect(url.startsWith('file:'), 'SV_SQLITE_URL is a file: URL').toBe(true);
    const file = url.slice('file:'.length);
    const db = new DatabaseSync(file);
    try {
      db.exec('drop table if exists ci_smoke');
      db.exec('create table ci_smoke (id integer primary key, value text not null)');
      db.prepare('insert into ci_smoke (value) values (?)').run('hello');
      expect(db.prepare('select value from ci_smoke').get()).toEqual({ value: 'hello' });
      expect(db.prepare('pragma journal_mode = wal').get()).toEqual({ journal_mode: 'wal' });
    } finally {
      db.exec('drop table if exists ci_smoke');
      db.close();
      for (const extra of ['', '-wal', '-shm']) rmSync(`${file}${extra}`, { force: true });
    }
  });
});

describe.skipIf(dialect !== 'postgres')('PostgreSQL', () => {
  async function withClient<T>(run: (client: pg.Client) => Promise<T>): Promise<T> {
    const client = new pg.Client({ connectionString: required('SV_POSTGRES_URL') });
    await client.connect();
    try {
      return await run(client);
    } finally {
      await client.end();
    }
  }

  it('is PostgreSQL 16 or newer', async () => {
    const version = await withClient(async (client) => {
      const result = await client.query("select current_setting('server_version_num')::int as v");
      return (result.rows[0] as { v: number }).v;
    });
    expect(version).toBeGreaterThanOrEqual(160_000);
  });

  it('keeps schemas apart', async () => {
    const schema = `ci_${suffix()}`;
    await withClient(async (client) => {
      try {
        await client.query(`create schema ${schema}`);
        await client.query(`create table ${schema}.isolation_probe (id integer primary key)`);
        const inside = await client.query(
          'select count(*)::int as n from information_schema.tables where table_schema = $1 and table_name = $2',
          [schema, 'isolation_probe'],
        );
        expect((inside.rows[0] as { n: number }).n).toBe(1);
        const outside = await client.query(
          "select count(*)::int as n from information_schema.tables where table_schema = 'public' and table_name = 'isolation_probe'",
        );
        expect((outside.rows[0] as { n: number }).n).toBe(0);
      } finally {
        await client.query(`drop schema if exists ${schema} cascade`);
      }
    });
  });

  it('returns bigint and count(*) as strings, which code must coerce', async () => {
    const row = await withClient(async (client) => {
      const result = await client.query('select count(*) as n, 9007199254740993::bigint as big');
      return result.rows[0] as { n: unknown; big: unknown };
    });
    expect(row.n).toBe('1');
    expect(row.big).toBe('9007199254740993');
  });
});
