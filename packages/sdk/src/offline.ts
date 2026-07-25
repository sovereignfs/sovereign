/**
 * Browser-only, plugin-scoped key/value cache backing offline-capable page
 * routes (RFC 0074, manifest `offline.routes`). Lets a client component
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
 */

const DB_NAME = 'sovereign-offline';
const DB_VERSION = 1;
const STORE_NAME = 'kv';

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

function openDb(): Promise<IDBDatabase> {
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
 * it. Doesn't close every possible ordering (two independent IndexedDB
 * connections have no cross-transaction ordering guarantee), but covers the
 * realistic case — a write already in flight when the user clicks sign out.
 */
let epoch = 0;

/** Plugin-scoped offline cache (RFC 0074). Browser-only — import from `@sovereignfs/sdk/offline`. */
export const offline = {
  /** Read this plugin's cached value for `key`, or `null` if never written (or offline-cleared). */
  async get<T>(pluginId: string, key: string): Promise<T | null> {
    const db = await openDb();
    const result = await new Promise<T | null>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const request = tx.objectStore(STORE_NAME).get(compositeKey(pluginId, key));
      request.onsuccess = () => resolve((request.result as T | undefined) ?? null);
      request.onerror = () => reject(request.error ?? new Error('Failed to read offline value.'));
    });
    db.close();
    return result;
  },

  /** Write/replace this plugin's cached value for `key`. */
  async set<T>(pluginId: string, key: string, value: T): Promise<void> {
    const writeEpoch = epoch;
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      if (writeEpoch !== epoch) {
        // A clearAll() ran while this write was in flight — the session that
        // requested it is gone; don't let its data reappear after the purge.
        resolve();
        return;
      }
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(value, compositeKey(pluginId, key));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('Failed to write offline value.'));
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
   * Remove every cached value for every plugin. Called on every logout/user-
   * switch — the safeguard that makes per-plugin-only (not per-user) key
   * scoping safe on a shared device: nothing survives past the session that
   * wrote it. Also bumps the write epoch so any `set` already in flight when
   * this runs is dropped rather than resurrecting stale data right after.
   */
  async clearAll(): Promise<void> {
    epoch++;
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('Failed to clear offline cache.'));
    });
    db.close();
  },
};
