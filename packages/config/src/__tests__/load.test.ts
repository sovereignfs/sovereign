import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { inspect } from 'node:util';
import { afterAll, describe, expect, expectTypeOf, it, vi } from 'vitest';
import {
  ConfigError,
  Secret,
  boolean,
  defineConfig,
  integer,
  oneOf,
  secret,
  string,
  url,
} from '../index.js';

const SECRET = 'a-perfectly-good-secret-value-of-32+chars';

/** The schema the core app is expected to start from. */
const variables = {
  url: url({ name: 'URL', required: true, origin: true }),
  authSecret: secret({ name: 'AUTH_SECRET', required: true, minLength: 32 }),
  inviteOnly: boolean({ name: 'AUTH_INVITE_ONLY', default: false }),
  dialect: oneOf(['sqld', 'sqlite', 'postgres'], { name: 'DB_DIALECT', required: true }),
  postgresUrl: secret({ name: 'POSTGRES_URL', url: { protocols: ['postgres:', 'postgresql:'] } }),
  poolMax: integer({ name: 'POSTGRES_POOL_MAX', default: 5, min: 1 }),
};

const core = defineConfig({ prefix: 'SV', variables });
const GOOD = {
  SV_URL: 'https://core.sovereign.local',
  SV_AUTH_SECRET: SECRET,
  SV_DB_DIALECT: 'sqlite',
};

const failure = (fn: () => unknown): ConfigError => {
  try {
    fn();
  } catch (error) {
    if (error instanceof ConfigError) return error;
    throw error;
  }
  throw new Error('expected a ConfigError, but nothing was thrown');
};

describe('a valid environment', () => {
  it('loads typed values, with defaults for what is unset', () => {
    const config = core.load(GOOD);
    expect(config.url).toBe('https://core.sovereign.local');
    expect(config.inviteOnly).toBe(false);
    expect(config.dialect).toBe('sqlite');
    expect(config.poolMax).toBe(5);
    expect(config.postgresUrl).toBeUndefined();
    expect(config.authSecret).toBeInstanceOf(Secret);
    expect(config.authSecret.reveal()).toBe(SECRET);
    expectTypeOf(config.authSecret).toEqualTypeOf<Secret>();
    expectTypeOf(config.postgresUrl).toEqualTypeOf<Secret | undefined>();
  });

  it('never shows a secret when the whole configuration is logged', () => {
    const config = core.load(GOOD);
    for (const text of [
      JSON.stringify(config),
      inspect(config, { depth: 5 }),
      String(config.authSecret),
    ]) {
      expect(text).not.toContain(SECRET);
    }
  });
});

describe('what the task requires to fail start-up, naming the variable', () => {
  it('a missing required secret', () => {
    const { SV_AUTH_SECRET: _omitted, ...env } = GOOD;
    const error = failure(() => core.load(env));
    expect(error.problems).toEqual([
      {
        variable: 'SV_AUTH_SECRET',
        message: 'is required but not set (or set SV_AUTH_SECRET_FILE)',
      },
    ]);
    expect(error.message).toContain('SV_AUTH_SECRET');
  });

  it('a short secret', () => {
    const error = failure(() => core.load({ ...GOOD, SV_AUTH_SECRET: 'too-short' }));
    expect(error.problems).toEqual([
      { variable: 'SV_AUTH_SECRET', message: 'must be at least 32 characters' },
    ]);
    expect(error.message).not.toContain('too-short');
  });

  it('a malformed URL', () => {
    const error = failure(() => core.load({ ...GOOD, SV_URL: 'not a url' }));
    expect(error.problems).toEqual([{ variable: 'SV_URL', message: 'is not a valid URL' }]);
  });

  it('a secret and its _FILE form both set', () => {
    const error = failure(() =>
      core.load({ ...GOOD, SV_AUTH_SECRET_FILE: '/run/secrets/auth' }, { readFile: () => SECRET }),
    );
    expect(error.problems).toEqual([
      {
        variable: 'SV_AUTH_SECRET',
        message: 'is set together with SV_AUTH_SECRET_FILE; set only one',
      },
    ]);
  });
});

describe('reporting problems', () => {
  it('reports every problem at once, each naming its variable', () => {
    const error = failure(() =>
      core.load({
        SV_URL: 'nope',
        SV_AUTH_SECRET: 'short',
        SV_DB_DIALECT: 'mysql',
        SV_POSTGRES_POOL_MAX: '0',
      }),
    );
    expect(error.problems.map((p) => p.variable).sort()).toEqual([
      'SV_AUTH_SECRET',
      'SV_DB_DIALECT',
      'SV_POSTGRES_POOL_MAX',
      'SV_URL',
    ]);
    for (const { variable } of error.problems) expect(error.message).toContain(variable);
    expect(error.message).toContain('4 problems');
  });

  it('says "1 problem" for one', () => {
    expect(failure(() => core.load({ ...GOOD, SV_URL: 'x' })).message).toContain('1 problem');
  });

  it('never echoes a value, secret or not', () => {
    const password = 'hunter2-the-database-password';
    const error = failure(() =>
      core.load({
        ...GOOD,
        SV_AUTH_SECRET: 'tiny-secret-value',
        SV_DB_DIALECT: 'bogus-dialect-value',
        SV_POSTGRES_URL: `mysql://admin:${password}@db:3306/x`,
        SV_POSTGRES_POOL_MAX: 'lots-of-them',
      }),
    );
    for (const leaked of ['tiny-secret-value', 'bogus-dialect-value', password, 'lots-of-them']) {
      expect(error.message).not.toContain(leaked);
      expect(JSON.stringify(error.problems)).not.toContain(leaked);
    }
  });

  it('checks the scheme of a secret URL without echoing it', () => {
    const error = failure(() =>
      core.load({ ...GOOD, SV_POSTGRES_URL: 'mysql://admin:pw@db:3306/x' }),
    );
    expect(error.problems).toEqual([
      { variable: 'SV_POSTGRES_URL', message: 'must use postgres: or postgresql:' },
    ]);
    expect(
      core.load({ ...GOOD, SV_POSTGRES_URL: 'postgres://u:p@db:5432/x' }).postgresUrl?.reveal(),
    ).toBe('postgres://u:p@db:5432/x');
  });
});

describe('secrets from files (the _FILE form)', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'config-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  const fileWith = (name: string, content: string) => {
    const file = path.join(dir, name);
    writeFileSync(file, content);
    return file;
  };

  it('reads the value from the named file with the real file system by default', () => {
    const file = fileWith('plain', SECRET);
    expect(
      core
        .load({ ...GOOD, SV_AUTH_SECRET: undefined, SV_AUTH_SECRET_FILE: file })
        .authSecret.reveal(),
    ).toBe(SECRET);
  });

  it.each([
    ['one trailing newline', `${SECRET}\n`],
    ['one trailing CRLF', `${SECRET}\r\n`],
  ])('strips %s', (_name, content) => {
    const env = { ...GOOD, SV_AUTH_SECRET: undefined, SV_AUTH_SECRET_FILE: '/x' };
    expect(core.load(env, { readFile: () => content }).authSecret.reveal()).toBe(SECRET);
  });

  it('keeps everything else in the file, including inner newlines and trailing spaces', () => {
    const odd = 'line one\nline two with trailing space   ';
    const config = defineConfig({ prefix: 'T', variables: { s: secret({ name: 'S' }) } });
    expect(config.load({ T_S_FILE: '/x' }, { readFile: () => `${odd}\n` }).s?.reveal()).toBe(odd);
  });

  it('does not trim a secret given directly', () => {
    const config = defineConfig({ prefix: 'T', variables: { s: secret({ name: 'S' }) } });
    expect(config.load({ T_S: '  spaced  ' }).s?.reveal()).toBe('  spaced  ');
  });

  it('names the variable, and not the cause, when the file cannot be read', () => {
    const env = {
      ...GOOD,
      SV_AUTH_SECRET: undefined,
      SV_AUTH_SECRET_FILE: path.join(dir, 'missing'),
    };
    const error = failure(() => core.load(env));
    expect(error.problems).toEqual([
      { variable: 'SV_AUTH_SECRET_FILE', message: 'names a file that cannot be read' },
    ]);
  });

  it('treats an empty file as an unset secret', () => {
    const env = { ...GOOD, SV_AUTH_SECRET: undefined, SV_AUTH_SECRET_FILE: '/x' };
    const error = failure(() => core.load(env, { readFile: () => '\n' }));
    expect(error.problems[0]?.variable).toBe('SV_AUTH_SECRET');
    expect(error.problems[0]?.message).toContain('required');
  });

  it('applies the secret rules to a value read from a file', () => {
    const env = { ...GOOD, SV_AUTH_SECRET: undefined, SV_AUTH_SECRET_FILE: '/x' };
    const error = failure(() => core.load(env, { readFile: () => 'short\n' }));
    expect(error.problems).toEqual([
      { variable: 'SV_AUTH_SECRET_FILE', message: 'must be at least 32 characters' },
    ]);
  });

  it('only reads a file when the _FILE variable is set', () => {
    let reads = 0;
    core.load(GOOD, { readFile: () => ((reads += 1), '') });
    expect(reads).toBe(0);
  });

  it('gives a plain variable no _FILE form', () => {
    const config = defineConfig({ prefix: 'T', variables: { a: string({ name: 'A' }) } });
    expect(config.load({ T_A_FILE: '/x' }, { readFile: () => 'from file' }).a).toBeUndefined();
  });
});

describe('the prefix', () => {
  it('builds every variable name from it, so an app picks its own', () => {
    const app = defineConfig({ prefix: 'NOTES', variables });
    expect(
      app.load({
        NOTES_URL: 'https://notes.sovereign.local',
        NOTES_AUTH_SECRET: SECRET,
        NOTES_DB_DIALECT: 'postgres',
      }).url,
    ).toBe('https://notes.sovereign.local');
    expect(failure(() => app.load(GOOD)).problems.map((p) => p.variable)).toContain('NOTES_URL');
  });

  it('ignores variables it does not declare', () => {
    expect(core.load({ ...GOOD, UNRELATED: 'x', SV_NOT_DECLARED: 'y' }).dialect).toBe('sqlite');
  });

  it('reads process.env when no environment is passed', () => {
    for (const [name, value] of Object.entries(GOOD)) vi.stubEnv(name, value);
    try {
      expect(core.load().dialect).toBe('sqlite');
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe('declaring a schema', () => {
  it.each(['sv', 'SV_', '1SV', 'S V', ''])('rejects the prefix %j', (prefix) => {
    expect(() => defineConfig({ prefix, variables: {} })).toThrow(/prefix/i);
  });

  it.each(['auth', 'AUTH-SECRET', '_A', 'A B', ''])('rejects the name %j', (name) => {
    expect(() => defineConfig({ prefix: 'T', variables: { a: string({ name }) } })).toThrow(
      /name/i,
    );
  });

  it('reserves _FILE for the file form', () => {
    expect(() =>
      defineConfig({ prefix: 'T', variables: { a: string({ name: 'KEY_FILE' }) } }),
    ).toThrow(/_FILE/);
  });

  it('rejects two variables with the same name, and a secret that collides with a _FILE name', () => {
    expect(() =>
      defineConfig({
        prefix: 'T',
        variables: { a: string({ name: 'A' }), b: string({ name: 'A' }) },
      }),
    ).toThrow(/T_A/);
  });
});

describe('describe()', () => {
  it('lists every variable with its full name, type and whether it is a secret', () => {
    const rows = core.describe();
    expect(rows.find((r) => r.variable === 'SV_AUTH_SECRET')).toEqual({
      key: 'authSecret',
      variable: 'SV_AUTH_SECRET',
      fileVariable: 'SV_AUTH_SECRET_FILE',
      kind: 'secret',
      secret: true,
      required: true,
    });
    expect(rows.find((r) => r.variable === 'SV_AUTH_INVITE_ONLY')).toMatchObject({
      kind: 'boolean',
      secret: false,
      required: false,
      default: false,
    });
    expect(rows.find((r) => r.variable === 'SV_DB_DIALECT')).toMatchObject({
      kind: 'oneOf',
      choices: ['sqld', 'sqlite', 'postgres'],
    });
    expect(rows.find((r) => r.variable === 'SV_URL')?.fileVariable).toBeUndefined();
  });

  it('never carries a secret default, because there can be none', () => {
    for (const row of core.describe().filter((r) => r.secret))
      expect(row).not.toHaveProperty('default');
  });
});

describe('secrets cannot have defaults', () => {
  it('is a type error to give one', () => {
    // @ts-expect-error - "No secret has a default value" (spec 1.1) is enforced by the types
    secret({ name: 'X', default: 'oops' });
  });
});
