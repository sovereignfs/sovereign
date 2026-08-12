import { describe, expect, it, vi } from 'vitest';
import {
  generateCmk,
  generateDek,
  generateDeviceKey,
  generateRecoverySecret,
  unwrapCmkWithDeviceKey,
  unwrapCmkWithRecoverySecret,
  unwrapDekWithCmk,
  wrapCmkWithDeviceKey,
  wrapCmkWithRecoverySecret,
  wrapDekWithCmk,
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

  // The 31-character alphabet does not divide 256 evenly (256 = 8×31 + 8), so
  // the old `byte % 31` mapping made the first 8 characters ~12% likelier than
  // the rest. Rejection sampling discards 248..255 instead of folding them
  // back onto the start of the alphabet.
  it('discards bytes above the last whole multiple of the alphabet', () => {
    // Alternates a byte that must be rejected (249) with one that must map to
    // 'A' (0). 249 is chosen deliberately: under `byte % 31` it folded to
    // alphabet[1] = 'B', so half the output would be 'B'. (248 would be a
    // useless probe here — 248 % 31 is 0, which maps to 'A' either way.)
    let flip = false;
    const source = vi.spyOn(crypto, 'getRandomValues').mockImplementation(((arr: Uint8Array) => {
      for (let i = 0; i < arr.length; i++) {
        flip = !flip;
        arr[i] = flip ? 249 : 0;
      }
      return arr;
    }) as typeof crypto.getRandomValues);

    try {
      expect(generateRecoverySecret()).toBe('AAAAA-AAAAA-AAAAA-AAAAA');
    } finally {
      source.mockRestore();
    }
  });

  it('still fills the full secret when draws are rejected', () => {
    // Rejection must not shorten the output — the generator redraws until it
    // has a full complement of characters.
    for (let i = 0; i < 50; i++) {
      expect(generateRecoverySecret().replaceAll('-', '')).toHaveLength(20);
    }
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

describe('per-object DEK wrap/unwrap', () => {
  it('round-trips: unwrapping with the same CMK recovers the same DEK', async () => {
    const cmk = await generateCmk();
    const dek = await generateDek();
    const wrapped = await wrapDekWithCmk(dek, cmk);

    const unwrapped = await unwrapDekWithCmk(wrapped, cmk);

    const token = await roundTripsThrough(dek);
    expect(await decrypts(unwrapped, token)).toBe('probe-value');
  });

  it('rejects unwrapping with a different CMK', async () => {
    const cmk = await generateCmk();
    const otherCmk = await generateCmk();
    const dek = await generateDek();
    const wrapped = await wrapDekWithCmk(dek, cmk);

    await expect(unwrapDekWithCmk(wrapped, otherCmk)).rejects.toThrow();
  });

  it('produces a `wrappedDek` field, distinct from a wrapped CMK', async () => {
    const cmk = await generateCmk();
    const dek = await generateDek();
    const wrapped = await wrapDekWithCmk(dek, cmk);

    expect(wrapped).toHaveProperty('wrappedDek');
    expect(wrapped.wrappedDek).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('produces a different ciphertext on every call (fresh IV)', async () => {
    const cmk = await generateCmk();
    const dek = await generateDek();
    const first = await wrapDekWithCmk(dek, cmk);
    const second = await wrapDekWithCmk(dek, cmk);

    expect(first.wrappedDek).not.toBe(second.wrappedDek);
  });
});
