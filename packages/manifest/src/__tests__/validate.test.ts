import { describe, expect, it } from 'vitest';
import { validate } from '../validate';
import { manifest2Of, manifestOf } from './helpers';

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

describe('validate, manifest 2', () => {
  it('accepts a manifest 2, and returns it as it is', () => {
    const manifest = manifest2Of();
    expect(validate(manifest)).toEqual({ ok: true, manifest });
  });

  it('accepts an app that signs nobody in through core, with no core range', () => {
    const kiosk = { manifest: 2, prefix: 'kiosk', name: 'Kiosk', port: 3000, health: '/h' };
    expect(validate(kiosk).ok).toBe(true);
    expect(validate({ ...kiosk, database: true, data: ['/data'], core: '>=0.57.0' }).ok).toBe(true);
  });

  it('needs a core range when it signs people in, and refuses a launcher entry when it does not', () => {
    const { core: _core, ...withoutCore } = manifest2Of() as unknown as Record<string, unknown>;
    expect(problemsOf(withoutCore)).toEqual([
      { at: '(top level)', message: "must have required property 'core'" },
    ]);
    const { signIn: _signIn, ...withoutSignIn } = manifest2Of() as unknown as Record<
      string,
      unknown
    >;
    expect(validate({ ...withoutSignIn, icon: '/icon.svg' }).ok).toBe(false);
    expect(validate({ ...withoutSignIn, launch: '/' }).ok).toBe(false);
  });

  it.each([
    ['upper case', 'FJORD'],
    ['a hyphen', 'my-fjord'],
    ['a digit first', '2fjord'],
    ['core’s own', 'sv'],
  ])('refuses a prefix of %s', (_name, prefix) => {
    expect(validate(manifest2Of({ prefix })).ok).toBe(false);
  });

  it('takes secrets as names or as names with a size from 16 to 64 bytes', () => {
    expect(validate(manifest2Of({ generate: ['FJORD_A', { name: 'FJORD_B' }] })).ok).toBe(true);
    for (const bytes of [8, 15, 65, 32.5, '32']) {
      expect(
        validate(manifest2Of({ generate: [{ name: 'FJORD_A', bytes }] })).ok,
        String(bytes),
      ).toBe(false);
    }
    expect(validate(manifest2Of({ generate: [{ name: 'FJORD_A', size: 32 }] })).ok).toBe(false);
  });

  it('wants each secret’s name to begin with the prefix in upper case, and to be named once, in either form', () => {
    expect(problemsOf(manifest2Of({ generate: [{ name: 'OTHER_KEY', bytes: 32 }] }))).toEqual([
      { at: 'generate.0', message: 'must begin with FJORD_, the app’s prefix' },
    ]);
    expect(
      problemsOf(manifest2Of({ generate: ['FJORD_A', { name: 'FJORD_A', bytes: 32 }] })),
    ).toEqual([{ at: 'generate.1', message: 'is named twice' }]);
  });

  it('is not a manifest 1: the same document says which it is', () => {
    expect(validate({ ...manifest2Of(), manifest: 1 }).ok).toBe(false);
    expect(validate({ ...manifestOf(), manifest: 2 }).ok).toBe(false);
  });
});

describe('manifest 3', () => {
  const manifest3Of = (change: Record<string, unknown> = {}) => ({
    ...manifest2Of(),
    manifest: 3,
    storage: true,
    ...change,
  });

  it('accepts storage, and only from version 3', () => {
    expect(problemsOf(manifest3Of())).toEqual([]);
    expect(problemsOf(manifest3Of({ storage: false }))).toEqual([]);
    expect(validate({ ...manifest2Of(), storage: true }).ok).toBe(false);
    expect(JSON.stringify(problemsOf(manifest3Of({ storage: 'yes' })))).toContain('storage');
  });

  it('keeps a data path away from where the files are mounted, and leaves the signing key to the instance', () => {
    expect(problemsOf(manifest3Of({ data: ['/data/s3/fjord'] }))[0]?.at).toBe('data.0');
    expect(problemsOf(manifest3Of({ data: ['/data/s3'] }))[0]?.at).toBe('data.0');
    expect(problemsOf(manifest3Of({ data: ['/data'] }))).toEqual([]);
    expect(problemsOf(manifest3Of({ data: ['/var/lib/fjord'] }))).toEqual([]);
    expect(problemsOf(manifest3Of({ storage: false, data: ['/data'] }))).toEqual([]);
    expect(
      problemsOf(manifest3Of({ generate: ['FJORD_STORAGE_SIGNING_KEY'] }))[0]?.message,
    ).toContain('made by the instance');
  });
});
