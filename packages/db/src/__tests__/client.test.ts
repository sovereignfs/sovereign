import { isAbsolute, resolve } from 'node:path';
import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { createClient, pgSslMode, resolveSqlitePath } from '../client';

describe('pgSslMode', () => {
  it('returns null when sslmode is absent or disabled', () => {
    expect(pgSslMode('postgres://u:p@host:5432/db')).toBeNull();
    expect(pgSslMode('postgres://u:p@host:5432/db?sslmode=disable')).toBeNull();
  });

  it('returns "require" for require/prefer/allow (encrypt, no verify)', () => {
    expect(pgSslMode('postgres://u:p@host/db?sslmode=require')).toBe('require');
    expect(pgSslMode('postgres://u:p@host/db?sslmode=prefer')).toBe('require');
  });

  it('returns "verify" for verify-ca/verify-full', () => {
    expect(pgSslMode('postgres://u:p@host/db?sslmode=verify-ca')).toBe('verify');
    expect(pgSslMode('postgres://u:p@host/db?sslmode=verify-full')).toBe('verify');
  });

  it('returns null for an unparseable url', () => {
    expect(pgSslMode('not a url')).toBeNull();
  });
});

describe('resolveSqlitePath', () => {
  it('passes :memory: through untouched', () => {
    expect(resolveSqlitePath(':memory:')).toBe(':memory:');
  });

  it('passes absolute paths through untouched', () => {
    expect(resolveSqlitePath('/tmp/x.db')).toBe('/tmp/x.db');
    expect(resolveSqlitePath('file:/tmp/x.db')).toBe('/tmp/x.db');
  });

  it('resolves relative paths against the workspace root, not the cwd', () => {
    // Vitest runs from the repo root, which is the workspace root.
    const expected = resolve(process.cwd(), 'data/sovereign.db');
    expect(resolveSqlitePath('file:./data/sovereign.db')).toBe(expected);
    expect(resolveSqlitePath('./data/sovereign.db')).toBe(expected);
  });

  it('always returns an absolute path for file-backed databases', () => {
    expect(isAbsolute(resolveSqlitePath('file:./anywhere.db'))).toBe(true);
  });
});

describe('createClient', () => {
  it('opens an in-memory SQLite database with pragmas and tags the dialect', () => {
    const client = createClient({ url: ':memory:' });
    expect(client.dialect).toBe('sqlite');
    if (client.dialect !== 'sqlite') throw new Error('expected sqlite');
    const row = client.db.get<{ foreign_keys: number }>(sql`PRAGMA foreign_keys`);
    expect(row?.foreign_keys).toBe(1);
  });

  it('constructs a Postgres client (lazy pool) without connecting', () => {
    // node-postgres connects lazily, so building the client must not throw even
    // with an unreachable host — the first query would be what connects.
    const client = createClient({ dialect: 'postgres', url: 'postgres://u:p@127.0.0.1:1/db' });
    expect(client.dialect).toBe('postgres');
  });
});
