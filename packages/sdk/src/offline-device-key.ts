/**
 * The `offline-first` tier's own no-presence device key (RFC 0093 §1's
 * "current state" survey / task 8.20's other deliverable, alongside
 * `device-only-kv.ts`'s presence-gated one for the `device-only` tier).
 *
 * **Deliberately not `e2ee-device.ts`'s existing "Device Key,"** despite the
 * shape looking identical (both are non-extractable, IndexedDB-persisted,
 * released with no presence check) — two real reasons, not just RFC 0093's
 * general "independent secrets" principle:
 *
 * 1. `e2ee-device.ts`'s key only exists for a user who has opted into RFC
 *    0060's client-side encryption. `offline.ts`'s cache is used by every
 *    user regardless of that opt-in (the Launcher's own plugin list, for
 *    one) — this module's key must be unconditional, generated silently on
 *    first use, never gated on an enrollment step.
 * 2. `e2ee-device.ts`'s key wraps RFC 0060's CMK — a cryptographic role
 *    already defined and reused elsewhere. Reusing it here would mean a
 *    compromise of the `offline-first` cache's key implies something about
 *    a completely unrelated system, which is exactly the coupling RFC 0093
 *    §3 argues against for `device-only`'s own key relative to RFC 0060.
 *
 * No rotation on logout: `offline.ts`'s own `clearAll()` already wipes every
 * cached value at that boundary (its own doc comment explains why — no
 * per-user keying inside that module, isolation enforced by full purge
 * instead). With nothing left to protect, there is nothing this key needs
 * to stop protecting; keeping the same key across users of a shared browser
 * profile is fine under this tier's threat model (RFC 0093 §1's "protects
 * against other apps and casual filesystem access," not user isolation).
 */

const DB_NAME = 'sovereign-offline-device-key';
const DB_VERSION = 1;
const STORE_NAME = 'key';
const KEY_RECORD_ID = 'device-key';

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

async function loadOrCreateKey(db: IDBDatabase): Promise<CryptoKey> {
  const existing = await new Promise<CryptoKey | null>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const request = tx.objectStore(STORE_NAME).get(KEY_RECORD_ID);
    request.onsuccess = () => resolve((request.result as CryptoKey | undefined) ?? null);
    request.onerror = () =>
      reject(request.error ?? new Error('Failed to read the offline device key.'));
  });
  if (existing) return existing;

  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ]);
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(key, KEY_RECORD_ID);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Failed to store the offline device key.'));
  });
  return key;
}

let cachedKeyPromise: Promise<CryptoKey> | null = null;

/**
 * The non-extractable AES-GCM key `offline.ts` encrypts every cached value
 * under. Generated automatically the first time anything is cached — no
 * enrollment ceremony, no user action, no opt-in (contrast `device-only`'s
 * Device Storage Key, RFC 0093 §2, which the user sets up explicitly).
 * Cached in module scope so repeated `offline.get`/`offline.set` calls in
 * the same tab don't each pay for an IndexedDB round trip; cleared on
 * failure so a transient error doesn't poison every later call in the tab.
 */
export async function getOrCreateOfflineDeviceKey(): Promise<CryptoKey> {
  if (!cachedKeyPromise) {
    cachedKeyPromise = openDb()
      .then((db) => loadOrCreateKey(db).finally(() => db.close()))
      .catch((err: unknown) => {
        cachedKeyPromise = null;
        throw err;
      });
  }
  return cachedKeyPromise;
}
