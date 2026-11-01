import { describe, expect, expectTypeOf, it } from 'vitest';
import { ConfigError, defineConfig, boolean, integer, list, oneOf, string, url } from '../index.js';

const load = <V extends Parameters<typeof defineConfig>[0]['variables']>(
  variables: V,
  env: Record<string, string>,
) => defineConfig({ prefix: 'T', variables }).load(env);

const problems = (fn: () => unknown): string[] => {
  try {
    fn();
  } catch (error) {
    if (error instanceof ConfigError)
      return error.problems.map((p) => `${p.variable}: ${p.message}`);
    throw error;
  }
  throw new Error('expected a ConfigError, but nothing was thrown');
};

describe('string', () => {
  it('reads a value, trimmed', () => {
    expect(load({ a: string({ name: 'A' }) }, { T_A: '  hello ' }).a).toBe('hello');
  });

  it('uses the default when unset, and undefined when optional with none', () => {
    expect(load({ a: string({ name: 'A', default: 'fallback' }) }, {}).a).toBe('fallback');
    expect(load({ a: string({ name: 'A' }) }, {}).a).toBeUndefined();
  });

  it('treats an empty or blank value as unset', () => {
    expect(load({ a: string({ name: 'A', default: 'd' }) }, { T_A: '' }).a).toBe('d');
    expect(load({ a: string({ name: 'A', default: 'd' }) }, { T_A: '   ' }).a).toBe('d');
  });

  it('is required when asked to be', () => {
    expect(problems(() => load({ a: string({ name: 'A', required: true }) }, {}))).toEqual([
      'T_A: is required but not set',
    ]);
  });
});

describe('boolean', () => {
  it('accepts exactly true and false', () => {
    expect(load({ b: boolean({ name: 'B' }) }, { T_B: 'true' }).b).toBe(true);
    expect(load({ b: boolean({ name: 'B' }) }, { T_B: 'false' }).b).toBe(false);
  });

  it.each(['1', '0', 'yes', 'no', 'TRUE', 'on'])('rejects %s rather than guess', (raw) => {
    expect(problems(() => load({ b: boolean({ name: 'B' }) }, { T_B: raw }))).toEqual([
      'T_B: must be true or false',
    ]);
  });

  it('defaults', () => {
    expect(load({ b: boolean({ name: 'B', default: true }) }, {}).b).toBe(true);
  });
});

describe('integer', () => {
  it('parses whole numbers', () => {
    expect(load({ n: integer({ name: 'N' }) }, { T_N: '42' }).n).toBe(42);
    expect(load({ n: integer({ name: 'N' }) }, { T_N: '-7' }).n).toBe(-7);
  });

  it.each(['4.2', '1e3', 'abc', '0x10', '12 3', '--1'])('rejects %s', (raw) => {
    expect(problems(() => load({ n: integer({ name: 'N' }) }, { T_N: raw }))).toEqual([
      'T_N: must be a whole number',
    ]);
  });

  it('enforces a range', () => {
    const variables = { n: integer({ name: 'N', min: 1, max: 10 }) };
    expect(load(variables, { T_N: '10' }).n).toBe(10);
    expect(problems(() => load(variables, { T_N: '0' }))).toEqual(['T_N: must be at least 1']);
    expect(problems(() => load(variables, { T_N: '11' }))).toEqual(['T_N: must be at most 10']);
  });

  it('rejects a number too large to be exact', () => {
    expect(
      problems(() => load({ n: integer({ name: 'N' }) }, { T_N: '9007199254740993' })),
    ).toEqual(['T_N: must be a whole number']);
  });
});

describe('oneOf', () => {
  const variables = { d: oneOf(['sqld', 'sqlite', 'postgres'], { name: 'D', required: true }) };

  it('accepts a listed value', () => {
    expect(load(variables, { T_D: 'sqlite' }).d).toBe('sqlite');
  });

  it('rejects anything else, listing the choices', () => {
    expect(problems(() => load(variables, { T_D: 'mysql' }))).toEqual([
      'T_D: must be one of: sqld, sqlite, postgres',
    ]);
    expect(problems(() => load(variables, { T_D: 'SQLITE' }))).toHaveLength(1);
  });
});

describe('list', () => {
  const variables = { l: list({ name: 'L' }) };

  it('splits on commas and trims each item', () => {
    expect(load(variables, { T_L: 'a, b ,c' }).l).toEqual(['a', 'b', 'c']);
  });

  it('rejects an empty item', () => {
    expect(problems(() => load(variables, { T_L: 'a,,c' }))).toEqual(['T_L: has an empty item']);
    expect(problems(() => load(variables, { T_L: 'a,' }))).toEqual(['T_L: has an empty item']);
  });

  it('defaults to the given list', () => {
    expect(load({ l: list({ name: 'L', default: ['x'] }) }, {}).l).toEqual(['x']);
  });
});

describe('url', () => {
  it('accepts http and https by default and trims a trailing slash', () => {
    expect(load({ u: url({ name: 'U' }) }, { T_U: 'https://sovereign.local/' }).u).toBe(
      'https://sovereign.local',
    );
    expect(load({ u: url({ name: 'U' }) }, { T_U: 'http://sqld:8080' }).u).toBe('http://sqld:8080');
  });

  it('trims a very long run of trailing slashes in linear time', () => {
    const raw = `https://sovereign.local/${'/'.repeat(100_000)}x/${'/'.repeat(100_000)}`;
    const started = performance.now();
    const value = load({ u: url({ name: 'U', required: true }) }, { T_U: raw }).u;
    expect(performance.now() - started).toBeLessThan(1000);
    expect(value.endsWith('x')).toBe(true);
  });

  it('keeps a path', () => {
    expect(load({ u: url({ name: 'U' }) }, { T_U: 'https://sovereign.local/api/auth/' }).u).toBe(
      'https://sovereign.local/api/auth',
    );
  });

  it('rejects text that is not an absolute URL', () => {
    for (const raw of ['not a url', '/relative', 'sovereign.local', 'http://']) {
      expect(problems(() => load({ u: url({ name: 'U' }) }, { T_U: raw }))).toEqual([
        'T_U: is not a valid URL',
      ]);
    }
  });

  it('restricts the scheme', () => {
    const variables = { u: url({ name: 'U', protocols: ['https:'] }) };
    expect(problems(() => load(variables, { T_U: 'http://sovereign.local' }))).toEqual([
      'T_U: must use https:',
    ]);
    expect(problems(() => load(variables, { T_U: 'ftp://sovereign.local' }))).toEqual([
      'T_U: must use https:',
    ]);
  });

  it('can require a bare origin, as the issuer needs', () => {
    const variables = { u: url({ name: 'U', origin: true }) };
    expect(load(variables, { T_U: 'https://core.sovereign.local/' }).u).toBe(
      'https://core.sovereign.local',
    );
    for (const raw of [
      'https://core.sovereign.local/api',
      'https://core.sovereign.local/?a=1',
      'https://core.sovereign.local/#x',
    ]) {
      expect(problems(() => load(variables, { T_U: raw }))).toEqual([
        'T_U: must be an address with no path, query or fragment',
      ]);
    }
  });

  it('does not echo the value, which could carry credentials', () => {
    const text = problems(() =>
      load({ u: url({ name: 'U' }) }, { T_U: 'postgres://user:hunter2@host:notaport/db' }),
    ).join(' ');
    expect(text).not.toContain('hunter2');
    expect(text).not.toContain('user');
  });
});

describe('inferred types', () => {
  it('make a required or defaulted value non-optional and an unset optional one possibly undefined', () => {
    const values = load(
      {
        required: string({ name: 'R', required: true }),
        defaulted: integer({ name: 'D', default: 1 }),
        optional: string({ name: 'O' }),
        flag: boolean({ name: 'F', default: false }),
        choice: oneOf(['a', 'b'], { name: 'C', required: true }),
        many: list({ name: 'M', default: [] }),
        address: url({ name: 'A', required: true }),
      },
      { T_R: 'x', T_C: 'a', T_A: 'https://a.example' },
    );
    expectTypeOf(values.required).toEqualTypeOf<string>();
    expectTypeOf(values.defaulted).toEqualTypeOf<number>();
    expectTypeOf(values.optional).toEqualTypeOf<string | undefined>();
    expectTypeOf(values.flag).toEqualTypeOf<boolean>();
    expectTypeOf(values.choice).toEqualTypeOf<'a' | 'b'>();
    expectTypeOf(values.many).toEqualTypeOf<string[]>();
    expectTypeOf(values.address).toEqualTypeOf<string>();
  });
});
