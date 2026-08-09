import { describe, expect, it } from 'vitest';
import { assertAuthDialectMatchesPlatform, sqliteParams, toPgPlaceholders } from '../db';

describe('toPgPlaceholders', () => {
  it('rewrites ? to $1, $2, … in order', () => {
    expect(toPgPlaceholders('SELECT * FROM t WHERE a = ? AND b = ?')).toBe(
      'SELECT * FROM t WHERE a = $1 AND b = $2',
    );
  });

  it('leaves a parameterless query unchanged', () => {
    expect(toPgPlaceholders('SELECT 1')).toBe('SELECT 1');
  });

  it('numbers every placeholder, including repeats', () => {
    expect(toPgPlaceholders('VALUES (?, ?, ?)')).toBe('VALUES ($1, $2, $3)');
  });
});

describe('sqliteParams', () => {
  it('maps booleans to 1/0 (better-sqlite3 cannot bind booleans)', () => {
    expect(sqliteParams([true, false])).toEqual([1, 0]);
  });

  it('leaves non-boolean params untouched', () => {
    expect(sqliteParams(['x', 5, null, undefined])).toEqual(['x', 5, null, undefined]);
  });
});

describe('assertAuthDialectMatchesPlatform', () => {
  it('allows sqlite auth on a platform with no DB_DIALECT/DATABASE_URL set (both default to sqlite)', () => {
    expect(() => assertAuthDialectMatchesPlatform('file:./data/auth.db', {})).not.toThrow();
  });

  it('allows postgres auth when DB_DIALECT=postgres', () => {
    expect(() =>
      assertAuthDialectMatchesPlatform('postgres://u:p@host/db', { DB_DIALECT: 'postgres' }),
    ).not.toThrow();
  });

  it('allows postgres auth when DB_DIALECT is unset but DATABASE_URL infers postgres', () => {
    expect(() =>
      assertAuthDialectMatchesPlatform('postgres://u:p@host/auth', {
        DATABASE_URL: 'postgres://u:p@host/sovereign',
      }),
    ).not.toThrow();
  });

  it('throws when the platform is postgres but AUTH_DATABASE_URL was left on the sqlite default', () => {
    // The exact gap this exists to close: DB_DIALECT=postgres is set, but
    // AUTH_DATABASE_URL was never pointed at Postgres, so it's still the
    // sqlite default — this used to silently diverge.
    expect(() =>
      assertAuthDialectMatchesPlatform('file:./data/auth.db', { DB_DIALECT: 'postgres' }),
    ).toThrow(/Dialect mismatch/);
  });

  it('throws when the platform is sqlite (default) but AUTH_DATABASE_URL points at postgres', () => {
    expect(() => assertAuthDialectMatchesPlatform('postgres://u:p@host/db', {})).toThrow(
      /Dialect mismatch/,
    );
  });

  it('never throws for :memory: regardless of the platform dialect', () => {
    expect(() =>
      assertAuthDialectMatchesPlatform(':memory:', { DB_DIALECT: 'postgres' }),
    ).not.toThrow();
  });
});
