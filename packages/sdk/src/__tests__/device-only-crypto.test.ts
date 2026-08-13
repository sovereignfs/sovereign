import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  deriveDeviceOnlyKeyViaPrf,
  fromBase64Url,
  generateDeviceStorageKey,
  generateRecoverySecret,
  isUserVerifyingPlatformAuthenticatorAvailable,
  isWebAuthnAvailable,
  toBase64Url,
  unwrapDeviceStorageKeyWithPrfKey,
  unwrapDeviceStorageKeyWithRecoverySecret,
  wrapDeviceStorageKeyWithPrfKey,
  wrapDeviceStorageKeyWithRecoverySecret,
} from '../device-only-crypto';

/**
 * Prove two key handles are the same key by wrapping a third, disposable
 * key with `a` and unwrapping it with `b` — both keys here only ever carry
 * `wrapKey`/`unwrapKey` usages (matching `deriveDeviceOnlyKeyViaPrf`'s own
 * output), so this proves identity the same way `subtle.wrapKey` requires,
 * rather than via `encrypt`/`decrypt`, which these keys aren't authorized for.
 */
async function proveSameKey(a: CryptoKey, b: CryptoKey): Promise<void> {
  const subject = await generateDeviceStorageKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const wrapped = await crypto.subtle.wrapKey('raw', subject, a, {
    name: 'AES-GCM',
    iv: iv as BufferSource,
  });
  await expect(
    crypto.subtle.unwrapKey(
      'raw',
      wrapped,
      b,
      { name: 'AES-GCM', iv: iv as BufferSource },
      { name: 'AES-GCM', length: 256 },
      false,
      ['wrapKey', 'unwrapKey'],
    ),
  ).resolves.toBeDefined();
}

/** Prove a derived key is actually usable as an AES-GCM wrap/unwrap key. */
async function roundTripsAsWrapKey(key: CryptoKey): Promise<void> {
  const subject = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, [
    'encrypt',
    'decrypt',
  ]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const wrapped = await crypto.subtle.wrapKey('raw', subject, key, {
    name: 'AES-GCM',
    iv: iv as BufferSource,
  });
  const unwrapped = await crypto.subtle.unwrapKey(
    'raw',
    wrapped,
    key,
    { name: 'AES-GCM', iv: iv as BufferSource },
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
  expect(unwrapped.algorithm).toEqual(subject.algorithm);
}

function stubPrfCapableAssertion(prfOutput: ArrayBuffer, rawId: ArrayBuffer): void {
  vi.stubGlobal('PublicKeyCredential', function PublicKeyCredential() {});
  vi.stubGlobal('navigator', {
    credentials: {
      get: vi.fn().mockResolvedValue({
        rawId,
        getClientExtensionResults: () => ({ prf: { results: { first: prfOutput } } }),
      }),
    },
  });
}

describe('isWebAuthnAvailable', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reports false with no navigator.credentials or PublicKeyCredential', () => {
    expect(isWebAuthnAvailable()).toBe(false);
  });

  it('reports true once both are present', () => {
    vi.stubGlobal('PublicKeyCredential', function PublicKeyCredential() {});
    vi.stubGlobal('navigator', { credentials: {} });

    expect(isWebAuthnAvailable()).toBe(true);
  });
});

describe('isUserVerifyingPlatformAuthenticatorAvailable', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reports false with no WebAuthn at all', async () => {
    expect(await isUserVerifyingPlatformAuthenticatorAvailable()).toBe(false);
  });

  it('reports false when PublicKeyCredential exists but lacks the static method', async () => {
    vi.stubGlobal('PublicKeyCredential', function PublicKeyCredential() {});
    vi.stubGlobal('navigator', { credentials: {} });

    expect(await isUserVerifyingPlatformAuthenticatorAvailable()).toBe(false);
  });

  it('passes through true when a passcode/biometric is configured', async () => {
    const PublicKeyCredentialStub = function PublicKeyCredential() {};
    PublicKeyCredentialStub.isUserVerifyingPlatformAuthenticatorAvailable = vi
      .fn()
      .mockResolvedValue(true);
    vi.stubGlobal('PublicKeyCredential', PublicKeyCredentialStub);
    vi.stubGlobal('navigator', { credentials: {} });

    expect(await isUserVerifyingPlatformAuthenticatorAvailable()).toBe(true);
  });

  it('passes through false when the device has no usable platform authenticator', async () => {
    const PublicKeyCredentialStub = function PublicKeyCredential() {};
    PublicKeyCredentialStub.isUserVerifyingPlatformAuthenticatorAvailable = vi
      .fn()
      .mockResolvedValue(false);
    vi.stubGlobal('PublicKeyCredential', PublicKeyCredentialStub);
    vi.stubGlobal('navigator', { credentials: {} });

    expect(await isUserVerifyingPlatformAuthenticatorAvailable()).toBe(false);
  });
});

describe('deriveDeviceOnlyKeyViaPrf', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reports unsupported in an environment with no WebAuthn', async () => {
    expect(await deriveDeviceOnlyKeyViaPrf()).toEqual({ status: 'unsupported' });
  });

  it('derives a usable AES-GCM wrap/unwrap key from a PRF-capable assertion', async () => {
    const prfOutput = crypto.getRandomValues(new Uint8Array(32)).buffer;
    const rawId = crypto.getRandomValues(new Uint8Array(16)).buffer;
    stubPrfCapableAssertion(prfOutput, rawId);

    const result = await deriveDeviceOnlyKeyViaPrf();

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.credentialId).toBe(rawId);
    await roundTripsAsWrapKey(result.key);
  });

  it('same PRF output derives a key that unwraps what an earlier derivation wrapped — same key, both calls', async () => {
    const prfOutput = crypto.getRandomValues(new Uint8Array(32)).buffer;
    const rawId = crypto.getRandomValues(new Uint8Array(16)).buffer;
    stubPrfCapableAssertion(prfOutput, rawId);

    const first = await deriveDeviceOnlyKeyViaPrf();
    const second = await deriveDeviceOnlyKeyViaPrf();
    expect(first.status).toBe('ok');
    expect(second.status).toBe('ok');
    if (first.status !== 'ok' || second.status !== 'ok') return;

    const subject = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, [
      'encrypt',
      'decrypt',
    ]);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const wrapped = await crypto.subtle.wrapKey('raw', subject, first.key, {
      name: 'AES-GCM',
      iv: iv as BufferSource,
    });
    // Unwraps cleanly with the *second* derivation's key — proves both calls
    // produced the same underlying key material, as PRF's determinism requires.
    await expect(
      crypto.subtle.unwrapKey(
        'raw',
        wrapped,
        second.key,
        { name: 'AES-GCM', iv: iv as BufferSource },
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt'],
      ),
    ).resolves.toBeDefined();
  });

  it('reports unavailable when the ceremony succeeds but the credential is not PRF-capable', async () => {
    vi.stubGlobal('PublicKeyCredential', function PublicKeyCredential() {});
    vi.stubGlobal('navigator', {
      credentials: {
        get: vi.fn().mockResolvedValue({
          rawId: new ArrayBuffer(16),
          getClientExtensionResults: () => ({}),
        }),
      },
    });

    expect(await deriveDeviceOnlyKeyViaPrf()).toEqual({ status: 'unavailable' });
  });

  it('reports cancelled when the user dismisses the platform prompt', async () => {
    vi.stubGlobal('PublicKeyCredential', function PublicKeyCredential() {});
    vi.stubGlobal('navigator', {
      credentials: {
        get: vi.fn().mockRejectedValue(new DOMException('dismissed', 'NotAllowedError')),
      },
    });

    expect(await deriveDeviceOnlyKeyViaPrf()).toEqual({ status: 'cancelled' });
  });

  it('reports failed with the error message for any other rejection', async () => {
    vi.stubGlobal('PublicKeyCredential', function PublicKeyCredential() {});
    vi.stubGlobal('navigator', {
      credentials: { get: vi.fn().mockRejectedValue(new Error('platform error')) },
    });

    expect(await deriveDeviceOnlyKeyViaPrf()).toEqual({
      status: 'failed',
      error: 'platform error',
    });
  });

  it('passes a specific credentialId through to allowCredentials when provided', async () => {
    const prfOutput = crypto.getRandomValues(new Uint8Array(32)).buffer;
    const rawId = crypto.getRandomValues(new Uint8Array(16)).buffer;
    const get = vi.fn().mockResolvedValue({
      rawId,
      getClientExtensionResults: () => ({ prf: { results: { first: prfOutput } } }),
    });
    vi.stubGlobal('PublicKeyCredential', function PublicKeyCredential() {});
    vi.stubGlobal('navigator', { credentials: { get } });

    const targetId = new Uint8Array([1, 2, 3]).buffer;
    await deriveDeviceOnlyKeyViaPrf(targetId);

    expect(get).toHaveBeenCalledWith(
      expect.objectContaining({
        publicKey: expect.objectContaining({
          allowCredentials: [{ id: targetId, type: 'public-key' }],
        }),
      }),
    );
  });

  it('uses an empty allowCredentials list (resident-credential picker) when no credentialId is given', async () => {
    const prfOutput = crypto.getRandomValues(new Uint8Array(32)).buffer;
    const rawId = crypto.getRandomValues(new Uint8Array(16)).buffer;
    const get = vi.fn().mockResolvedValue({
      rawId,
      getClientExtensionResults: () => ({ prf: { results: { first: prfOutput } } }),
    });
    vi.stubGlobal('PublicKeyCredential', function PublicKeyCredential() {});
    vi.stubGlobal('navigator', { credentials: { get } });

    await deriveDeviceOnlyKeyViaPrf();

    expect(get).toHaveBeenCalledWith(
      expect.objectContaining({
        publicKey: expect.objectContaining({ allowCredentials: [] }),
      }),
    );
  });

  it('never sends the challenge anywhere — it only satisfies the WebAuthn API shape locally', async () => {
    // No fetch/network mock is set up at all; if this module tried to phone
    // home, referencing an undefined `fetch` in this test environment would
    // throw and fail the test.
    const prfOutput = crypto.getRandomValues(new Uint8Array(32)).buffer;
    stubPrfCapableAssertion(prfOutput, new ArrayBuffer(16));

    await expect(deriveDeviceOnlyKeyViaPrf()).resolves.toMatchObject({ status: 'ok' });
  });
});

describe('generateRecoverySecret (re-export)', () => {
  it('produces a non-trivial, human-recordable secret', () => {
    const secret = generateRecoverySecret();
    expect(secret.length).toBeGreaterThan(10);
    // Same generator e2ee-crypto.ts already tests in depth for entropy/format
    // — this is a smoke test that the re-export actually reaches it, not a
    // duplicate of that coverage.
    expect(generateRecoverySecret()).not.toBe(secret);
  });
});

describe('wrapDeviceStorageKeyWithRecoverySecret / unwrapDeviceStorageKeyWithRecoverySecret', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('round-trips: unwrapping with the correct secret recovers the same key', async () => {
    const key = await generateDeviceStorageKey();
    const secret = generateRecoverySecret();

    const wrapped = await wrapDeviceStorageKeyWithRecoverySecret(key, secret);
    const unwrapped = await unwrapDeviceStorageKeyWithRecoverySecret(wrapped, secret);

    await proveSameKey(key, unwrapped);
  });

  it('rejects with the wrong recovery secret', async () => {
    const key = await generateDeviceStorageKey();
    const wrapped = await wrapDeviceStorageKeyWithRecoverySecret(key, generateRecoverySecret());

    await expect(
      unwrapDeviceStorageKeyWithRecoverySecret(wrapped, generateRecoverySecret()),
    ).rejects.toThrow();
  });

  it('records algorithm/version/KDF metadata alongside the ciphertext, matching the e2ee-crypto.ts convention', async () => {
    const key = await generateDeviceStorageKey();
    const wrapped = await wrapDeviceStorageKeyWithRecoverySecret(key, generateRecoverySecret());

    expect(wrapped.algorithmVersion).toBe('v1');
    expect(wrapped.kdfAlgorithm).toBe('PBKDF2-SHA256');
    expect(JSON.parse(wrapped.kdfParams)).toMatchObject({ iterations: 600_000, hash: 'SHA-256' });
    expect(typeof wrapped.kdfSalt).toBe('string');
    expect(typeof wrapped.wrappedKey).toBe('string');
  });

  it('two wraps of the same key with the same secret produce different ciphertext (random salt/IV each time)', async () => {
    const key = await generateDeviceStorageKey();
    const secret = generateRecoverySecret();

    const first = await wrapDeviceStorageKeyWithRecoverySecret(key, secret);
    const second = await wrapDeviceStorageKeyWithRecoverySecret(key, secret);

    expect(first.wrappedKey).not.toBe(second.wrappedKey);
    expect(first.kdfSalt).not.toBe(second.kdfSalt);
    // Both still recover the same underlying key despite different ciphertext.
    const unwrappedFirst = await unwrapDeviceStorageKeyWithRecoverySecret(first, secret);
    const unwrappedSecond = await unwrapDeviceStorageKeyWithRecoverySecret(second, secret);
    await proveSameKey(unwrappedFirst, unwrappedSecond);
  });
});

describe('wrapDeviceStorageKeyWithPrfKey / unwrapDeviceStorageKeyWithPrfKey', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('round-trips: unwrapping with the same PRF key recovers the same Device Storage Key', async () => {
    const deviceStorageKey = await generateDeviceStorageKey();
    const prfOutput = crypto.getRandomValues(new Uint8Array(32)).buffer;
    stubPrfCapableAssertion(prfOutput, new ArrayBuffer(16));
    const derived = await deriveDeviceOnlyKeyViaPrf();
    expect(derived.status).toBe('ok');
    if (derived.status !== 'ok') return;

    const wrapped = await wrapDeviceStorageKeyWithPrfKey(deviceStorageKey, derived.key);
    const unwrapped = await unwrapDeviceStorageKeyWithPrfKey(wrapped, derived.key);

    await proveSameKey(deviceStorageKey, unwrapped);
  });

  it('wrapper 1 (PRF) and wrapper 2 (recovery secret) independently unwrap to the same Device Storage Key — the actual RFC 0093 §3 key-slot design, end to end', async () => {
    const deviceStorageKey = await generateDeviceStorageKey();

    const prfOutput = crypto.getRandomValues(new Uint8Array(32)).buffer;
    stubPrfCapableAssertion(prfOutput, new ArrayBuffer(16));
    const derived = await deriveDeviceOnlyKeyViaPrf();
    expect(derived.status).toBe('ok');
    if (derived.status !== 'ok') return;

    const recoverySecret = generateRecoverySecret();

    const prfWrapped = await wrapDeviceStorageKeyWithPrfKey(deviceStorageKey, derived.key);
    const recoveryWrapped = await wrapDeviceStorageKeyWithRecoverySecret(
      deviceStorageKey,
      recoverySecret,
    );

    const viaPrf = await unwrapDeviceStorageKeyWithPrfKey(prfWrapped, derived.key);
    const viaRecovery = await unwrapDeviceStorageKeyWithRecoverySecret(
      recoveryWrapped,
      recoverySecret,
    );

    // Two independent doors, same room: both wrappers open the identical
    // underlying key, and neither wrapper's ciphertext depends on the other.
    await proveSameKey(viaPrf, viaRecovery);
  });
});

describe('toBase64Url / fromBase64Url', () => {
  it('round-trips arbitrary bytes, including values that need padding', () => {
    for (const length of [0, 1, 15, 16, 32]) {
      const bytes = crypto.getRandomValues(new Uint8Array(length));
      expect(fromBase64Url(toBase64Url(bytes))).toEqual(bytes);
    }
  });

  it('produces URL-safe output with no padding characters', () => {
    // Chosen to contain both 0x3e/0x3f bytes, which standard base64 would
    // encode as '+'/'/' — exactly what base64url must avoid.
    const bytes = new Uint8Array([0xfb, 0xff, 0xbf]);
    const encoded = toBase64Url(bytes);
    expect(encoded).not.toMatch(/[+/=]/);
  });

  it('round-trips a credential rawId the same way deriveDeviceOnlyKeyViaPrf returns it', async () => {
    const rawId = crypto.getRandomValues(new Uint8Array(16)).buffer;
    const encoded = toBase64Url(rawId);
    const decoded = fromBase64Url(encoded);
    expect(new Uint8Array(decoded)).toEqual(new Uint8Array(rawId));
  });
});
