/**
 * Encrypted key-value storage for the `device-only` tier, web/PWA (RFC 0093
 * §1, task 8.20) — the actual data-at-rest primitive everything else in this
 * module family exists to protect. `device-only-storage.ts` persists the
 * *wrapped key*; `device-only-session.ts` turns that into a usable, in-memory
 * *unwrapped key*; this module is the first thing that actually uses that key
 * to encrypt and store a plugin's own data.
 *
 * **Scope note, stated plainly rather than left implicit:** RFC 0093 §1 specs
 * the web backend as OPFS + `wa-sqlite` (`OPFSCoopSyncVFS`) — a real
 * relational engine, for plugins that need one. This module is not that. It
 * is a smaller, immediately-buildable primitive: one AES-GCM-encrypted file
 * per key, in a per-plugin OPFS subdirectory, in the same spirit as
 * `offline.ts`'s IndexedDB-backed key/value cache for the `offline-first`
 * tier. A plugin that genuinely needs SQL (joins, indices, transactions
 * across records) is not served by this module — that gap is real and
 * tracked as remaining `device-only` tier work, not solved here. A plugin
 * that needs "durable, encrypted, per-record device-local storage" (the
 * common case — notes, entries, settings) is fully served by this module
 * today.
 *
 * **Key names are not encrypted, only values.** A file's name on disk is a
 * reversible encoding of its plaintext key string (so `listDeviceOnlyKeys`
 * can return real key strings without needing the unlocked key just to
 * list), not ciphertext. Anyone with raw filesystem access to the OPFS
 * origin directory (already a narrow threat — same-origin script, or local
 * disk access on the user's own machine) can see a plugin's key *names* and
 * how many entries it has, without the Device Storage Key. They cannot read
 * any value. This mirrors `offline.ts`'s own unencrypted keys and is an
 * accepted, documented scope boundary, not an oversight.
 *
 * **Every read and write needs the unlocked key, unlike native Keychain.**
 * `device-only-storage.ts`'s own doc comments note the iOS/Android asymmetry
 * (Keychain gates reads only; Keystore gates both). This web implementation
 * is closer to Android's shape than iOS's: WebCrypto has no hardware path
 * that encrypts/decrypts without the raw key material ever reaching JS, so
 * `setDeviceOnlyValue` needs a live, unlocked session exactly as much as
 * `getDeviceOnlyValue` does — there is no cheaper "just write, no prompt"
 * path here the way native Keychain gets for free.
 */

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
 * Remove this plugin's value for `key`. No-op if it was never set. Needs no
 * unlocked key — deleting a file requires no decryption, matching
 * `clearWrappedDeviceStorageKeys`'s own no-prompt precedent.
 */
export async function deleteDeviceOnlyValue(pluginId: string, key: string): Promise<void> {
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
 * `setDeviceOnlyValue`). Needs no unlocked key — see the module doc comment
 * on key names not being encrypted.
 */
export async function listDeviceOnlyKeys(pluginId: string): Promise<string[]> {
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
 * Remove every value this plugin has stored — e.g. on uninstall, or a
 * user-initiated "delete my device-only data" action. Needs no unlocked key,
 * same reasoning as `deleteDeviceOnlyValue`.
 */
export async function clearDeviceOnlyPluginData(pluginId: string): Promise<void> {
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
