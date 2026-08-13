/**
 * Browser-only, plugin-scoped key/value cache backing offline-capable plugins
 * (RFC 0074, manifest `offline: true` per RFC 0078). Lets a client component
 * render immediately from the last-cached value with no network, then mirror
 * a fresh read back in for next time.
 *
 * **Isolation model:** entries live in a single shared IndexedDB database,
 * namespaced per plugin id (a plugin passes its own manifest `id` — it
 * already knows this statically, the same way it knows its own
 * `routePrefix`). There is deliberately no per-user keying inside this
 * module: an offline route's own SSR output must never carry per-user data
 * (it is precached and could be replayed to a different user on a shared
 * device — see RFC 0074 "user-neutral shell"), so there is no safe
 * client-side signal to key by user identity in the first place. Isolation
 * across a login boundary is instead the caller's responsibility: the
 * runtime clears this store on every logout/user-switch (`clearAll`), so no
 * cached value ever survives past the session that wrote it.
 *
 * v1 is read/write-local only — no server sync, no conflict resolution.
 * Writes made while offline are not queued (deferred to a future RFC).
 *
 * **Encrypted at rest (RFC 0093 task 8.20), no presence required.** Every
 * value is AES-GCM-encrypted under `offline-device-key.ts`'s own
 * automatically-generated, non-extractable device key before it reaches
 * IndexedDB — silent, zero UX cost, no enrollment step, unlike
 * `device-only`'s presence-gated Device Storage Key. This protects against
 * other apps and casual filesystem access, not against another script
 * running on this same origin (the key is a non-extractable `CryptoKey`
 * releasable to any script here, same limitation `e2ee-device.ts`'s own key
 * has and for the same reason: WebCrypto has no per-script isolation
 * primitive to do better with). **Narrows accepted values to
 * JSON-serializable data** — encryption requires byte-serializing the
 * value first, so the structured-clone extras IndexedDB natively supports
 * (`Blob`, `Map`, etc.) no longer round-trip through `set`. No shipped
 * caller relies on that today; `checkEntrySize`'s own `JSON.stringify`
 * estimate already treated JSON as the primary case. A value written before
 * this change (unencrypted, since nothing wrapped it) fails to decrypt and
 * `get` returns `null` for it — a cache miss, not a thrown error, since
 * this cache is disposable by design (the server is the source of truth).
 */

import { getOrCreateOfflineDeviceKey } from './offline-device-key';

const DB_NAME = 'sovereign-offline';
const DB_VERSION = 1;
const STORE_NAME = 'kv';
const AES_GCM_IV_BYTES = 12;

/** On-disk shape for every entry — ciphertext plus the IV needed to decrypt it. */
interface EncryptedEntry {
  iv: Uint8Array;
  data: ArrayBuffer;
}

async function encryptEntry(value: unknown): Promise<EncryptedEntry> {
  const key = await getOrCreateOfflineDeviceKey();
  const iv = crypto.getRandomValues(new Uint8Array(AES_GCM_IV_BYTES));
  const plaintext = new TextEncoder().encode(JSON.stringify(value));
  const data = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    plaintext as BufferSource,
  );
  return { iv, data };
}

/**
 * Returns `null` rather than throwing for anything that doesn't decrypt —
 * covers both a genuinely corrupt entry and, deliberately, a value written
 * before encryption shipped (unwrapped, so it fails the shape check below
 * before decryption is even attempted). Both cases resolve the same way a
 * plugin already handles "never cached": fetch fresh.
 */
async function decryptEntry<T>(entry: unknown): Promise<T | null> {
  if (
    typeof entry !== 'object' ||
    entry === null ||
    !(entry as Partial<EncryptedEntry>).iv ||
    !(entry as Partial<EncryptedEntry>).data
  ) {
    return null;
  }
  const { iv, data } = entry as EncryptedEntry;
  try {
    const key = await getOrCreateOfflineDeviceKey();
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv as BufferSource },
      key,
      data,
    );
    return JSON.parse(new TextDecoder().decode(plaintext)) as T;
  } catch {
    return null;
  }
}

/**
 * Composite key as a native IndexedDB array key — `[pluginId, key]` — rather
 * than a delimiter-joined string. Array keys compare element-by-element, so
 * there is no delimiter for a plugin id or cache key to collide with (the
 * manifest schema places no format restriction on plugin `id` beyond
 * non-empty, so a delimiter-based scheme could not actually guarantee
 * isolation between plugins).
 */
function compositeKey(pluginId: string, key: string): [string, string] {
  return [pluginId, key];
}

/**
 * Range covering every `[pluginId, *]` entry. Per IndexedDB's key-type
 * ordering, Array sorts after String, and a shorter array sorts before a
 * longer array sharing the same prefix — so `[pluginId]` is less than every
 * `[pluginId, <any string>]`, and `[pluginId, []]` (array in the second
 * position) is greater than every `[pluginId, <any string>]`, regardless of
 * the string's content. That gives an exact, delimiter-free prefix range.
 */
function pluginKeyRange(pluginId: string): IDBKeyRange {
  return IDBKeyRange.bound([pluginId], [pluginId, []], false, true);
}

/**
 * Thrown by `set` when a value is rejected for size, either by the soft cap
 * below (checked before the write is attempted) or by the browser's own
 * origin storage quota (surfaced from IndexedDB's `QuotaExceededError`,
 * which — since every plugin shares one IndexedDB database on one origin —
 * could otherwise be exhausted by any other plugin's writes, not just this
 * one's). Named so callers can `instanceof`-check it instead of parsing an
 * opaque `DOMException` message.
 */
export class OfflineQuotaExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OfflineQuotaExceededError';
  }
}

/**
 * Soft per-entry cap, checked before attempting the write. Not a real
 * platform limit (IndexedDB's actual quota is browser- and disk-dependent),
 * but this cache has no eviction policy — `set` never expires or LRU-evicts
 * old entries — so an unbounded write is a slow path to exhausting the
 * shared-with-every-plugin origin quota with no warning until some later,
 * unrelated write fails. Failing fast here gives an immediate, actionable
 * error instead. Estimated via `JSON.stringify`, which is now the actual
 * on-disk representation (see the module doc comment on encryption
 * narrowing accepted values to JSON-serializable data) rather than just an
 * estimate of what IndexedDB's structured clone would store — a value that
 * fails to `JSON.stringify` here skips this soft-cap check but then fails
 * for the same reason inside `encryptEntry`, so `set` still surfaces it,
 * just from a different, less specific error than this one.
 */
const MAX_ENTRY_BYTES = 5 * 1024 * 1024;

function checkEntrySize(value: unknown): void {
  let json: string | undefined;
  try {
    json = JSON.stringify(value);
  } catch {
    return; // not JSON-serializable — can't estimate, skip the soft cap.
  }
  if (json !== undefined && json.length > MAX_ENTRY_BYTES) {
    throw new OfflineQuotaExceededError(
      `offline.set: value exceeds the ${MAX_ENTRY_BYTES}-byte soft cap (~${json.length} bytes). Store a smaller slice of data, or split it across multiple keys.`,
    );
  }
}

function openDb(): Promise<IDBDatabase> {
  ensureTabState();
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Failed to open IndexedDB.'));
  });
}

/**
 * Bumped by `clearAll`. `set` captures the epoch before it starts writing
 * and re-checks it just before committing; if a logout's `clearAll` ran in
 * between, the write is dropped instead of silently resurrecting the
 * outgoing session's data right after the purge that was supposed to remove
 * it. Covers same-tab races outright; cross-tab races are covered by
 * `clearChannel` below, which bumps this same counter when another tab
 * broadcasts a clear.
 */
let epoch = 0;

/**
 * The epoch guard above only protects a write against a `clearAll` in its
 * *own* tab — a second tab has its own JS runtime and never sees the first
 * tab's in-memory `epoch` increment. `BroadcastChannel` closes that gap:
 * every tab that has touched this module subscribes, and `clearAll` posts
 * to every other subscriber so their local `epoch` bumps within the same
 * task turn a write would next check it. Falls back to same-tab-only
 * protection in environments without `BroadcastChannel`.
 */
const CLEAR_CHANNEL_NAME = 'sovereign-offline-clear';
let clearChannel: BroadcastChannel | null = null;

/**
 * localStorage flag marking a `clearAll` that started but did not finish
 * (thrown IndexedDB error, tab closed mid-purge). Retried the next time any
 * tab touches this module, so a purge failure during sign-in doesn't
 * silently leave a previous session's data behind indefinitely — see
 * `runtime/src/complete-sign-in.ts`, which purges best-effort and must not
 * block navigation on failure.
 */
const PENDING_PURGE_KEY = 'sovereign:offline-purge-pending';

function markPurgePending(): void {
  try {
    localStorage.setItem(PENDING_PURGE_KEY, '1');
  } catch {
    // best-effort — e.g. localStorage disabled/full; nothing further to do.
  }
}

function clearPurgePending(): void {
  try {
    localStorage.removeItem(PENDING_PURGE_KEY);
  } catch {
    // best-effort, see markPurgePending.
  }
}

function hasPurgePending(): boolean {
  try {
    return localStorage.getItem(PENDING_PURGE_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Purge the service worker's precached offline-shell documents alongside
 * the IndexedDB store. Belt-and-braces: an offline route's SSR output is
 * expected to carry no per-user data (that's what makes precaching it
 * safe), but `clearAll` is the one enforcement point that actually runs on
 * every login boundary, so it also drops any precached shell rather than
 * relying solely on that expectation holding for every plugin. Matches by
 * substring because workbox may prefix/suffix the configured `cacheName`
 * (`offline-shells` in `runtime/next.config.ts`) with its own scheme.
 */
async function purgeShellCaches(): Promise<void> {
  if (typeof caches === 'undefined') return;
  try {
    const names = await caches.keys();
    await Promise.all(
      names.filter((name) => name.includes('offline-shells')).map((name) => caches.delete(name)),
    );
  } catch {
    // best-effort — do not let a Cache Storage failure block the IndexedDB purge.
  }
}

let pendingPurgeChecked = false;

/**
 * Runs once per tab on first use of this module: subscribes to cross-tab
 * clear notifications and, if a previous `clearAll` in this tab failed
 * partway, retries it now. Idempotent — safe to call from every public
 * method via `openDb`.
 */
function ensureTabState(): void {
  if (typeof BroadcastChannel !== 'undefined' && !clearChannel) {
    clearChannel = new BroadcastChannel(CLEAR_CHANNEL_NAME);
    clearChannel.onmessage = () => {
      epoch++;
    };
  }
  if (!pendingPurgeChecked) {
    pendingPurgeChecked = true;
    if (hasPurgePending()) {
      void offline.clearAll();
    }
  }
}

/** Plugin-scoped offline cache (RFC 0074). Browser-only — import from `@sovereignfs/sdk/offline`. */
export const offline = {
  /** Read this plugin's cached value for `key`, or `null` if never written (or offline-cleared). */
  async get<T>(pluginId: string, key: string): Promise<T | null> {
    const db = await openDb();
    const stored = await new Promise<unknown>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const request = tx.objectStore(STORE_NAME).get(compositeKey(pluginId, key));
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => reject(request.error ?? new Error('Failed to read offline value.'));
    });
    db.close();
    if (stored === null) return null;
    return decryptEntry<T>(stored);
  },

  /**
   * Write/replace this plugin's cached value for `key`.
   * @throws {OfflineQuotaExceededError} if `value` exceeds the per-entry soft
   * cap, or if the browser's origin storage quota is exhausted (shared by
   * every plugin's offline cache).
   */
  async set<T>(pluginId: string, key: string, value: T): Promise<void> {
    checkEntrySize(value);
    const writeEpoch = epoch;
    const encrypted = await encryptEntry(value);
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      if (writeEpoch !== epoch) {
        // A clearAll() ran while this write was in flight — the session that
        // requested it is gone; don't let its data reappear after the purge.
        resolve();
        return;
      }
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(encrypted, compositeKey(pluginId, key));
      tx.oncomplete = () => resolve();
      tx.onerror = () => {
        if (tx.error?.name === 'QuotaExceededError') {
          reject(
            new OfflineQuotaExceededError(
              'offline.set: browser storage quota exceeded for this origin — the offline cache is shared across every installed plugin. Remove old entries (offline.remove/clear) before writing more.',
            ),
          );
          return;
        }
        reject(tx.error ?? new Error('Failed to write offline value.'));
      };
    });
    db.close();
  },

  /** Remove this plugin's cached value for `key`. No-op if it was never set. */
  async remove(pluginId: string, key: string): Promise<void> {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(compositeKey(pluginId, key));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('Failed to remove offline value.'));
    });
    db.close();
  },

  /** List every key this plugin has cached (unprefixed — as passed to `set`). */
  async keys(pluginId: string): Promise<string[]> {
    const db = await openDb();
    const result = await new Promise<string[]>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const request = tx.objectStore(STORE_NAME).getAllKeys(pluginKeyRange(pluginId));
      request.onsuccess = () =>
        resolve((request.result as [string, string][]).map(([, key]) => key));
      request.onerror = () => reject(request.error ?? new Error('Failed to list offline keys.'));
    });
    db.close();
    return result;
  },

  /** Remove every cached value for this plugin. */
  async clear(pluginId: string): Promise<void> {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(pluginKeyRange(pluginId));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('Failed to clear offline cache.'));
    });
    db.close();
  },

  /**
   * Remove every cached value for every plugin, in this tab, every other open
   * tab (via `BroadcastChannel`), and the service worker's precached
   * offline-shell documents. Called on every logout/user-switch — the
   * safeguard that makes per-plugin-only (not per-user) key scoping safe on
   * a shared device: nothing survives past the session that wrote it. Also
   * bumps the write epoch (locally and, via the broadcast, in every other
   * tab) so any `set` already in flight anywhere is dropped rather than
   * resurrecting stale data right after. If this throws partway through, a
   * localStorage marker is left behind so the next tab to touch this module
   * retries the purge automatically.
   */
  async clearAll(): Promise<void> {
    // Run first so the channel exists to post on and any *previous* pending
    // purge from an earlier failed attempt is retried before this one marks
    // its own — otherwise this call would immediately retry itself.
    ensureTabState();
    epoch++;
    clearChannel?.postMessage('clear');
    markPurgePending();
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('Failed to clear offline cache.'));
    });
    db.close();
    await purgeShellCaches();
    clearPurgePending();
  },
};
