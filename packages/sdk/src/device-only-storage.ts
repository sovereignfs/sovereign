/**
 * OPFS-backed persistence for the `device-only` offline tier's wrapped
 * Device Storage Key material (RFC 0093 §1, §3) — web only. Deliberately
 * **not** IndexedDB: RFC 0093 §1 puts the actual OPFS-encrypted database on
 * the Origin Private File System specifically because IndexedDB is
 * evictable everywhere it was tested (research 0008), and the wrapped-key
 * ciphertext this module stores needs the exact same durability guarantee
 * the data itself gets — storing the key in IndexedDB while the data it
 * protects lives in OPFS would quietly reintroduce the eviction problem
 * this RFC exists to solve, just one layer removed.
 *
 * Stores both wrappers from RFC 0093 §3's key-slot design (wrapper 1, PRF;
 * wrapper 2, recovery secret) as a single JSON file, so a read/write is
 * atomic with respect to both — no window where one wrapper is updated and
 * the other isn't. Crypto lives in `device-only-crypto.ts`; this module
 * only moves already-encrypted bytes to and from disk and never sees
 * plaintext key material.
 */

import {
  isUserVerifyingPlatformAuthenticatorAvailable,
  isWebAuthnAvailable,
} from './device-only-crypto';
import type {
  PrfWrappedDeviceStorageKey,
  RecoveryWrappedDeviceStorageKey,
} from './device-only-crypto';

const DIRECTORY_NAME = 'sovereign-device-only';
const FILE_NAME = 'device-storage-key.json';
const RE_LOCK_POLICY_FILE_NAME = 're-lock-policy.json';

/** Both wrappers, as persisted together. Either may be absent — e.g. the recovery wrapper is written once at setup and the PRF wrapper is replaced on re-enrollment, but a caller who only has one on hand should pass the other through unchanged rather than dropping it. */
export interface WrappedDeviceStorageKeys {
  prfWrapped: PrfWrappedDeviceStorageKey | null;
  /** Base64url `rawId` of the passkey `prfWrapped` was wrapped with (`toBase64Url` from `device-only-crypto.ts`). Persisted so a later `deriveDeviceOnlyKeyViaPrf(credentialId)` call can target this exact credential — without it, a device with more than one passkey (e.g. this one plus a login passkey) would show an ambiguous picker on every unlock instead of deriving deterministically. Replaced together with `prfWrapped` on re-enrollment. */
  prfCredentialId: string | null;
  recoveryWrapped: RecoveryWrappedDeviceStorageKey | null;
}

/** Whether this browser supports the Origin Private File System at all. */
export function isOpfsAvailable(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    typeof navigator.storage !== 'undefined' &&
    typeof navigator.storage.getDirectory === 'function'
  );
}

/**
 * Request eviction-exempt storage (RFC 0093 §1: "requested at setup"). A
 * request, not a guarantee — the browser may deny it based on its own
 * heuristics (RFC 0093 §6). Callers must handle `false` by telling the
 * user plainly, not by silently proceeding as if it were granted.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  if (typeof navigator === 'undefined' || typeof navigator.storage?.persist !== 'function') {
    return false;
  }
  return navigator.storage.persist();
}

async function getDeviceOnlyDirectory(create: boolean): Promise<FileSystemDirectoryHandle> {
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle(DIRECTORY_NAME, { create });
}

/** Write both wrappers, replacing whatever was there before. */
export async function saveWrappedDeviceStorageKeys(keys: WrappedDeviceStorageKeys): Promise<void> {
  if (!isOpfsAvailable()) {
    throw new Error('OPFS is not available in this environment.');
  }
  const dir = await getDeviceOnlyDirectory(true);
  const fileHandle = await dir.getFileHandle(FILE_NAME, { create: true });
  const writable = await fileHandle.createWritable();
  try {
    await writable.write(JSON.stringify(keys));
  } finally {
    await writable.close();
  }
}

/** Read both wrappers, or all-null fields if nothing has been set up yet. */
export async function loadWrappedDeviceStorageKeys(): Promise<WrappedDeviceStorageKeys> {
  const empty: WrappedDeviceStorageKeys = {
    prfWrapped: null,
    prfCredentialId: null,
    recoveryWrapped: null,
  };
  if (!isOpfsAvailable()) {
    return empty;
  }
  let dir: FileSystemDirectoryHandle;
  try {
    dir = await getDeviceOnlyDirectory(false);
  } catch (err) {
    if (isNotFound(err)) return empty;
    throw err;
  }
  let fileHandle: FileSystemFileHandle;
  try {
    fileHandle = await dir.getFileHandle(FILE_NAME);
  } catch (err) {
    if (isNotFound(err)) return empty;
    throw err;
  }
  const file = await fileHandle.getFile();
  const text = await file.text();
  const parsed = JSON.parse(text) as Partial<WrappedDeviceStorageKeys>;
  return {
    prfWrapped: parsed.prfWrapped ?? null,
    prfCredentialId: parsed.prfCredentialId ?? null,
    recoveryWrapped: parsed.recoveryWrapped ?? null,
  };
}

/**
 * Remove the wrapped-key file — the "Forget Device Storage Key" action. No-op
 * if nothing was ever set up. Deliberately scoped to just this one file, not
 * the whole `sovereign-device-only` directory: the re-lock policy preference
 * lives alongside it in the same directory and is a separate, independently-
 * meaningful setting (RFC 0093 §2) that a user forgetting their key — while
 * staying on this device — has no reason to lose. A future full sign-out/purge
 * flow that *should* wipe every device-only preference, not just the key,
 * needs its own function rather than overloading this one.
 */
export async function clearWrappedDeviceStorageKeys(): Promise<void> {
  if (!isOpfsAvailable()) return;
  try {
    const dir = await getDeviceOnlyDirectory(false);
    await dir.removeEntry(FILE_NAME);
  } catch (err) {
    if (!isNotFound(err)) throw err;
  }
}

function isNotFound(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'NotFoundError';
}

/**
 * How long the app may sit backgrounded before the in-memory Device Storage
 * Key must be discarded and re-derived via a fresh ceremony (RFC 0093 §2,
 * "Re-lock policy: timed, by default, with a user override"). `'immediate'`
 * discards on every backgrounding; the others are a window of leniency.
 * Applies identically to native and web (RFC 0093 §2) — deliberately not
 * left to iOS's own habit of discarding the JS execution context on
 * backgrounding, since Android does not do the same and a policy that only
 * holds on one platform by accident is not actually a policy.
 *
 * This module only persists the *preference*. Enforcing it — tracking when
 * the app was last backgrounded, discarding the derived key from memory,
 * forcing re-derivation past the window — is the concern of whichever code
 * actually holds the derived key while a `device-only` plugin is open, not
 * this module.
 */
export type ReLockPolicy = 'immediate' | '1m' | '5m' | '15m' | '1h';

/**
 * Milliseconds of backgrounded leniency for each timed policy. `'immediate'`
 * is excluded rather than mapped to `0` — "no window" and "a zero-length
 * window" read as the same behavior to an enforcement implementation, but
 * keeping them distinct in the type system means a future caller can't
 * accidentally treat an unmapped `'immediate'` as a bug.
 */
export const RE_LOCK_POLICY_WINDOW_MS: Record<Exclude<ReLockPolicy, 'immediate'>, number> = {
  '1m': 60_000,
  '5m': 5 * 60_000,
  '15m': 15 * 60_000,
  '1h': 60 * 60_000,
};

/**
 * RFC 0093 §2 leaves the exact default duration as "an implementation
 * detail, not a design question." Five minutes balances "meaningfully more
 * forgiving than immediate" against "still short enough to matter" for a
 * device that is genuinely out of the user's hands.
 */
export const DEFAULT_RE_LOCK_POLICY: ReLockPolicy = '5m';

/** Persist the user's re-lock policy choice for this device. */
export async function saveReLockPolicy(policy: ReLockPolicy): Promise<void> {
  if (!isOpfsAvailable()) {
    throw new Error('OPFS is not available in this environment.');
  }
  const dir = await getDeviceOnlyDirectory(true);
  const fileHandle = await dir.getFileHandle(RE_LOCK_POLICY_FILE_NAME, { create: true });
  const writable = await fileHandle.createWritable();
  try {
    await writable.write(JSON.stringify({ policy }));
  } finally {
    await writable.close();
  }
}

/** Read the user's re-lock policy choice, or `DEFAULT_RE_LOCK_POLICY` if never set or unavailable. */
export async function loadReLockPolicy(): Promise<ReLockPolicy> {
  if (!isOpfsAvailable()) {
    return DEFAULT_RE_LOCK_POLICY;
  }
  let dir: FileSystemDirectoryHandle;
  try {
    dir = await getDeviceOnlyDirectory(false);
  } catch (err) {
    if (isNotFound(err)) return DEFAULT_RE_LOCK_POLICY;
    throw err;
  }
  let fileHandle: FileSystemFileHandle;
  try {
    fileHandle = await dir.getFileHandle(RE_LOCK_POLICY_FILE_NAME);
  } catch (err) {
    if (isNotFound(err)) return DEFAULT_RE_LOCK_POLICY;
    throw err;
  }
  const file = await fileHandle.getFile();
  const text = await file.text();
  const parsed = JSON.parse(text) as Partial<{ policy: ReLockPolicy }>;
  return parsed.policy ?? DEFAULT_RE_LOCK_POLICY;
}

/**
 * Whether *this device's web/PWA path* can offer the `device-only` tier at
 * all (`'unsupported'`), has the environment but nothing enrolled to create
 * the key with (`'no-device-auth'`), has everything needed but no key yet
 * (`'not-set-up'`), or is ready to use (`'set-up'`). The single check every
 * `device-only` plugin needs before rendering its own content — extracted
 * here so each plugin's own gating code (and `DeviceStorageKeySection.tsx`'s
 * own status display in Account → Security) doesn't re-derive it slightly
 * differently. Feed the result into `DeviceStorageKeyGate` (`@sovereignfs/ui`).
 *
 * `'no-device-auth'` (RFC 0093 §5, epic task 1.22's hard-block case) is
 * checked only when nothing is set up yet — a device that already has a key
 * stays `'set-up'` regardless, since that check answers "can a *new* key be
 * created here," not "can the existing one still be unlocked" (a passcode
 * removed after enrollment is wrapper 1 breaking, RFC 0093 §3's recovery
 * path — a different situation from never having enrolled at all).
 *
 * Web/PWA only, matching this module's own scope (see the module doc
 * comment) — a native shell's Keychain/Keystore custody path (RFC 0093 §2)
 * answers the same question through `@sovereignfs/sdk/device-client`'s
 * `secureStorage` capability instead, not this function.
 */
export type DeviceStorageKeyStatus = 'unsupported' | 'no-device-auth' | 'not-set-up' | 'set-up';

export async function getDeviceStorageKeyStatus(): Promise<DeviceStorageKeyStatus> {
  if (!isWebAuthnAvailable() || !isOpfsAvailable()) {
    return 'unsupported';
  }
  const keys = await loadWrappedDeviceStorageKeys();
  if (keys.prfWrapped && keys.recoveryWrapped) {
    return 'set-up';
  }
  if (!(await isUserVerifyingPlatformAuthenticatorAvailable())) {
    return 'no-device-auth';
  }
  return 'not-set-up';
}
