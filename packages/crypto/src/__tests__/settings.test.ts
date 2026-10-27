import { randomBytes } from 'node:crypto';
import { ConfigError, defineConfig } from '@sovereignfs/config';
import { describe, expect, it } from 'vitest';
import { fieldEncryptionVariables, resolveFieldEncryption } from '../index.js';

const config = defineConfig({ prefix: 'SV', variables: fieldEncryptionVariables });
const key = () => randomBytes(32).toString('base64');

function problems(env: Record<string, string>, required: boolean): string[] {
  try {
    resolveFieldEncryption(config.load(env), { prefix: 'SV', required });
  } catch (error) {
    if (error instanceof ConfigError)
      return error.problems.map((p) => `${p.variable} ${p.message}`);
    throw error;
  }
  return [];
}

describe('resolveFieldEncryption', () => {
  it('makes a cipher from the key ring', () => {
    const cipher = resolveFieldEncryption(
      config.load({ SV_FIELD_ENCRYPTION_KEYS: `k2:${key()},k1:${key()}` }),
      {
        prefix: 'SV',
        required: true,
      },
    );
    expect(cipher.currentKeyId).toBe('k2');
    expect(cipher.decrypt(cipher.encrypt('x', 'a.b'), 'a.b')).toBe('x');
  });

  it('reads the ring from a file too', () => {
    const cipher = resolveFieldEncryption(
      config.load(
        { SV_FIELD_ENCRYPTION_KEYS_FILE: '/run/secrets/keys' },
        { readFile: () => `k1:${key()}\n` },
      ),
      { prefix: 'SV', required: true },
    );
    expect(cipher.currentKeyId).toBe('k1');
  });

  it('is undefined when there is no ring and none is required', () => {
    expect(resolveFieldEncryption(config.load({}), { prefix: 'SV' })).toBeUndefined();
  });

  it('names the variable, and its file form, when a ring is required and missing', () => {
    expect(problems({}, true)).toEqual([
      'SV_FIELD_ENCRYPTION_KEYS is required but not set (or set SV_FIELD_ENCRYPTION_KEYS_FILE)',
    ]);
  });

  it('refuses a ring that is set but wrong, even when none is required', () => {
    expect(problems({ SV_FIELD_ENCRYPTION_KEYS: 'k1:tooshort' }, false)).toEqual([
      'SV_FIELD_ENCRYPTION_KEYS entry 1 has a key that is not 32 bytes',
    ]);
  });

  it('reports every problem in the ring at once, without showing a key', () => {
    const real = key();
    const found = problems({ SV_FIELD_ENCRYPTION_KEYS: `bad,K2:${real},k3:short` }, true);
    expect(found).toHaveLength(3);
    expect(found.join(' ')).not.toContain(real);
  });
});
