import { describe, expect, it } from 'vitest';
import { resolveDialect } from '../dialect';

describe('resolveDialect', () => {
  it('throws when DB_DIALECT is unset', () => {
    expect(() => resolveDialect({})).toThrow(/DB_DIALECT is required/);
  });

  it('throws on an unknown DB_DIALECT', () => {
    expect(() => resolveDialect({ DB_DIALECT: 'mysql' })).toThrow(/DB_DIALECT is required/);
  });

  it('resolves sqlite with no url needed', () => {
    const resolved = resolveDialect({ DB_DIALECT: 'sqlite' });
    expect(resolved.dialect).toBe('sqlite');
  });

  it('accepts DB_DIALECT case-insensitively', () => {
    expect(resolveDialect({ DB_DIALECT: 'SQLite' }).dialect).toBe('sqlite');
    expect(
      resolveDialect({ DB_DIALECT: 'Postgres', POSTGRES_DB_URL: 'postgres://u:p@host/db' }).dialect,
    ).toBe('postgres');
  });

  it('resolves postgres from POSTGRES_DB_URL', () => {
    const resolved = resolveDialect({
      DB_DIALECT: 'postgres',
      POSTGRES_DB_URL: 'postgres://u:p@host:5432/db',
    });
    expect(resolved.dialect).toBe('postgres');
    expect(resolved.dialect === 'postgres' && resolved.url).toBe('postgres://u:p@host:5432/db');
  });

  it('throws when DB_DIALECT=postgres but POSTGRES_DB_URL is unset', () => {
    expect(() => resolveDialect({ DB_DIALECT: 'postgres' })).toThrow(/POSTGRES_DB_URL/);
  });
});
