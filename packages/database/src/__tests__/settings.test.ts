import { ConfigError, defineConfig } from '@sovereignfs/config';
import { describe, expect, it } from 'vitest';
import { databaseVariables, resolveDatabase } from '../settings.js';

const config = defineConfig({ prefix: 'SV', variables: databaseVariables });
const settings = (env: Record<string, string>) => config.load(env);

function problems(env: Record<string, string>, required = true): string[] {
  try {
    resolveDatabase(settings(env), { prefix: 'SV', required });
  } catch (error) {
    if (error instanceof ConfigError)
      return error.problems.map((p) => `${p.variable} ${p.message}`);
    throw error;
  }
  return [];
}

describe('resolveDatabase', () => {
  it('resolves sqld with its address, admin address and namespace', () => {
    expect(
      resolveDatabase(
        settings({
          SV_DB_DIALECT: 'sqld',
          SV_SQLD_URL: 'http://sqld:8080/',
          SV_SQLD_ADMIN_URL: 'http://sqld:8081',
          SV_SQLD_NAMESPACE: 'core',
        }),
        { prefix: 'SV', required: true },
      ),
    ).toEqual({
      dialect: 'sqld',
      url: 'http://sqld:8080',
      adminUrl: 'http://sqld:8081',
      namespace: 'core',
    });
  });

  it('uses the default namespace when none is set', () => {
    const resolved = resolveDatabase(
      settings({ SV_DB_DIALECT: 'sqld', SV_SQLD_URL: 'http://sqld:8080' }),
      {
        prefix: 'SV',
        required: true,
      },
    );
    expect(resolved).toMatchObject({ namespace: 'default', adminUrl: undefined });
  });

  it('resolves a SQLite file from a file: URL', () => {
    expect(
      resolveDatabase(settings({ SV_DB_DIALECT: 'sqlite', SV_SQLITE_URL: 'file:./data/core.db' }), {
        prefix: 'SV',
        required: true,
      }),
    ).toEqual({ dialect: 'sqlite', url: 'file:./data/core.db', path: './data/core.db' });
  });

  it('resolves PostgreSQL with the address kept secret and the pool size', () => {
    const resolved = resolveDatabase(
      settings({
        SV_DB_DIALECT: 'postgres',
        SV_POSTGRES_URL: 'postgres://core:hunter2@db:5432/core',
        SV_POSTGRES_POOL_MAX: '4',
      }),
      { prefix: 'SV', required: true },
    );
    expect(resolved.dialect).toBe('postgres');
    if (resolved.dialect !== 'postgres') return;
    expect(resolved.poolMax).toBe(4);
    expect(resolved.url.reveal()).toBe('postgres://core:hunter2@db:5432/core');
    expect(JSON.stringify(resolved)).not.toContain('hunter2');
  });

  it('is undefined when no dialect is set and the database is not required', () => {
    expect(resolveDatabase(settings({}), { prefix: 'SV' })).toBeUndefined();
  });

  it('names the dialect variable when it is required and not set', () => {
    expect(problems({})).toEqual([
      'SV_DB_DIALECT is required but not set (one of: sqld, sqlite, postgres)',
    ]);
  });

  it('rejects a dialect nothing supports', () => {
    expect(problems({ SV_DB_DIALECT: 'mysql' })).toEqual([
      'SV_DB_DIALECT must be one of: sqld, sqlite, postgres',
    ]);
  });

  it.each([
    ['sqld', { SV_DB_DIALECT: 'sqld' }, ['SV_SQLD_URL is required when DB_DIALECT is sqld']],
    [
      'sqlite',
      { SV_DB_DIALECT: 'sqlite' },
      ['SV_SQLITE_URL is required when DB_DIALECT is sqlite'],
    ],
    [
      'postgres',
      { SV_DB_DIALECT: 'postgres' },
      ['SV_POSTGRES_URL is required when DB_DIALECT is postgres (or set POSTGRES_URL_FILE)'],
    ],
  ])('says what a %s database needs', (_name, env, expected) => {
    expect(problems(env)).toEqual(expected);
  });

  it('does not guess a dialect from a URL, and refuses a URL that does not fit', () => {
    expect(problems({ SV_SQLD_URL: 'http://sqld:8080' })).toEqual([
      'SV_DB_DIALECT is required but not set (one of: sqld, sqlite, postgres)',
    ]);
    expect(problems({ SV_DB_DIALECT: 'sqlite', SV_SQLITE_URL: './data/core.db' })).toEqual([
      'SV_SQLITE_URL must be a file: URL, such as file:./data/core.db',
    ]);
    expect(problems({ SV_DB_DIALECT: 'sqld', SV_SQLD_URL: 'postgres://db/core' })).toEqual([
      'SV_SQLD_URL must use http: or https:',
    ]);
    expect(problems({ SV_DB_DIALECT: 'postgres', SV_POSTGRES_URL: 'http://db/core' })).toEqual([
      'SV_POSTGRES_URL must use postgres: or postgresql:',
    ]);
  });

  it('refuses a namespace sqld or a URL would not take', () => {
    for (const namespace of ['Core', '1core', 'my-core', 'a'.repeat(64), 'a/b']) {
      expect(
        problems({
          SV_DB_DIALECT: 'sqld',
          SV_SQLD_URL: 'http://sqld:8080',
          SV_SQLD_NAMESPACE: namespace,
        }),
      ).toEqual([
        'SV_SQLD_NAMESPACE must be lower-case letters, digits and underscores, starting with a letter, at most 63 characters',
      ]);
    }
  });

  it('never shows the PostgreSQL password when it refuses the address', () => {
    const text = problems({
      SV_DB_DIALECT: 'postgres',
      SV_POSTGRES_URL: 'mysql://core:hunter2@db/core',
    }).join(' ');
    expect(text).not.toContain('hunter2');
  });

  it('reports every problem at once', () => {
    expect(problems({ SV_DB_DIALECT: 'sqld', SV_SQLD_NAMESPACE: 'Bad' })).toHaveLength(2);
  });
});
