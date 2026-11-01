import { describe, expect, it, vi } from 'vitest';
import { ConfigurationError, createSovereign } from '../index';

const env = {
  NOTES_URL: 'https://notes.sovereign.local',
  NOTES_CORE_URL: 'https://core.sovereign.local',
  NOTES_CORE_CLIENT_ID: 'notes-app',
  NOTES_CORE_CLIENT_SECRET: 'a-very-secret-value',
};

const failure = (run: () => unknown): ConfigurationError => {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(ConfigurationError);
    return error as ConfigurationError;
  }
  throw new Error('it did not throw');
};

describe('creating the client (sdk §2)', () => {
  it('reads the four variables of the app’s prefix, and makes no network call', () => {
    const fetch = vi.fn();
    expect(() => createSovereign({ prefix: 'NOTES', env, fetch })).not.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('reads a secret from its _FILE form', () => {
    const { NOTES_CORE_CLIENT_SECRET: _secret, ...rest } = env;
    const readFile = vi.fn(() => 'from-a-file');
    createSovereign({
      prefix: 'NOTES',
      env: { ...rest, NOTES_CORE_CLIENT_SECRET_FILE: '/run/secrets/core' },
      readFile,
    });
    expect(readFile).toHaveBeenCalledWith('/run/secrets/core');
  });

  it('takes the four values one by one, for an app with other names', () => {
    expect(() =>
      createSovereign({
        appUrl: 'https://notes.sovereign.local',
        coreUrl: 'https://core.sovereign.local',
        clientId: 'notes-app',
        clientSecret: 'secret',
      }),
    ).not.toThrow();
  });

  it('names every variable that is missing at once, and never a value', () => {
    const error = failure(() =>
      createSovereign({
        prefix: 'NOTES',
        env: { NOTES_CORE_URL: 'https://user:pw@core.sovereign.local/path' },
      }),
    );
    for (const name of [
      'NOTES_URL',
      'NOTES_CORE_URL',
      'NOTES_CORE_CLIENT_ID',
      'NOTES_CORE_CLIENT_SECRET',
    ]) {
      expect(error.message).toContain(name);
    }
    expect(error.message).not.toContain('pw@');
  });

  it('refuses a core address with a path, and an address that is not http or https', () => {
    expect(
      failure(() =>
        createSovereign({
          prefix: 'NOTES',
          env: { ...env, NOTES_CORE_URL: 'https://core.sovereign.local/sub' },
        }),
      ).message,
    ).toContain('NOTES_CORE_URL');
    const error = failure(() =>
      createSovereign({
        appUrl: 'ftp://notes.sovereign.local',
        coreUrl: 'not an address',
        clientId: 'x',
        clientSecret: 'a-secret-that-must-not-appear',
      }),
    );
    expect(error.message).toContain('the app address');
    expect(error.message).toContain('the core address');
    expect(error.message).not.toContain('a-secret-that-must-not-appear');
  });

  it('names each option that is blank when they are given one by one, without echoing them', () => {
    const error = failure(() =>
      createSovereign({
        appUrl: '',
        coreUrl: 'https://core.sovereign.local',
        clientId: ' ',
        clientSecret: 'secret-xyz',
      }),
    );
    expect(error.message).toContain('appUrl');
    expect(error.message).toContain('clientId');
    expect(error.message).not.toContain('secret-xyz');
  });

  it('refuses a prefix that is not one', () => {
    expect(failure(() => createSovereign({ prefix: 'not a prefix', env })).message).toMatch(
      /prefix/,
    );
  });

  it('needs a token store to call as a person, and a sub', () => {
    const sv = createSovereign({ prefix: 'NOTES', env });
    expect(failure(() => sv.as({ sub: 'u1' })).message).toMatch(/token store/);
    const withStore = createSovereign({
      prefix: 'NOTES',
      env,
      tokenStore: { read: () => undefined, write: () => true },
    });
    expect(failure(() => withStore.as({ sub: '' })).message).toMatch(/sub/);
  });
});
