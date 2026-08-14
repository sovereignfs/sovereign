/**
 * Encrypted key-value storage for the `device-only` tier (RFC 0093 §1, task
 * 8.20) — the actual data-at-rest primitive everything else in this module
 * family exists to protect. `device-only-storage.ts` persists the *wrapped
 * key*; `device-only-session.ts` turns that into a usable, in-memory
 * *unwrapped key*; this module is the first thing that actually uses that key
 * to encrypt and store a plugin's own data. Two independent backends, chosen
 * per call by `supports('secureStorage')` (`@sovereignfs/sdk/device-client`
 * — the same check `isDeviceOnlyTierAvailable()` uses):
 *
 * - **Native (Capacitor)**: every function below routes straight through
 *   `sdk.device.secureStorage.*` — `sovereign-mobile`'s `SecureDatabase.swift`/
 *   `SecureDatabase.java`, a real SQLCipher database gated by the OS's own
 *   biometric-or-passcode prompt. No JS-side encryption happens on this path
 *   at all: the whole point of that native design is that the database file
 *   itself is the encryption boundary, so a value passed to `secureStorage.set`
 *   goes over the bridge as plain JSON and SQLCipher encrypts it at rest —
 *   adding a second, redundant app-level AES-GCM layer on top (the way the
 *   web path below needs to) would protect nothing further and would need a
 *   `CryptoKey` this path never has, since `getUnlockedDeviceStorageKey()`
 *   (web/PWA-only PRF derivation) is never called here.
 * - **Web/PWA**: OPFS, as originally designed — see below.
 *
 * **Web/PWA scope note, stated plainly rather than left implicit:** RFC 0093
 * §1 specs the web backend as OPFS + `wa-sqlite` (`OPFSCoopSyncVFS`) — a real
 * relational engine, for plugins that need one. This module's web path is
 * not that. It is a smaller, immediately-buildable primitive: one
 * AES-GCM-encrypted file per key, in a per-plugin OPFS subdirectory, in the
 * same spirit as `offline.ts`'s IndexedDB-backed key/value cache for the
 * `offline-first` tier. A plugin that genuinely needs SQL (joins, indices,
 * transactions across records) is not served by either backend today —
 * that gap is real and tracked as remaining `device-only` tier work, not
 * solved here. A plugin that needs "durable, encrypted, per-record
 * device-local storage" (the common case — notes, entries, settings) is
 * fully served by this module, on both platforms, today.
 *
 * **Key names are not encrypted, only values — web path only.** A file's
 * name on disk is a reversible encoding of its plaintext key string (so
 * `listDeviceOnlyKeys` can return real key strings without needing the
 * unlocked key just to list), not ciphertext. Anyone with raw filesystem
 * access to the OPFS origin directory (already a narrow threat —
 * same-origin script, or local disk access on the user's own machine) can
 * see a plugin's key *names* and how many entries it has, without the
 * Device Storage Key. They cannot read any value. This mirrors `offline.ts`'s
 * own unencrypted keys and is an accepted, documented scope boundary, not an
 * oversight. Native has no equivalent gap: `secureStorage.keys()` itself
 * needs the database open (see the next paragraph), so even key *names* are
 * gated there.
 *
 * **Every operation needs the unlocked key on both backends, but for
 * different reasons.** Web: WebCrypto has no hardware path that
 * encrypts/decrypts without the raw key material ever reaching JS, so
 * `setDeviceOnlyValue` needs a live, unlocked session exactly as much as
 * `getDeviceOnlyValue` does — there is no cheaper "just write, no prompt"
 * path here the way native Keychain gets for free at the *item* level.
 * Native: opening the SQLCipher database at all (for *any* operation,
 * including `keys`/`delete`) needs the database key, which needs the OS
 * prompt — a stricter, file-level version of the same requirement,
 * documented in `SecureDatabase.swift`'s own doc comment. `deleteDeviceOnlyValue`/
 * `listDeviceOnlyKeys`/`clearDeviceOnlyPluginData` below silently swallow a
 * native auth failure rather than surfacing it (matching their existing,
 * web-path "no-op on failure" contract, stated per-function below) — this is
 * a real, accepted behavior difference from `getDeviceOnlyValue`/
 * `setDeviceOnlyValue`, which do surface it, not an oversight.
 */

import { secureStorage, supports } from './device-client';
import { fromBase64Url, toBase64Url } from './device-only-crypto';
import { isOpfsAvailable } from './device-only-storage';
import { getUnlockedDeviceStorageKey } from './device-only-session';
import type { UnlockDeviceStorageKeyResult } from './device-only-session';

const DIRECTORY_NAME = 'sovereign-device-only';
const DATA_DIRECTORY_NAME = 'data';
const FILE_SUFFIX = '.bin';
const AES_GCM_IV_BYTES = 12;

/** Every non-`'ok'` outcome `getUnlockedDeviceStorageKey()` can produce, re-surfaced unchanged by every function below that needs a live key. */
export type DeviceOnlyKvError = Exclude<UnlockDeviceStorageKeyResult, { status: 'ok' }>;

export type DeviceOnlyKvGetResult<T> = { status: 'ok'; value: T | undefined } | DeviceOnlyKvError;
export type DeviceOnlyKvSetResult = { status: 'ok' } | DeviceOnlyKvError;

function isNotFound(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'NotFoundError';
}

/**
 * `secureStorage`'s `DeviceResult` non-`'ok'` statuses (`'unavailable' |
 * 'denied' | 'dismissed' | 'failed'`, `@sovereignfs/sdk/device-bridge`),
 * re-shaped into this module's own `DeviceOnlyKvError` union so
 * `getDeviceOnlyValue`/`setDeviceOnlyValue`'s native and web paths return
 * the identically-shaped error to their caller. `'unavailable'` maps to
 * `'no-device-auth'`, not `'unsupported'` — reaching this function at all
 * already means `supports('secureStorage')` was true, so the tier itself is
 * supported; `'unavailable'` from the bridge specifically means
 * `canUseDeviceAuth()` failed on the native side (no passcode/biometric
 * enrolled), matching `SecureStorage.swift`/`SecureStorage.java`'s own use
 * of that status for exactly that condition. `'denied'` has no native
 * `secureStorage` caller today (only `'ok' | 'unavailable' | 'dismissed' |
 * 'failed'` are ever actually returned) but is handled for the type's own
 * completeness, folded into `'failed'`.
 */
function nativeErrorToKvError(
  status: 'unavailable' | 'denied' | 'dismissed' | 'failed',
  error?: string,
): DeviceOnlyKvError {
  switch (status) {
    case 'unavailable':
      return { status: 'no-device-auth' };
    case 'dismissed':
      return { status: 'cancelled' };
    case 'denied':
    case 'failed':
      return { status: 'failed', error: error ?? 'Something went wrong. Please try again.' };
  }
}

/**
 * `FileSystemDirectoryHandle.keys()` (File System Access API) is broadly
 * supported at runtime but missing from this TS toolchain's `lib.dom.d.ts` —
 * a lib-version gap, not a real capability question. Narrow, local
 * augmentation rather than widening `FileSystemDirectoryHandle` everywhere.
 */
interface AsyncIterableDirectoryHandle extends FileSystemDirectoryHandle {
  keys(): AsyncIterableIterator<string>;
}

async function getPluginDirectory(
  pluginId: string,
  create: boolean,
): Promise<FileSystemDirectoryHandle> {
  const root = await navigator.storage.getDirectory();
  const base = await root.getDirectoryHandle(DIRECTORY_NAME, { create });
  const data = await base.getDirectoryHandle(DATA_DIRECTORY_NAME, { create });
  return data.getDirectoryHandle(pluginId, { create });
}

/** Base64url of the key's UTF-8 bytes — filesystem-safe and reversible, see the module doc comment on key names. */
function fileNameForKey(key: string): string {
  return toBase64Url(new TextEncoder().encode(key)) + FILE_SUFFIX;
}

function keyForFileName(fileName: string): string {
  const encoded = fileName.slice(0, -FILE_SUFFIX.length);
  return new TextDecoder().decode(fromBase64Url(encoded));
}

async function encryptValue(value: unknown, key: CryptoKey): Promise<Uint8Array> {
  const iv = crypto.getRandomValues(new Uint8Array(AES_GCM_IV_BYTES));
  const plaintext = new TextEncoder().encode(JSON.stringify(value));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: iv as BufferSource },
      key,
      plaintext as BufferSource,
    ),
  );
  const out = new Uint8Array(iv.length + ciphertext.length);
  out.set(iv, 0);
  out.set(ciphertext, iv.length);
  return out;
}

async function decryptValue<T>(bytes: Uint8Array, key: CryptoKey): Promise<T> {
  const iv = bytes.slice(0, AES_GCM_IV_BYTES);
  const ciphertext = bytes.slice(AES_GCM_IV_BYTES);
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    ciphertext as BufferSource,
  );
  return JSON.parse(new TextDecoder().decode(plaintext)) as T;
}

/**
 * Read this plugin's decrypted value for `key`. `value: undefined` means
 * never written (or removed) — distinguished from the various non-`'ok'`
 * statuses (locked, not set up, unsupported, etc.), which mean the read
 * could not even be attempted.
 */
export async function getDeviceOnlyValue<T>(
  pluginId: string,
  key: string,
): Promise<DeviceOnlyKvGetResult<T>> {
  if (supports('secureStorage')) {
    const result = await secureStorage.get<T>(pluginId, key);
    if (result.status === 'ok') return { status: 'ok', value: result.value ?? undefined };
    return nativeErrorToKvError(
      result.status,
      result.status === 'failed' ? result.error : undefined,
    );
  }

  const unlocked = await getUnlockedDeviceStorageKey();
  if (unlocked.status !== 'ok') return unlocked;

  let dir: FileSystemDirectoryHandle;
  try {
    dir = await getPluginDirectory(pluginId, false);
  } catch (err) {
    if (isNotFound(err)) return { status: 'ok', value: undefined };
    throw err;
  }
  let fileHandle: FileSystemFileHandle;
  try {
    fileHandle = await dir.getFileHandle(fileNameForKey(key));
  } catch (err) {
    if (isNotFound(err)) return { status: 'ok', value: undefined };
    throw err;
  }
  const file = await fileHandle.getFile();
  const bytes = new Uint8Array(await file.arrayBuffer());
  const value = await decryptValue<T>(bytes, unlocked.key);
  return { status: 'ok', value };
}

/** Encrypt and write/replace this plugin's value for `key`. */
export async function setDeviceOnlyValue(
  pluginId: string,
  key: string,
  value: unknown,
): Promise<DeviceOnlyKvSetResult> {
  if (supports('secureStorage')) {
    const result = await secureStorage.set(pluginId, key, value);
    if (result.status === 'ok') return { status: 'ok' };
    return nativeErrorToKvError(
      result.status,
      result.status === 'failed' ? result.error : undefined,
    );
  }

  const unlocked = await getUnlockedDeviceStorageKey();
  if (unlocked.status !== 'ok') return unlocked;

  const dir = await getPluginDirectory(pluginId, true);
  const fileHandle = await dir.getFileHandle(fileNameForKey(key), { create: true });
  const bytes = await encryptValue(value, unlocked.key);
  const writable = await fileHandle.createWritable();
  try {
    await writable.write(bytes as BufferSource);
  } finally {
    await writable.close();
  }
  return { status: 'ok' };
}

/**
 * Remove this plugin's value for `key`. No-op if it was never set, or if
 * the native prompt is dismissed/fails — this function has no error channel
 * to report either through, matching the web path's own no-prompt-needed,
 * can't-really-fail shape (see the module doc comment's note on this being
 * a deliberate, stated asymmetry with `getDeviceOnlyValue`/`setDeviceOnlyValue`,
 * not an oversight).
 */
export async function deleteDeviceOnlyValue(pluginId: string, key: string): Promise<void> {
  if (supports('secureStorage')) {
    await secureStorage.remove(pluginId, key);
    return;
  }
  if (!isOpfsAvailable()) return;
  try {
    const dir = await getPluginDirectory(pluginId, false);
    await dir.removeEntry(fileNameForKey(key));
  } catch (err) {
    if (!isNotFound(err)) throw err;
  }
}

/**
 * List every key this plugin has stored (unprefixed — as passed to
 * `setDeviceOnlyValue`). On web, needs no unlocked key — see the module doc
 * comment on key names not being encrypted there. On native, still needs
 * the database open (and so can still prompt/fail) — a native auth failure
 * here is swallowed to an empty list rather than surfaced, same no-error
 * -channel reasoning as `deleteDeviceOnlyValue` above.
 */
export async function listDeviceOnlyKeys(pluginId: string): Promise<string[]> {
  if (supports('secureStorage')) {
    const result = await secureStorage.keys(pluginId);
    return result.status === 'ok' ? result.value : [];
  }
  if (!isOpfsAvailable()) return [];
  let dir: FileSystemDirectoryHandle;
  try {
    dir = await getPluginDirectory(pluginId, false);
  } catch (err) {
    if (isNotFound(err)) return [];
    throw err;
  }
  const keys: string[] = [];
  for await (const name of (dir as AsyncIterableDirectoryHandle).keys()) {
    keys.push(keyForFileName(name));
  }
  return keys;
}

/**
 * List every plugin id that has stored at least one `device-only` value on
 * this device — e.g. for `device-only-export.ts` to know which plugins to
 * include in a full-device export without needing a separate registry of
 * "which plugins have used this store." Needs no unlocked key, same
 * reasoning as `listDeviceOnlyKeys`.
 *
 * **Web/OPFS only — deliberately not extended to native, unlike every other
 * function in this module.** The `secureStorage` bridge capability has no
 * "list every plugin id that has stored something" operation; each op is
 * scoped to one `pluginId` the caller already knows, by design (RFC 0083's
 * capability contract has no concept of enumerating another plugin's
 * namespace). Adding one would mean a new bridge capability op, native code
 * in `sovereign-mobile` to implement it, and a real design question this
 * function's web implementation never had to answer (should *any* plugin be
 * able to enumerate every other plugin's presence in the store, or only an
 * account-level surface?) — out of scope here. In practice this only
 * affects `device-only-export.ts`'s full-device export/import, which
 * already only offers itself on the web/PWA path today (see
 * `DeviceStorageKeySection.tsx`'s native branch, which does not render
 * export/import at all) — so this gap is already fully masked by an
 * existing, separately-documented scope boundary, not a silent one.
 */
export async function listDeviceOnlyPluginIds(): Promise<string[]> {
  if (!isOpfsAvailable()) return [];
  let data: FileSystemDirectoryHandle;
  try {
    const root = await navigator.storage.getDirectory();
    const base = await root.getDirectoryHandle(DIRECTORY_NAME, { create: false });
    data = await base.getDirectoryHandle(DATA_DIRECTORY_NAME, { create: false });
  } catch (err) {
    if (isNotFound(err)) return [];
    throw err;
  }
  const pluginIds: string[] = [];
  for await (const name of (data as AsyncIterableDirectoryHandle).keys()) {
    pluginIds.push(name);
  }
  return pluginIds;
}

/**
 * Remove every value this plugin has stored — e.g. on uninstall, or a
 * user-initiated "delete my device-only data" action. On web, needs no
 * unlocked key, same reasoning as `deleteDeviceOnlyValue`; on native, same
 * swallow-failure-to-no-op reasoning applies too.
 */
export async function clearDeviceOnlyPluginData(pluginId: string): Promise<void> {
  if (supports('secureStorage')) {
    await secureStorage.clear(pluginId);
    return;
  }
  if (!isOpfsAvailable()) return;
  try {
    const root = await navigator.storage.getDirectory();
    const base = await root.getDirectoryHandle(DIRECTORY_NAME, { create: false });
    const data = await base.getDirectoryHandle(DATA_DIRECTORY_NAME, { create: false });
    await data.removeEntry(pluginId, { recursive: true });
  } catch (err) {
    if (!isNotFound(err)) throw err;
  }
}
