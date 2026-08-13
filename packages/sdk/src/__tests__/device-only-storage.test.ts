import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearWrappedDeviceStorageKeys,
  DEFAULT_RE_LOCK_POLICY,
  getDeviceStorageKeyStatus,
  isOpfsAvailable,
  loadReLockPolicy,
  loadWrappedDeviceStorageKeys,
  requestPersistentStorage,
  saveReLockPolicy,
  saveWrappedDeviceStorageKeys,
} from '../device-only-storage';
import type {
  PrfWrappedDeviceStorageKey,
  RecoveryWrappedDeviceStorageKey,
} from '../device-only-crypto';

/**
 * Minimal in-memory OPFS fake — Node/jsdom implement neither
 * `navigator.storage.getDirectory()` nor the File System Access API it
 * returns, so real OPFS can't be exercised in this test environment.
 * Covers exactly the surface `device-only-storage.ts` actually calls:
 * `getDirectoryHandle`/`getFileHandle` (both respecting `create`, both
 * throwing `NotFoundError` when absent and `create` isn't set),
 * `createWritable`/`write`/`close`, `getFile`/`text`, and `removeEntry` at
 * both the root (a whole directory) and directory (a single file) level.
 */
function createFakeOpfs(persistResult = true) {
  const dirs = new Map<string, Map<string, string>>();

  function makeFileHandle(dirName: string, fileName: string) {
    return {
      async getFile() {
        const content = dirs.get(dirName)?.get(fileName);
        if (content === undefined) throw new DOMException('not found', 'NotFoundError');
        return { text: async () => content };
      },
      async createWritable() {
        let buffer = '';
        return {
          write: async (data: string) => {
            buffer = data;
          },
          close: async () => {
            if (!dirs.has(dirName)) dirs.set(dirName, new Map());
            dirs.get(dirName)?.set(fileName, buffer);
          },
        };
      },
    };
  }

  function makeDirHandle(dirName: string) {
    return {
      async getFileHandle(fileName: string, opts?: { create?: boolean }) {
        const exists = dirs.get(dirName)?.has(fileName) ?? false;
        if (!exists && !opts?.create) throw new DOMException('not found', 'NotFoundError');
        if (!exists && !dirs.has(dirName)) dirs.set(dirName, new Map());
        return makeFileHandle(dirName, fileName);
      },
      async removeEntry(fileName: string) {
        const exists = dirs.get(dirName)?.has(fileName) ?? false;
        if (!exists) throw new DOMException('not found', 'NotFoundError');
        dirs.get(dirName)?.delete(fileName);
      },
    };
  }

  const root = {
    async getDirectoryHandle(name: string, opts?: { create?: boolean }) {
      const exists = dirs.has(name);
      if (!exists && !opts?.create) throw new DOMException('not found', 'NotFoundError');
      if (!exists) dirs.set(name, new Map());
      return makeDirHandle(name);
    },
    async removeEntry(name: string, _opts?: { recursive?: boolean }) {
      if (!dirs.has(name)) throw new DOMException('not found', 'NotFoundError');
      dirs.delete(name);
    },
  };

  const storage = {
    getDirectory: async () => root,
    persist: async () => persistResult,
  };

  return {
    storage,
    fileCount: () => [...dirs.values()].reduce((n, d) => n + d.size, 0),
  };
}

function stubOpfs(persistResult = true) {
  const fake = createFakeOpfs(persistResult);
  vi.stubGlobal('navigator', { storage: fake.storage });
  return fake;
}

/**
 * Stubs both WebAuthn and OPFS globals present — the "environment supports
 * the tier" baseline `getDeviceStorageKeyStatus` needs before it can
 * distinguish 'no-device-auth' / 'not-set-up' / 'set-up'.
 * `hasPlatformAuthenticator` defaults to `true` (a passcode/biometric is
 * configured) so existing not-set-up/set-up tests don't need to know about
 * this dimension — pass `false` to exercise the no-device-auth case.
 */
function stubWebAuthnAndOpfs(persistResult = true, hasPlatformAuthenticator = true) {
  const fake = createFakeOpfs(persistResult);
  const PublicKeyCredentialStub = function PublicKeyCredential() {};
  PublicKeyCredentialStub.isUserVerifyingPlatformAuthenticatorAvailable = vi
    .fn()
    .mockResolvedValue(hasPlatformAuthenticator);
  vi.stubGlobal('PublicKeyCredential', PublicKeyCredentialStub);
  vi.stubGlobal('navigator', { credentials: {}, storage: fake.storage });
  return fake;
}

const prfWrapped: PrfWrappedDeviceStorageKey = {
  wrappedKey: 'prf-ciphertext',
  algorithmVersion: 'v1',
};
const prfCredentialId = 'credential-id';
const recoveryWrapped: RecoveryWrappedDeviceStorageKey = {
  wrappedKey: 'recovery-ciphertext',
  algorithmVersion: 'v1',
  kdfAlgorithm: 'PBKDF2-SHA256',
  kdfParams: '{"iterations":600000,"hash":"SHA-256"}',
  kdfSalt: 'salt',
};

describe('isOpfsAvailable', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reports false with no navigator.storage.getDirectory', () => {
    expect(isOpfsAvailable()).toBe(false);
  });

  it('reports true once stubbed', () => {
    stubOpfs();
    expect(isOpfsAvailable()).toBe(true);
  });
});

describe('requestPersistentStorage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reports false with no navigator.storage.persist', async () => {
    expect(await requestPersistentStorage()).toBe(false);
  });

  it('passes through the browser’s grant/deny decision unchanged', async () => {
    stubOpfs(true);
    expect(await requestPersistentStorage()).toBe(true);

    stubOpfs(false);
    expect(await requestPersistentStorage()).toBe(false);
  });
});

describe('saveWrappedDeviceStorageKeys / loadWrappedDeviceStorageKeys', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('round-trips both wrappers plus the PRF credential id', async () => {
    stubOpfs();

    await saveWrappedDeviceStorageKeys({ prfWrapped, prfCredentialId, recoveryWrapped });
    const loaded = await loadWrappedDeviceStorageKeys();

    expect(loaded).toEqual({ prfWrapped, prfCredentialId, recoveryWrapped });
  });

  it('returns nulls for all fields when nothing has been saved yet', async () => {
    stubOpfs();

    expect(await loadWrappedDeviceStorageKeys()).toEqual({
      prfWrapped: null,
      prfCredentialId: null,
      recoveryWrapped: null,
    });
  });

  it('returns nulls (not a throw) when OPFS itself is unavailable', async () => {
    expect(await loadWrappedDeviceStorageKeys()).toEqual({
      prfWrapped: null,
      prfCredentialId: null,
      recoveryWrapped: null,
    });
  });

  it('throws when saving without OPFS available, rather than silently no-op-ing', async () => {
    await expect(
      saveWrappedDeviceStorageKeys({ prfWrapped, prfCredentialId, recoveryWrapped }),
    ).rejects.toThrow();
  });

  it('a later save replaces the earlier one atomically (single combined file)', async () => {
    stubOpfs();

    await saveWrappedDeviceStorageKeys({
      prfWrapped,
      prfCredentialId,
      recoveryWrapped: null,
    });
    await saveWrappedDeviceStorageKeys({
      prfWrapped: null,
      prfCredentialId: null,
      recoveryWrapped,
    });

    expect(await loadWrappedDeviceStorageKeys()).toEqual({
      prfWrapped: null,
      prfCredentialId: null,
      recoveryWrapped,
    });
  });

  it('re-enrollment pattern: caller reads existing recovery wrapper through unchanged while replacing the PRF wrapper and its credential id together', async () => {
    stubOpfs();
    await saveWrappedDeviceStorageKeys({ prfWrapped, prfCredentialId, recoveryWrapped });

    const existing = await loadWrappedDeviceStorageKeys();
    const freshPrfWrapped: PrfWrappedDeviceStorageKey = {
      wrappedKey: 'new-prf-ciphertext',
      algorithmVersion: 'v1',
    };
    const freshPrfCredentialId = 'new-credential-id';
    await saveWrappedDeviceStorageKeys({
      prfWrapped: freshPrfWrapped,
      prfCredentialId: freshPrfCredentialId,
      recoveryWrapped: existing.recoveryWrapped,
    });

    expect(await loadWrappedDeviceStorageKeys()).toEqual({
      prfWrapped: freshPrfWrapped,
      prfCredentialId: freshPrfCredentialId,
      recoveryWrapped,
    });
  });
});

describe('clearWrappedDeviceStorageKeys', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('removes saved wrappers so a later load returns nulls again', async () => {
    stubOpfs();
    await saveWrappedDeviceStorageKeys({ prfWrapped, prfCredentialId, recoveryWrapped });

    await clearWrappedDeviceStorageKeys();

    expect(await loadWrappedDeviceStorageKeys()).toEqual({
      prfWrapped: null,
      prfCredentialId: null,
      recoveryWrapped: null,
    });
  });

  it('is a no-op when nothing was ever saved', async () => {
    stubOpfs();
    await expect(clearWrappedDeviceStorageKeys()).resolves.toBeUndefined();
  });

  it('is a no-op when OPFS is unavailable, rather than throwing', async () => {
    await expect(clearWrappedDeviceStorageKeys()).resolves.toBeUndefined();
  });

  it('preserves the re-lock policy preference — forgetting the key is not a full purge', async () => {
    stubOpfs();
    await saveWrappedDeviceStorageKeys({ prfWrapped, prfCredentialId, recoveryWrapped });
    await saveReLockPolicy('immediate');

    await clearWrappedDeviceStorageKeys();

    expect(await loadWrappedDeviceStorageKeys()).toEqual({
      prfWrapped: null,
      prfCredentialId: null,
      recoveryWrapped: null,
    });
    expect(await loadReLockPolicy()).toBe('immediate');
  });
});

describe('saveReLockPolicy / loadReLockPolicy', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns the default when nothing has been saved yet', async () => {
    stubOpfs();
    expect(await loadReLockPolicy()).toBe(DEFAULT_RE_LOCK_POLICY);
  });

  it('returns the default when OPFS is unavailable, rather than throwing', async () => {
    expect(await loadReLockPolicy()).toBe(DEFAULT_RE_LOCK_POLICY);
  });

  it('round-trips a saved choice', async () => {
    stubOpfs();
    await saveReLockPolicy('1h');
    expect(await loadReLockPolicy()).toBe('1h');
  });

  it('a later save replaces the earlier choice', async () => {
    stubOpfs();
    await saveReLockPolicy('1m');
    await saveReLockPolicy('15m');
    expect(await loadReLockPolicy()).toBe('15m');
  });

  it('throws when saving without OPFS available, rather than silently no-op-ing', async () => {
    await expect(saveReLockPolicy('immediate')).rejects.toThrow();
  });

  it('is independent of the wrapped-key file — saving one does not disturb the other', async () => {
    stubOpfs();
    await saveWrappedDeviceStorageKeys({ prfWrapped, prfCredentialId, recoveryWrapped });
    await saveReLockPolicy('immediate');

    expect(await loadWrappedDeviceStorageKeys()).toEqual({
      prfWrapped,
      prfCredentialId,
      recoveryWrapped,
    });
    expect(await loadReLockPolicy()).toBe('immediate');
  });
});

describe('getDeviceStorageKeyStatus', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reports unsupported with neither WebAuthn nor OPFS present', async () => {
    expect(await getDeviceStorageKeyStatus()).toBe('unsupported');
  });

  it('reports unsupported with OPFS but no WebAuthn', async () => {
    stubOpfs();
    expect(await getDeviceStorageKeyStatus()).toBe('unsupported');
  });

  it('reports unsupported with WebAuthn but no OPFS', async () => {
    vi.stubGlobal('PublicKeyCredential', function PublicKeyCredential() {});
    vi.stubGlobal('navigator', { credentials: {} });
    expect(await getDeviceStorageKeyStatus()).toBe('unsupported');
  });

  it('reports not-set-up when the environment supports the tier but nothing has been saved', async () => {
    stubWebAuthnAndOpfs();
    expect(await getDeviceStorageKeyStatus()).toBe('not-set-up');
  });

  it('reports not-set-up when only one of the two wrappers has been saved', async () => {
    stubWebAuthnAndOpfs();
    await saveWrappedDeviceStorageKeys({ prfWrapped, prfCredentialId, recoveryWrapped: null });
    expect(await getDeviceStorageKeyStatus()).toBe('not-set-up');
  });

  it('reports set-up once both wrappers are saved', async () => {
    stubWebAuthnAndOpfs();
    await saveWrappedDeviceStorageKeys({ prfWrapped, prfCredentialId, recoveryWrapped });
    expect(await getDeviceStorageKeyStatus()).toBe('set-up');
  });

  it('reports no-device-auth when nothing has been saved and the device has no usable platform authenticator', async () => {
    stubWebAuthnAndOpfs(true, false);
    expect(await getDeviceStorageKeyStatus()).toBe('no-device-auth');
  });

  it('reports set-up rather than no-device-auth once a key already exists, even without a platform authenticator now', async () => {
    // A passcode set at enrollment time and removed later is wrapper 1
    // breaking (RFC 0093 §3's recovery path) — not the same situation as
    // never having enrolled, so an existing key must not flip back to a
    // "can't create" state.
    stubWebAuthnAndOpfs(true, true);
    await saveWrappedDeviceStorageKeys({ prfWrapped, prfCredentialId, recoveryWrapped });

    const PublicKeyCredentialStub = function PublicKeyCredential() {};
    const isAvailable = vi.fn().mockResolvedValue(false);
    PublicKeyCredentialStub.isUserVerifyingPlatformAuthenticatorAvailable = isAvailable;
    vi.stubGlobal('PublicKeyCredential', PublicKeyCredentialStub);

    expect(await getDeviceStorageKeyStatus()).toBe('set-up');
    expect(isAvailable).not.toHaveBeenCalled();
  });
});
