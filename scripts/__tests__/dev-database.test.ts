import { describe, expect, it } from 'vitest';
import { chosenDialect, valueIn } from '../lib/dev-database';

describe('reading a value from an environment file', () => {
  it('finds it, with quotes, spaces, export and a trailing comment', () => {
    const text = [
      '# a comment',
      '',
      'OTHER=1',
      'export SV_DB_DIALECT = sqld # the default',
      "QUOTED='x y'",
    ].join('\n');
    expect(valueIn(text, 'SV_DB_DIALECT')).toBe('sqld');
    expect(valueIn(text, 'QUOTED')).toBe('x y');
    expect(valueIn('SV_DB_DIALECT="postgres"', 'SV_DB_DIALECT')).toBe('postgres');
  });

  it('says nothing for a value that is not there, is empty, or is only in a comment', () => {
    expect(valueIn('SV_DB_DIALECT=\n', 'SV_DB_DIALECT')).toBeUndefined();
    expect(valueIn('# SV_DB_DIALECT=sqld\n', 'SV_DB_DIALECT')).toBeUndefined();
    expect(valueIn('', 'SV_DB_DIALECT')).toBeUndefined();
    expect(valueIn('SV_DB_DIALECT_X=sqld', 'SV_DB_DIALECT')).toBeUndefined();
  });

  it('reads Windows line endings', () => {
    expect(valueIn('A=1\r\nSV_DB_DIALECT=sqlite\r\n', 'SV_DB_DIALECT')).toBe('sqlite');
  });
});

describe('the database development chooses', () => {
  it('is the process environment first, then .env.local, then .env', () => {
    const files = { local: 'SV_DB_DIALECT=sqlite', env: 'SV_DB_DIALECT=sqld' };
    expect(chosenDialect({ SV_DB_DIALECT: 'postgres' }, files)).toBe('postgres');
    expect(chosenDialect({}, files)).toBe('sqlite');
    expect(chosenDialect({}, { env: 'SV_DB_DIALECT=sqld' })).toBe('sqld');
    expect(chosenDialect({}, { local: '# nothing', env: 'SV_DB_DIALECT=sqld' })).toBe('sqld');
  });

  it('is nothing when nothing says', () => {
    expect(chosenDialect({}, {})).toBeUndefined();
    expect(chosenDialect({ SV_DB_DIALECT: '' }, { env: 'SV_DB_DIALECT=' })).toBeUndefined();
  });
});
