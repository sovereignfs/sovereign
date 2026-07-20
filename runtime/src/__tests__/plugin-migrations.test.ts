import { randomBytes } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { assertPluginEncryptionRequirement } from '../plugin-migrations';

const KEY_ENV = 'SOVEREIGN_DB_ENCRYPTION_KEY';

describe('assertPluginEncryptionRequirement (RFC 0071)', () => {
  afterEach(() => {
    Reflect.deleteProperty(process.env, KEY_ENV);
    vi.restoreAllMocks();
  });

  it('is a no-op when the plugin does not require encryption', () => {
    expect(() =>
      assertPluginEncryptionRequirement('fs.example.plugin', { isolation: 'isolated' }, 'sqlite'),
    ).not.toThrow();
  });

  it('throws, naming the plugin, when SQLite is required but no key is configured', () => {
    Reflect.deleteProperty(process.env, KEY_ENV);
    expect(() =>
      assertPluginEncryptionRequirement(
        'fs.example.healthlog',
        { isolation: 'isolated', requireEncryption: true },
        'sqlite',
      ),
    ).toThrow(/fs\.example\.healthlog/);
  });

  it('does not throw when SQLite is required and a key is configured', () => {
    process.env[KEY_ENV] = randomBytes(32).toString('base64');
    expect(() =>
      assertPluginEncryptionRequirement(
        'fs.example.healthlog',
        { isolation: 'isolated', requireEncryption: true },
        'sqlite',
      ),
    ).not.toThrow();
  });

  it('warns instead of throwing when Postgres is required — no SQLCipher equivalent there', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(() =>
      assertPluginEncryptionRequirement(
        'fs.example.healthlog',
        { isolation: 'isolated', requireEncryption: true },
        'postgres',
      ),
    ).not.toThrow();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain('fs.example.healthlog');
  });
});
