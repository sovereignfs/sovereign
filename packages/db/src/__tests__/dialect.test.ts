import { describe, expect, it } from 'vitest';
import { resolveDialect } from '../dialect';

describe('resolveDialect', () => {
  it('defaults to sqlite with the local file URL when nothing is configured', () => {
    const resolved = resolveDialect({});
    expect(resolved.dialect).toBe('sqlite');
    expect(resolved.url).toBe('file:./data/sovereign.db');
  });

  it('infers postgres from a postgres:// DATABASE_URL', () => {
    const resolved = resolveDialect({ DATABASE_URL: 'postgres://u:p@host:5432/db' });
    expect(resolved.dialect).toBe('postgres');
    expect(resolved.url).toBe('postgres://u:p@host:5432/db');
  });

  it('infers postgres from a postgresql:// DATABASE_URL', () => {
    const resolved = resolveDialect({ DATABASE_URL: 'postgresql://u:p@host:5432/db' });
    expect(resolved.dialect).toBe('postgres');
  });

  it('treats a plain file URL as sqlite', () => {
    const resolved = resolveDialect({ DATABASE_URL: 'file:./custom.db' });
    expect(resolved.dialect).toBe('sqlite');
    expect(resolved.url).toBe('file:./custom.db');
  });

  it('lets an explicit DB_DIALECT win over URL inference', () => {
    const resolved = resolveDialect({
      DB_DIALECT: 'sqlite',
      DATABASE_URL: 'postgres://u:p@host/db',
    });
    expect(resolved.dialect).toBe('sqlite');
  });

  it('accepts DB_DIALECT case-insensitively', () => {
    expect(resolveDialect({ DB_DIALECT: 'SQLite' }).dialect).toBe('sqlite');
    expect(resolveDialect({ DB_DIALECT: 'Postgres' }).dialect).toBe('postgres');
  });

  it('throws on an unknown DB_DIALECT', () => {
    expect(() => resolveDialect({ DB_DIALECT: 'mysql' })).toThrow(/Invalid DB_DIALECT/);
  });
});
