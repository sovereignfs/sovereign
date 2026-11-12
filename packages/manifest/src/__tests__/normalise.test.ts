import { describe, expect, it } from 'vitest';
import { normalise, secretsOf, variablePrefix } from '../normalise';
import { manifest2Of, manifestOf } from './helpers';

describe('normalise', () => {
  it('says what a manifest 1 means: a lower-case name, the variable prefix, and each secret’s size', () => {
    expect(normalise(manifestOf())).toEqual({
      version: 1,
      prefix: 'notes',
      variablePrefix: 'NOTES',
      name: 'Notes',
      description: 'Notes for the whole household',
      port: 3000,
      health: '/api/health',
      launch: '/',
      signIn: manifestOf().signIn,
      database: { enabled: true, pooling: 'transaction' },
      generate: [{ name: 'NOTES_AUTH_SECRET', bytes: 48 }],
      data: [],
      storage: false,
      core: '>=0.49.0 <1.0.0',
    });
  });

  it('fills in what a manifest leaves out', () => {
    const bare = normalise(
      manifestOf({
        launch: undefined,
        description: undefined,
        database: undefined,
        generate: undefined,
      }),
    );
    expect(bare.launch).toBe('/');
    expect(bare.database).toEqual({ enabled: false });
    expect(bare.generate).toEqual([]);
    expect(bare).not.toHaveProperty('description');
  });

  it.each([
    [true, true],
    [false, false],
    [{}, true],
    [undefined, false],
  ])('reads the database %j as enabled: %s, with no pooling', (database, enabled) => {
    expect(normalise(manifestOf({ database })).database).toEqual({ enabled });
  });
});

describe('normalise, manifest 2', () => {
  it('says what a manifest 2 means, with its secrets’ sizes and the name it is given by default', () => {
    expect(normalise(manifest2Of())).toEqual({
      version: 2,
      prefix: 'fjord',
      variablePrefix: 'FJORD',
      defaultName: 'fjord',
      name: 'Fjord',
      port: 3000,
      health: '/api/health',
      launch: '/',
      signIn: manifest2Of().signIn,
      database: { enabled: true },
      generate: [
        { name: 'FJORD_AUTH_SECRET', bytes: 48 },
        { name: 'FJORD_ENCRYPTION_KEY', bytes: 32 },
      ],
      data: [],
      storage: false,
      core: '>=0.57.0 <1.0.0',
    });
  });

  it('has no sign-in and no core range for an app that signs nobody in', () => {
    const kiosk = normalise({
      manifest: 2,
      prefix: 'kiosk',
      name: 'Kiosk',
      port: 80,
      health: '/h',
    });
    expect(kiosk).not.toHaveProperty('signIn');
    expect(kiosk).not.toHaveProperty('core');
    expect(kiosk.generate).toEqual([]);
  });

  it('gives a manifest 1 no default name, since it cannot be hosted without one', () => {
    expect(normalise(manifestOf())).not.toHaveProperty('defaultName');
  });

  it('gives the same variable prefix and secrets whichever way they are written', () => {
    expect(variablePrefix({ prefix: 'NOTES' })).toBe('NOTES');
    expect(variablePrefix({ prefix: 'notes' })).toBe('NOTES');
    expect(secretsOf({ generate: ['A_B', { name: 'A_C' }, { name: 'A_D', bytes: 16 }] })).toEqual([
      { name: 'A_B', bytes: 48 },
      { name: 'A_C', bytes: 48 },
      { name: 'A_D', bytes: 16 },
    ]);
    expect(secretsOf({})).toEqual([]);
  });

  it('says whether an app keeps files, which only a manifest 3 can', () => {
    expect(normalise({ ...manifest2Of(), manifest: 3, storage: true } as never).storage).toBe(true);
    expect(normalise({ ...manifest2Of(), manifest: 3 } as never).storage).toBe(false);
    expect(normalise({ ...manifest2Of(), manifest: 3, storage: true } as never).defaultName).toBe(
      'fjord',
    );
  });
});
