import { describe, expect, it } from 'vitest';
import { normalise } from '../normalise';
import { manifestOf } from './helpers';

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
