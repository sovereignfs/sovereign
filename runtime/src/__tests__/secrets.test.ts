import { afterEach, describe, expect, it } from 'vitest';
import {
  SecretUndecryptableError,
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
    expect(() => decryptSecretValue(encrypted, { ...context, userId: 'u2' })).toThrow(
      SecretUndecryptableError,
    );
  });

  it('throws a typed SecretUndecryptableError when the vault key has changed', () => {
    const context = {
      tenantId: 'default',
      pluginId: 'fs.sovereign.warden',
      scope: 'user' as const,
      userId: 'u1',
    };
    process.env.SOVEREIGN_VAULT_KEY = Buffer.alloc(32, 1).toString('base64');
    const encrypted = encryptSecretValue('sk-provider-key', context);

    // Same row, read back by a checkout configured with a different key —
    // the "lost key" trap two clones sharing one dev database fall into.
    process.env.SOVEREIGN_VAULT_KEY = Buffer.alloc(32, 2).toString('base64');
    let caught: unknown;
    try {
      decryptSecretValue(encrypted, context);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(SecretUndecryptableError);
    expect((caught as Error).name).toBe('SecretUndecryptableError');
    expect((caught as Error).message).toMatch(/SOVEREIGN_VAULT_KEY/);
    // The raw crypto error is kept as the cause for diagnostics.
    expect(((caught as Error).cause as Error).message).toMatch(/unable to authenticate/);
  });

  it('keeps a malformed envelope and a missing key as their own error classes', () => {
    process.env.SOVEREIGN_VAULT_KEY = Buffer.alloc(32, 1).toString('base64');
    const context = { tenantId: 'default', pluginId: 'p', scope: 'plugin' as const, userId: null };
    expect(() => decryptSecretValue('garbage', context)).toThrow(
      /Unsupported plugin secret ciphertext envelope/,
    );
    expect(() => decryptSecretValue('garbage', context)).not.toThrow(SecretUndecryptableError);

    const encrypted = encryptSecretValue('v', context);
    Reflect.deleteProperty(process.env, 'SOVEREIGN_VAULT_KEY');
    expect(() => decryptSecretValue(encrypted, context)).toThrow(VaultConfigurationError);
  });

  it('serializes metadata but rejects oversized metadata', () => {
    expect(metadataToJson({ provider: 'example' })).toBe('{"provider":"example"}');
    expect(() => metadataToJson({ value: 'x'.repeat(9000) })).toThrow(/8 KiB/);
  });
});
