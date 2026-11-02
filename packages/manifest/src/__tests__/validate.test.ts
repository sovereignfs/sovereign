import { describe, expect, it } from 'vitest';
import { validate } from '../validate';
import { manifestOf } from './helpers';

const problemsOf = (document: unknown) => {
  const result = validate(document);
  return result.ok ? [] : result.problems;
};

describe('validate', () => {
  it('accepts a manifest 1, and returns it as it is', () => {
    const manifest = manifestOf();
    const result = validate(manifest);
    expect(result).toEqual({ ok: true, manifest });
  });

  it.each([[true], [false], [{}], [{ pooling: 'transaction' }]])(
    'accepts the database %j',
    (database) => {
      expect(validate(manifestOf({ database })).ok).toBe(true);
    },
  );

  it.each([
    ['a pooling it does not know', { pooling: 'session' }, 'database'],
    ['a field of its own', { pooling: 'transaction', size: 5 }, 'size is not allowed'],
    ['a string', 'yes', 'database'],
  ])('refuses a database with %s', (_name, database, message) => {
    const problems = problemsOf(manifestOf({ database }));
    expect(problems.length).toBeGreaterThan(0);
    expect(JSON.stringify(problems)).toContain(message);
  });

  it('names a field it does not know, so a new one is never silently ignored', () => {
    expect(problemsOf(manifestOf({ extra: true }))).toContainEqual({
      at: '(top level)',
      message: 'must NOT have additional properties (extra is not allowed)',
    });
  });

  it('names every problem, each once, and where it is', () => {
    const problems = problemsOf(
      manifestOf({ port: 0, health: 'no-slash', signIn: { redirect: [], scopes: ['profile'] } }),
    );
    expect(problems.map((p) => p.at)).toEqual(
      expect.arrayContaining(['port', 'health', 'signIn.redirect', 'signIn.scopes']),
    );
    expect(new Set(problems.map((p) => `${p.at}|${p.message}`)).size).toBe(problems.length);
  });

  it('says what is wrong with core’s own prefix', () => {
    expect(problemsOf(manifestOf({ prefix: 'SV' }))).toEqual([
      { at: 'prefix', message: 'is core’s own prefix and cannot be used by an app' },
    ]);
  });

  it('holds an unknown or missing version to the newest schema, naming the field', () => {
    for (const manifest of [7, '1', undefined]) {
      expect(JSON.stringify(problemsOf({ ...manifestOf(), manifest }))).toContain('manifest');
    }
  });

  it.each([[null], [[]], ['text'], [42]])('refuses %j, which is not an object', (document) => {
    expect(validate(document).ok).toBe(false);
  });

  it('wants each secret it makes to begin with the app’s prefix, and to be named once', () => {
    expect(problemsOf(manifestOf({ generate: ['OTHER_SECRET'] }))).toEqual([
      { at: 'generate.0', message: 'must begin with NOTES_, the app’s prefix' },
    ]);
    expect(problemsOf(manifestOf({ generate: ['NOTES_A', 'NOTES_B', 'NOTES_A'] }))).toEqual([
      { at: 'generate', message: 'has the same item twice (at 0 and 2, counting from 0)' },
    ]);
  });
});
