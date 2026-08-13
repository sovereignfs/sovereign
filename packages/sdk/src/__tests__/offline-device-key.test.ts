import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getOrCreateOfflineDeviceKey } from '../offline-device-key';

describe('getOrCreateOfflineDeviceKey', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(async () => {
    indexedDB.deleteDatabase('sovereign-offline-device-key');
  });

  it('creates a non-extractable AES-GCM key on first call', async () => {
    const key = await getOrCreateOfflineDeviceKey();
    expect(key.algorithm).toEqual({ name: 'AES-GCM', length: 256 });
    expect(key.extractable).toBe(false);
    expect(key.usages.sort()).toEqual(['decrypt', 'encrypt']);
  });

  it('returns the same key object on repeated calls in the same module instance', async () => {
    const first = await getOrCreateOfflineDeviceKey();
    const second = await getOrCreateOfflineDeviceKey();
    expect(second).toBe(first);
  });

  it('persists the key across a fresh module load rather than generating a new one', async () => {
    await getOrCreateOfflineDeviceKey();

    vi.resetModules();
    const { getOrCreateOfflineDeviceKey: reloaded } = await import('../offline-device-key');
    await reloaded();

    // A fresh module instance found (not regenerated) the same stored
    // record — verified by count, since round-tripping a deserialized
    // non-extractable CryptoKey through WebCrypto isn't something
    // fake-indexeddb's structured-clone emulation reliably supports.
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('sovereign-offline-device-key');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const count = await new Promise<number>((resolve, reject) => {
      const tx = db.transaction('key', 'readonly');
      const request = tx.objectStore('key').count();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    db.close();
    expect(count).toBe(1);
  });
});
