import { afterEach, describe, expect, it } from 'vitest';
import {
  VaultConfigurationError,
  decryptSecretValue,
  encryptSecretValue,
  metadataToJson,
  vaultKeyFromEnv,
} from '../secrets';

const previousKey = process.env.SOVEREIGN_VAULT_KEY;

afterEach(() => {
  if (previousKey === undefined) {
    Reflect.deleteProperty(process.env, 'SOVEREIGN_VAULT_KEY');
  } else {
    process.env.SOVEREIGN_VAULT_KEY = previousKey;
  }
});

describe('plugin secret vault crypto', () => {
  it('fails closed when SOVEREIGN_VAULT_KEY is not configured', () => {
    Reflect.deleteProperty(process.env, 'SOVEREIGN_VAULT_KEY');
    expect(() => vaultKeyFromEnv()).toThrow(VaultConfigurationError);
  });

  it('round-trips values and binds ciphertext to tenant/plugin/scope/user aad', () => {
    process.env.SOVEREIGN_VAULT_KEY = Buffer.alloc(32, 7).toString('base64');
    const context = {
      tenantId: 'default',
      pluginId: 'com.example.notes',
      scope: 'user' as const,
      userId: 'u1',
    };
    const encrypted = encryptSecretValue('refresh-token', context);
    expect(encrypted).not.toContain('refresh-token');
    expect(decryptSecretValue(encrypted, context)).toBe('refresh-token');
    expect(() => decryptSecretValue(encrypted, { ...context, userId: 'u2' })).toThrow();
  });

  it('serializes metadata but rejects oversized metadata', () => {
    expect(metadataToJson({ provider: 'example' })).toBe('{"provider":"example"}');
    expect(() => metadataToJson({ value: 'x'.repeat(9000) })).toThrow(/8 KiB/);
  });
});
