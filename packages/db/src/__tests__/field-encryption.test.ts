import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  ENCRYPT_CLASSES_ENV,
  FIELD_KEK_ENV,
  FieldEncryptionConfigError,
  assertFieldEncryptionConfig,
  encryptClassesFromEnv,
  fieldKekFromEnv,
  kekFingerprint,
  unwrapKeyMaterial,
  wrapKeyMaterial,
} from '../field-encryption';

/**
 * Pure (no-DB) coverage for the field-encryption key primitives (RFC 0092,
 * epic task 8.31): KEK env decoding, the policy/key boot guard, and the
 * svfk1 key-wrap envelope's round-trip + tamper behavior. Row helpers are
 * covered live in field-encryption.pg.test.ts / field-encryption.sqld.test.ts.
 */

const KEY = randomBytes(32);

describe('fieldKekFromEnv', () => {
  it('returns undefined when unset — field encryption is opt-in', () => {
    expect(fieldKekFromEnv({})).toBeUndefined();
    expect(fieldKekFromEnv({ [FIELD_KEK_ENV]: '   ' })).toBeUndefined();
  });

  it('accepts base64, base64url, and 64-char hex encodings of 32 bytes', () => {
    for (const encoded of [
      KEY.toString('base64'),
      KEY.toString('base64url'),
      KEY.toString('hex'),
    ]) {
      expect(fieldKekFromEnv({ [FIELD_KEK_ENV]: encoded })).toEqual(KEY);
    }
  });

  it('fails fast on a malformed key rather than silently disabling encryption', () => {
    expect(() => fieldKekFromEnv({ [FIELD_KEK_ENV]: 'not-a-key' })).toThrow(
      FieldEncryptionConfigError,
    );
    expect(() => fieldKekFromEnv({ [FIELD_KEK_ENV]: randomBytes(16).toString('base64') })).toThrow(
      FieldEncryptionConfigError,
    );
  });
});

describe('encryptClassesFromEnv', () => {
  it('parses, trims, lowercases, and dedupes the class list', () => {
    expect(encryptClassesFromEnv({ [ENCRYPT_CLASSES_ENV]: ' pii, Health ,pii,' })).toEqual([
      'pii',
      'health',
    ]);
  });

  it('returns [] when unset or empty', () => {
    expect(encryptClassesFromEnv({})).toEqual([]);
    expect(encryptClassesFromEnv({ [ENCRYPT_CLASSES_ENV]: ' , ' })).toEqual([]);
  });
});

describe('assertFieldEncryptionConfig (boot guard)', () => {
  it('both unset — boots exactly as today', () => {
    expect(() => assertFieldEncryptionConfig({})).not.toThrow();
  });

  it('policy set without a KEK — hard error naming both variables', () => {
    expect(() => assertFieldEncryptionConfig({ [ENCRYPT_CLASSES_ENV]: 'pii,health' })).toThrowError(
      new RegExp(`${ENCRYPT_CLASSES_ENV}.*${FIELD_KEK_ENV}`, 's'),
    );
  });

  it('KEK staged before any class is enabled — allowed', () => {
    expect(() =>
      assertFieldEncryptionConfig({ [FIELD_KEK_ENV]: KEY.toString('base64') }),
    ).not.toThrow();
  });

  it('policy set with a malformed KEK — fails at boot, not first write', () => {
    expect(() =>
      assertFieldEncryptionConfig({
        [ENCRYPT_CLASSES_ENV]: 'pii',
        [FIELD_KEK_ENV]: 'garbage',
      }),
    ).toThrow(FieldEncryptionConfigError);
  });
});

describe('wrapKeyMaterial / unwrapKeyMaterial (svfk1 envelope)', () => {
  const ctx = { pluginId: 'fs.test.plugin', class: 'pii', purpose: 'dek' as const };

  it('round-trips 32 bytes of key material', () => {
    const material = randomBytes(32);
    const envelope = wrapKeyMaterial(KEY, material, ctx);
    expect(envelope.startsWith('svfk1:')).toBe(true);
    expect(unwrapKeyMaterial(KEY, envelope, ctx)).toEqual(material);
  });

  it('produces a fresh IV per wrap — same input, different envelopes', () => {
    const material = randomBytes(32);
    expect(wrapKeyMaterial(KEY, material, ctx)).not.toEqual(wrapKeyMaterial(KEY, material, ctx));
  });

  it('rejects the wrong KEK with a precise error', () => {
    const envelope = wrapKeyMaterial(KEY, randomBytes(32), ctx);
    expect(() => unwrapKeyMaterial(randomBytes(32), envelope, ctx)).toThrowError(
      /SOVEREIGN_FIELD_KEK is likely not the KEK/,
    );
  });

  it('AAD-binds plugin, class, and purpose — replay across any of them fails', () => {
    const envelope = wrapKeyMaterial(KEY, randomBytes(32), ctx);
    expect(() => unwrapKeyMaterial(KEY, envelope, { ...ctx, pluginId: 'fs.other' })).toThrow(
      FieldEncryptionConfigError,
    );
    expect(() => unwrapKeyMaterial(KEY, envelope, { ...ctx, class: 'health' })).toThrow(
      FieldEncryptionConfigError,
    );
    expect(() => unwrapKeyMaterial(KEY, envelope, { ...ctx, purpose: 'hmac' })).toThrow(
      FieldEncryptionConfigError,
    );
  });

  it('rejects a non-svfk1 envelope', () => {
    expect(() => unwrapKeyMaterial(KEY, 'svf1:a:b:c', ctx)).toThrow(/Unsupported wrapped-key/);
  });
});

describe('kekFingerprint', () => {
  it('is deterministic, non-secret-length, and key-distinguishing', () => {
    const other = randomBytes(32);
    expect(kekFingerprint(KEY)).toEqual(kekFingerprint(KEY));
    expect(kekFingerprint(KEY)).toHaveLength(16);
    expect(kekFingerprint(KEY)).not.toEqual(kekFingerprint(other));
  });
});
