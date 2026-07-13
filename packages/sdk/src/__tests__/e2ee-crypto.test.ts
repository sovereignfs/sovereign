import { describe, expect, it } from 'vitest';
import {
  generateCmk,
  generateDeviceKey,
  generateRecoverySecret,
  unwrapCmkWithDeviceKey,
  unwrapCmkWithRecoverySecret,
  wrapCmkWithDeviceKey,
  wrapCmkWithRecoverySecret,
} from '../e2ee-crypto';

/** Encrypt/decrypt a probe value with a CMK to prove two `CryptoKey` handles are the same key. */
async function roundTripsThrough(cmk: CryptoKey): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode('probe-value');
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    cmk,
    plaintext,
  );
  return `${Buffer.from(iv).toString('base64')}:${Buffer.from(ciphertext).toString('base64')}`;
}

async function decrypts(cmk: CryptoKey, token: string): Promise<string> {
  const [ivB64, ctB64] = token.split(':');
  const iv = new Uint8Array(Buffer.from(ivB64 ?? '', 'base64'));
  const ciphertext = new Uint8Array(Buffer.from(ctB64 ?? '', 'base64'));
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    cmk,
    ciphertext as BufferSource,
  );
  return new TextDecoder().decode(plaintext);
}

describe('generateRecoverySecret', () => {
  it('produces a grouped, high-entropy, non-ambiguous secret', () => {
    const secret = generateRecoverySecret();
    expect(secret).toMatch(/^[A-Z2-9]{5}(-[A-Z2-9]{5}){3}$/);
    expect(secret).not.toMatch(/[01IOL]/);
    expect(generateRecoverySecret()).not.toBe(generateRecoverySecret());
  });
});

describe('recovery-secret CMK wrap/unwrap', () => {
  it('round-trips: unwrapping with the correct secret recovers the same CMK', async () => {
    const cmk = await generateCmk();
    const secret = generateRecoverySecret();
    const wrapped = await wrapCmkWithRecoverySecret(cmk, secret);

    const unwrapped = await unwrapCmkWithRecoverySecret(wrapped, secret);

    const token = await roundTripsThrough(cmk);
    expect(await decrypts(unwrapped, token)).toBe('probe-value');
  });

  it('rejects the wrong recovery secret', async () => {
    const cmk = await generateCmk();
    const wrapped = await wrapCmkWithRecoverySecret(cmk, generateRecoverySecret());

    await expect(unwrapCmkWithRecoverySecret(wrapped, generateRecoverySecret())).rejects.toThrow();
  });

  it('never puts the CMK or secret in the wrapped output', async () => {
    const cmk = await generateCmk();
    const secret = generateRecoverySecret();
    const wrapped = await wrapCmkWithRecoverySecret(cmk, secret);

    const serialized = JSON.stringify(wrapped);
    expect(serialized).not.toContain(secret);
    // The wrapped ciphertext is base64url — a plaintext raw AES key would
    // never appear as a readable substring of it in any case, but assert the
    // shape is opaque ciphertext, not something structured/inspectable.
    expect(wrapped.wrappedCmk).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('produces a different salt/ciphertext on every call (fresh IV and salt)', async () => {
    const cmk = await generateCmk();
    const secret = generateRecoverySecret();
    const first = await wrapCmkWithRecoverySecret(cmk, secret);
    const second = await wrapCmkWithRecoverySecret(cmk, secret);

    expect(first.kdfSalt).not.toBe(second.kdfSalt);
    expect(first.wrappedCmk).not.toBe(second.wrappedCmk);
  });
});

describe('device-key CMK wrap/unwrap', () => {
  it('round-trips: unwrapping with the same device key recovers the same CMK', async () => {
    const cmk = await generateCmk();
    const deviceKey = await generateDeviceKey();
    const wrapped = await wrapCmkWithDeviceKey(cmk, deviceKey);

    const unwrapped = await unwrapCmkWithDeviceKey(wrapped, deviceKey);

    const token = await roundTripsThrough(cmk);
    expect(await decrypts(unwrapped, token)).toBe('probe-value');
  });

  it('rejects unwrapping with a different device key', async () => {
    const cmk = await generateCmk();
    const deviceKey = await generateDeviceKey();
    const otherDeviceKey = await generateDeviceKey();
    const wrapped = await wrapCmkWithDeviceKey(cmk, deviceKey);

    await expect(unwrapCmkWithDeviceKey(wrapped, otherDeviceKey)).rejects.toThrow();
  });

  it('generates a non-extractable device key', async () => {
    const deviceKey = await generateDeviceKey();
    expect(deviceKey.extractable).toBe(false);
  });
});
