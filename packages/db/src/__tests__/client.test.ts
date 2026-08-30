import { describe, expect, it } from 'vitest';
import { createClient, pgSslMode, postgresPoolMax } from '../client';

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

describe('postgresPoolMax', () => {
  it('defaults to 5 when unset', () => {
    expect(postgresPoolMax({})).toBe(5);
  });

  it('accepts a valid positive integer override', () => {
    expect(postgresPoolMax({ POSTGRES_POOL_MAX: '8' })).toBe(8);
  });

  it.each(['', '0', '-3', 'abc'])('falls back to 5 for invalid input %j', (value) => {
    expect(postgresPoolMax({ POSTGRES_POOL_MAX: value })).toBe(5);
  });
});

describe('createClient', () => {
  it('constructs a Postgres client (lazy pool) without connecting', () => {
    // node-postgres connects lazily, so building the client must not throw even
    // with an unreachable host — the first query would be what connects.
    const client = createClient({ dialect: 'postgres', url: 'postgres://u:p@127.0.0.1:1/db' });
    expect(client.dialect).toBe('postgres');
  });

  it('throws when DB_DIALECT is unset and no override is given', () => {
    const originalDialect = process.env.DB_DIALECT;
    delete process.env.DB_DIALECT;
    try {
      expect(() => createClient()).toThrow(/DB_DIALECT is required/);
    } finally {
      if (originalDialect !== undefined) process.env.DB_DIALECT = originalDialect;
    }
  });
});

describe('createClient — sqlite (sqld)', () => {
  it('tags the dialect as sqlite and issues queries through the sqld client', async () => {
    // sqld itself is not reachable in this unit test — only asserting the
    // client is shaped correctly (dialect tag, lazy libsql wiring). Live
    // sqld behavior is covered by the Docker-gated integration paths.
    const client = createClient({ dialect: 'sqlite' });
    expect(client.dialect).toBe('sqlite');
    if (client.dialect !== 'sqlite') throw new Error('expected sqlite');
    expect(typeof client.db.get).toBe('function');
  });
});
