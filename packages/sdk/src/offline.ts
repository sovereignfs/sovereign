/**
 * Browser-only, plugin-scoped key/value cache backing offline-capable page
 * routes (RFC 0071, manifest `offline.routes`). Lets a client component
 * render immediately from the last-cached value with no network, then mirror
 * a fresh read back in for next time.
 *
 * **Isolation model:** entries live in a single shared IndexedDB database,
 * namespaced per plugin id (a plugin passes its own manifest `id` — it
 * already knows this statically, the same way it knows its own
 * `routePrefix`). There is deliberately no per-user keying inside this
 * module: an offline route's own SSR output must never carry per-user data
 * (it is precached and could be replayed to a different user on a shared
 * device — see RFC 0071 "user-neutral shell"), so there is no safe
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
const KEY_SEPARATOR = '::';

function compositeKey(pluginId: string, key: string): string {
  return `${pluginId}${KEY_SEPARATOR}${key}`;
}

function pluginKeyRange(pluginId: string): IDBKeyRange {
  const prefix = `${pluginId}${KEY_SEPARATOR}`;
  // Upper bound is exclusive and must sort after every string starting with
  // `prefix` — '￿' is the highest BMP code point, which suffices for
  // plugin ids (lowercase, dot-separated reverse-domain style).
  return IDBKeyRange.bound(prefix, `${prefix}￿`, false, false);
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

/** Plugin-scoped offline cache (RFC 0071). Browser-only — import from `@sovereignfs/sdk/offline`. */
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
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
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
    const prefix = `${pluginId}${KEY_SEPARATOR}`;
    const result = await new Promise<string[]>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const request = tx.objectStore(STORE_NAME).getAllKeys(pluginKeyRange(pluginId));
      request.onsuccess = () =>
        resolve((request.result as IDBValidKey[]).map((k) => String(k).slice(prefix.length)));
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
   * Remove every cached value for every plugin. Called by the runtime shell
   * on logout/user-switch — the safeguard that makes per-plugin-only (not
   * per-user) keying safe on a shared device: nothing survives past the
   * session that wrote it.
   */
  async clearAll(): Promise<void> {
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
