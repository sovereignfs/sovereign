import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getDeviceStorageKeyStatus = vi.fn();
const loadReLockPolicy = vi.fn();
const loadWrappedDeviceStorageKeys = vi.fn();
const deriveDeviceOnlyKeyViaPrf = vi.fn();
const unwrapDeviceStorageKeyWithPrfKey = vi.fn();

vi.mock('../device-only-storage', async () => {
  const actual =
    await vi.importActual<typeof import('../device-only-storage')>('../device-only-storage');
  return {
    ...actual,
    getDeviceStorageKeyStatus: (...args: unknown[]) => getDeviceStorageKeyStatus(...args),
    loadReLockPolicy: (...args: unknown[]) => loadReLockPolicy(...args),
    loadWrappedDeviceStorageKeys: (...args: unknown[]) => loadWrappedDeviceStorageKeys(...args),
  };
});

vi.mock('../device-only-crypto', async () => {
  const actual =
    await vi.importActual<typeof import('../device-only-crypto')>('../device-only-crypto');
  return {
    ...actual,
    deriveDeviceOnlyKeyViaPrf: (...args: unknown[]) => deriveDeviceOnlyKeyViaPrf(...args),
    unwrapDeviceStorageKeyWithPrfKey: (...args: unknown[]) =>
      unwrapDeviceStorageKeyWithPrfKey(...args),
  };
});

const { getUnlockedDeviceStorageKey, isDeviceStorageKeyUnlocked, lockDeviceStorageKey } =
  await import('../device-only-session');

const FAKE_WRAPPED = {
  prfWrapped: { wrappedKey: 'prf-ciphertext', algorithmVersion: 'v1' },
  prfCredentialId: 'ZmFrZS1jcmVkZW50aWFsLWlk', // base64url, arbitrary
  recoveryWrapped: null,
};

function fakeKey(tag: string): CryptoKey {
  return { tag } as unknown as CryptoKey;
}

describe('getUnlockedDeviceStorageKey', () => {
  beforeEach(() => {
    lockDeviceStorageKey();
    getDeviceStorageKeyStatus.mockReset();
    loadReLockPolicy.mockReset();
    loadWrappedDeviceStorageKeys.mockReset();
    deriveDeviceOnlyKeyViaPrf.mockReset();
    unwrapDeviceStorageKeyWithPrfKey.mockReset();
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('passes through a non-set-up status without attempting derivation', async () => {
    getDeviceStorageKeyStatus.mockResolvedValue('no-device-auth');

    const result = await getUnlockedDeviceStorageKey();

    expect(result).toEqual({ status: 'no-device-auth' });
    expect(deriveDeviceOnlyKeyViaPrf).not.toHaveBeenCalled();
  });

  it('runs the PRF ceremony and caches the unwrapped key on first access', async () => {
    getDeviceStorageKeyStatus.mockResolvedValue('set-up');
    loadWrappedDeviceStorageKeys.mockResolvedValue(FAKE_WRAPPED);
    const prfKey = fakeKey('prf');
    deriveDeviceOnlyKeyViaPrf.mockResolvedValue({ status: 'ok', key: prfKey, credentialId: {} });
    const unwrapped = fakeKey('device-storage');
    unwrapDeviceStorageKeyWithPrfKey.mockResolvedValue(unwrapped);
    loadReLockPolicy.mockResolvedValue('5m');

    const result = await getUnlockedDeviceStorageKey();

    expect(result).toEqual({ status: 'ok', key: unwrapped });
    expect(deriveDeviceOnlyKeyViaPrf).toHaveBeenCalledTimes(1);
    expect(unwrapDeviceStorageKeyWithPrfKey).toHaveBeenCalledWith(FAKE_WRAPPED.prfWrapped, prfKey);
  });

  it('reuses the cached key within the re-lock window without re-deriving', async () => {
    getDeviceStorageKeyStatus.mockResolvedValue('set-up');
    loadWrappedDeviceStorageKeys.mockResolvedValue(FAKE_WRAPPED);
    deriveDeviceOnlyKeyViaPrf.mockResolvedValue({
      status: 'ok',
      key: fakeKey('prf'),
      credentialId: {},
    });
    const unwrapped = fakeKey('device-storage');
    unwrapDeviceStorageKeyWithPrfKey.mockResolvedValue(unwrapped);
    loadReLockPolicy.mockResolvedValue('5m');

    const first = await getUnlockedDeviceStorageKey();
    const second = await getUnlockedDeviceStorageKey();

    expect(first).toEqual({ status: 'ok', key: unwrapped });
    expect(second).toEqual({ status: 'ok', key: unwrapped });
    expect(deriveDeviceOnlyKeyViaPrf).toHaveBeenCalledTimes(1);
  });

  it('re-derives once the re-lock window has elapsed', async () => {
    vi.useFakeTimers();
    getDeviceStorageKeyStatus.mockResolvedValue('set-up');
    loadWrappedDeviceStorageKeys.mockResolvedValue(FAKE_WRAPPED);
    deriveDeviceOnlyKeyViaPrf.mockResolvedValue({
      status: 'ok',
      key: fakeKey('prf'),
      credentialId: {},
    });
    unwrapDeviceStorageKeyWithPrfKey.mockResolvedValue(fakeKey('device-storage'));
    loadReLockPolicy.mockResolvedValue('1m');

    await getUnlockedDeviceStorageKey();
    vi.advanceTimersByTime(61_000);
    await getUnlockedDeviceStorageKey();

    expect(deriveDeviceOnlyKeyViaPrf).toHaveBeenCalledTimes(2);
  });

  it('never reuses the cache under an immediate re-lock policy', async () => {
    getDeviceStorageKeyStatus.mockResolvedValue('set-up');
    loadWrappedDeviceStorageKeys.mockResolvedValue(FAKE_WRAPPED);
    deriveDeviceOnlyKeyViaPrf.mockResolvedValue({
      status: 'ok',
      key: fakeKey('prf'),
      credentialId: {},
    });
    unwrapDeviceStorageKeyWithPrfKey.mockResolvedValue(fakeKey('device-storage'));
    loadReLockPolicy.mockResolvedValue('immediate');

    await getUnlockedDeviceStorageKey();
    await getUnlockedDeviceStorageKey();

    expect(deriveDeviceOnlyKeyViaPrf).toHaveBeenCalledTimes(2);
  });

  it('reports not-set-up when status says set-up but the wrapped material is incomplete', async () => {
    getDeviceStorageKeyStatus.mockResolvedValue('set-up');
    loadWrappedDeviceStorageKeys.mockResolvedValue({
      prfWrapped: null,
      prfCredentialId: null,
      recoveryWrapped: null,
    });

    const result = await getUnlockedDeviceStorageKey();

    expect(result).toEqual({ status: 'not-set-up' });
    expect(deriveDeviceOnlyKeyViaPrf).not.toHaveBeenCalled();
  });

  it('passes through cancellation from the PRF ceremony', async () => {
    getDeviceStorageKeyStatus.mockResolvedValue('set-up');
    loadWrappedDeviceStorageKeys.mockResolvedValue(FAKE_WRAPPED);
    deriveDeviceOnlyKeyViaPrf.mockResolvedValue({ status: 'cancelled' });

    const result = await getUnlockedDeviceStorageKey();

    expect(result).toEqual({ status: 'cancelled' });
    expect(unwrapDeviceStorageKeyWithPrfKey).not.toHaveBeenCalled();
  });

  it("maps an 'unavailable' PRF result to a descriptive failure", async () => {
    getDeviceStorageKeyStatus.mockResolvedValue('set-up');
    loadWrappedDeviceStorageKeys.mockResolvedValue(FAKE_WRAPPED);
    deriveDeviceOnlyKeyViaPrf.mockResolvedValue({ status: 'unavailable' });

    const result = await getUnlockedDeviceStorageKey();

    expect(result.status).toBe('failed');
  });

  it('discards the session once the key is forgotten', async () => {
    getDeviceStorageKeyStatus.mockResolvedValue('set-up');
    loadWrappedDeviceStorageKeys.mockResolvedValue(FAKE_WRAPPED);
    deriveDeviceOnlyKeyViaPrf.mockResolvedValue({
      status: 'ok',
      key: fakeKey('prf'),
      credentialId: {},
    });
    unwrapDeviceStorageKeyWithPrfKey.mockResolvedValue(fakeKey('device-storage'));
    loadReLockPolicy.mockResolvedValue('5m');

    await getUnlockedDeviceStorageKey();
    getDeviceStorageKeyStatus.mockResolvedValue('not-set-up');
    const result = await getUnlockedDeviceStorageKey();

    expect(result).toEqual({ status: 'not-set-up' });
  });
});

describe('lockDeviceStorageKey / isDeviceStorageKeyUnlocked', () => {
  beforeEach(() => {
    lockDeviceStorageKey();
    getDeviceStorageKeyStatus.mockReset();
    loadReLockPolicy.mockReset();
    loadWrappedDeviceStorageKeys.mockReset();
    deriveDeviceOnlyKeyViaPrf.mockReset();
    unwrapDeviceStorageKeyWithPrfKey.mockReset();
  });

  it('reports unlocked as false with no active session', async () => {
    await expect(isDeviceStorageKeyUnlocked()).resolves.toBe(false);
  });

  it('reports unlocked as true right after a successful unlock, and false after an explicit lock', async () => {
    getDeviceStorageKeyStatus.mockResolvedValue('set-up');
    loadWrappedDeviceStorageKeys.mockResolvedValue(FAKE_WRAPPED);
    deriveDeviceOnlyKeyViaPrf.mockResolvedValue({
      status: 'ok',
      key: fakeKey('prf'),
      credentialId: {},
    });
    unwrapDeviceStorageKeyWithPrfKey.mockResolvedValue(fakeKey('device-storage'));
    loadReLockPolicy.mockResolvedValue('5m');

    await getUnlockedDeviceStorageKey();
    await expect(isDeviceStorageKeyUnlocked()).resolves.toBe(true);

    lockDeviceStorageKey();
    await expect(isDeviceStorageKeyUnlocked()).resolves.toBe(false);
  });
});
