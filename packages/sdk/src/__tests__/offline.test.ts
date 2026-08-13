import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { offline, OfflineQuotaExceededError } from '../offline';

function openRawDb(name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readRawEntry(pluginId: string, key: string): Promise<unknown> {
  const db = await openRawDb('sovereign-offline');
  const value = await new Promise<unknown>((resolve, reject) => {
    const tx = db.transaction('kv', 'readonly');
    const request = tx.objectStore('kv').get([pluginId, key]);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return value;
}

async function writeRawEntry(pluginId: string, key: string, value: unknown): Promise<void> {
  const db = await openRawDb('sovereign-offline');
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('kv', 'readwrite');
    tx.objectStore('kv').put(value, [pluginId, key]);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

describe('offline (encrypted at rest)', () => {
  beforeEach(async () => {
    await offline.clearAll();
  });

  afterEach(async () => {
    await offline.clearAll();
  });

  it('round-trips a value through get/set', async () => {
    await offline.set('io.example.notes', 'plugins', { title: 'Groceries', done: false });
    const value = await offline.get<{ title: string; done: boolean }>(
      'io.example.notes',
      'plugins',
    );
    expect(value).toEqual({ title: 'Groceries', done: false });
  });

  it('stores ciphertext on disk, not the plaintext value', async () => {
    await offline.set('io.example.notes', 'plugins', { secret: 'do not leak this' });
    const raw = await readRawEntry('io.example.notes', 'plugins');
    expect(raw).toMatchObject({ iv: expect.any(Uint8Array), data: expect.anything() });
    expect(JSON.stringify(raw)).not.toContain('do not leak this');
  });

  it('returns null for a key that was never written', async () => {
    await expect(offline.get('io.example.notes', 'missing')).resolves.toBeNull();
  });

  it('returns null (not a thrown error) for a pre-encryption legacy plaintext entry', async () => {
    // Simulates data written before encryption shipped — no {iv, data} wrapper.
    await writeRawEntry('io.example.notes', 'legacy', { title: 'From before encryption' });
    await expect(offline.get('io.example.notes', 'legacy')).resolves.toBeNull();
  });

  it('isolates values by plugin id', async () => {
    await offline.set('io.example.notes', 'shared-key', { owner: 'notes' });
    await offline.set('io.example.other', 'shared-key', { owner: 'other' });

    await expect(offline.get('io.example.notes', 'shared-key')).resolves.toEqual({
      owner: 'notes',
    });
    await expect(offline.get('io.example.other', 'shared-key')).resolves.toEqual({
      owner: 'other',
    });
  });

  it('removes a single value without affecting others', async () => {
    await offline.set('io.example.notes', 'a', { n: 1 });
    await offline.set('io.example.notes', 'b', { n: 2 });

    await offline.remove('io.example.notes', 'a');

    await expect(offline.get('io.example.notes', 'a')).resolves.toBeNull();
    await expect(offline.get('io.example.notes', 'b')).resolves.toEqual({ n: 2 });
  });

  it('lists every key stored for a plugin', async () => {
    await offline.set('io.example.notes', 'a', { n: 1 });
    await offline.set('io.example.notes', 'b', { n: 2 });
    await offline.set('io.example.other', 'c', { n: 3 });

    const keys = await offline.keys('io.example.notes');
    expect(keys.sort()).toEqual(['a', 'b']);
  });

  it('clears every value for one plugin without touching another', async () => {
    await offline.set('io.example.notes', 'a', { n: 1 });
    await offline.set('io.example.other', 'b', { n: 2 });

    await offline.clear('io.example.notes');

    await expect(offline.keys('io.example.notes')).resolves.toEqual([]);
    await expect(offline.get('io.example.other', 'b')).resolves.toEqual({ n: 2 });
  });

  it('clearAll removes every value for every plugin', async () => {
    await offline.set('io.example.notes', 'a', { n: 1 });
    await offline.set('io.example.other', 'b', { n: 2 });

    await offline.clearAll();

    await expect(offline.keys('io.example.notes')).resolves.toEqual([]);
    await expect(offline.keys('io.example.other')).resolves.toEqual([]);
  });

  it('rejects a value exceeding the soft size cap', async () => {
    const huge = { blob: 'x'.repeat(6 * 1024 * 1024) };
    await expect(offline.set('io.example.notes', 'huge', huge)).rejects.toBeInstanceOf(
      OfflineQuotaExceededError,
    );
  });
});
