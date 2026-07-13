/**
 * Browser-only persistence for this device's local E2EE wrapping key
 * (RFC 0060). The key itself is generated non-extractable
 * (`e2ee-crypto.ts#generateDeviceKey`) so it must be persisted via
 * IndexedDB — the only Web storage API that can hold a live `CryptoKey`
 * across page loads (`localStorage`/cookies cannot serialize one).
 *
 * The device id is a random UUID, not sensitive on its own (it is just a
 * label distinguishing this browser/device's enrollment row from others) and
 * is stored in `localStorage` alongside the IndexedDB key entry.
 */

const DB_NAME = 'sovereign-e2ee';
const DB_VERSION = 1;
const STORE_NAME = 'device-keys';
const DEVICE_ID_STORAGE_KEY = 'sovereign:e2ee:deviceId';

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

/** This browser/device's stable id — generated once, persisted in `localStorage`. */
export function getOrCreateDeviceId(): string {
  const existing = localStorage.getItem(DEVICE_ID_STORAGE_KEY);
  if (existing) return existing;
  const id = crypto.randomUUID();
  localStorage.setItem(DEVICE_ID_STORAGE_KEY, id);
  return id;
}

/** Persist this device's local wrapping key, keyed by device id. */
export async function storeDeviceKey(deviceId: string, key: CryptoKey): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(key, deviceId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Failed to store device key.'));
  });
  db.close();
}

/** Read this device's local wrapping key, or `null` if never enrolled on this device/browser. */
export async function getDeviceKey(deviceId: string): Promise<CryptoKey | null> {
  const db = await openDb();
  const result = await new Promise<CryptoKey | null>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const request = tx.objectStore(STORE_NAME).get(deviceId);
    request.onsuccess = () => resolve((request.result as CryptoKey | undefined) ?? null);
    request.onerror = () => reject(request.error ?? new Error('Failed to read device key.'));
  });
  db.close();
  return result;
}

/** Remove this device's local wrapping key (e.g. after the user revokes it from another device). */
export async function forgetDeviceKey(deviceId: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(deviceId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Failed to remove device key.'));
  });
  db.close();
}
