import { afterEach, describe, expect, it } from 'vitest';
import { VaultConfigurationError, decryptValue, encryptValue } from '../crypto-envelope';

const previousKey = process.env.SOVEREIGN_VAULT_KEY;

afterEach(() => {
  if (previousKey === undefined) {
    Reflect.deleteProperty(process.env, 'SOVEREIGN_VAULT_KEY');
  } else {
    process.env.SOVEREIGN_VAULT_KEY = previousKey;
  }
});

describe('SMTP settings crypto envelope', () => {
  it('fails closed when SOVEREIGN_VAULT_KEY is not configured', () => {
    Reflect.deleteProperty(process.env, 'SOVEREIGN_VAULT_KEY');
    expect(() => encryptValue('hunter2')).toThrow(VaultConfigurationError);
  });

  it('round-trips a value', () => {
    process.env.SOVEREIGN_VAULT_KEY = Buffer.alloc(32, 7).toString('base64');
    const encrypted = encryptValue('smtp-password-123');
    expect(encrypted).not.toContain('smtp-password-123');
    expect(encrypted.startsWith('sv1:')).toBe(true);
    expect(decryptValue(encrypted)).toBe('smtp-password-123');
  });

  it('detects tampering via the GCM auth tag', () => {
    process.env.SOVEREIGN_VAULT_KEY = Buffer.alloc(32, 7).toString('base64');
    const encrypted = encryptValue('smtp-password-123');
    const [version, iv, tag, ciphertext] = encrypted.split(':');
    const tampered = [version, iv, tag, `${ciphertext}x`].join(':');
    expect(() => decryptValue(tampered)).toThrow();
  });

  it('rejects an envelope with an unsupported version', () => {
    process.env.SOVEREIGN_VAULT_KEY = Buffer.alloc(32, 7).toString('base64');
    expect(() => decryptValue('sv2:a:b:c')).toThrow(/envelope/);
  });
});
