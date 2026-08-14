import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getUnlockedDeviceStorageKey = vi.fn();
const supports = vi.fn();
const secureStorageGet = vi.fn();
const secureStorageSet = vi.fn();
const secureStorageRemove = vi.fn();
const secureStorageKeys = vi.fn();
const secureStorageClear = vi.fn();

vi.mock('../device-only-session', async () => {
  const actual =
    await vi.importActual<typeof import('../device-only-session')>('../device-only-session');
  return {
    ...actual,
    getUnlockedDeviceStorageKey: (...args: unknown[]) => getUnlockedDeviceStorageKey(...args),
  };
});

// `supports('secureStorage')` defaults to `false` in every test below that
// doesn't touch it — no bridge registered, matching a plain browser — same
// default the real `getBridge()` falls back to. Only the "native" describe
// block overrides it.
vi.mock('../device-client', () => ({
  supports: (...args: unknown[]) => supports(...args),
  secureStorage: {
    get: (...args: unknown[]) => secureStorageGet(...args),
    set: (...args: unknown[]) => secureStorageSet(...args),
    remove: (...args: unknown[]) => secureStorageRemove(...args),
    keys: (...args: unknown[]) => secureStorageKeys(...args),
    clear: (...args: unknown[]) => secureStorageClear(...args),
  },
}));

const {
  clearDeviceOnlyPluginData,
  deleteDeviceOnlyValue,
  getDeviceOnlyValue,
  listDeviceOnlyKeys,
  setDeviceOnlyValue,
} = await import('../device-only-kv');

/**
 * Minimal in-memory OPFS fake supporting nested directories, binary file
 * content, and `keys()` iteration — the surface `device-only-kv.ts` actually
 * calls, beyond what `device-only-storage.test.ts`'s own single-level fake
 * covers.
 */
function createFakeOpfs() {
  interface Node {
    kind: 'file' | 'directory';
    children?: Map<string, Node>;
    content?: Uint8Array;
  }
  const root: Node = { kind: 'directory', children: new Map() };

  function makeFileHandle(dirNode: Node, fileName: string) {
    return {
      async getFile() {
        const node = dirNode.children?.get(fileName);
        if (!node || node.kind !== 'file') throw new DOMException('not found', 'NotFoundError');
        const content = node.content ?? new Uint8Array();
        return { arrayBuffer: async () => content.slice().buffer };
      },
      async createWritable() {
        let buffer = new Uint8Array();
        return {
          write: async (data: BufferSource) => {
            buffer =
              data instanceof Uint8Array
                ? new Uint8Array(data)
                : new Uint8Array(data as ArrayBuffer);
          },
          close: async () => {
            dirNode.children?.set(fileName, { kind: 'file', content: buffer });
          },
        };
      },
    };
  }

  function makeDirHandle(dirNode: Node) {
    return {
      async getDirectoryHandle(name: string, opts?: { create?: boolean }) {
        let node = dirNode.children?.get(name);
        if (!node) {
          if (!opts?.create) throw new DOMException('not found', 'NotFoundError');
          node = { kind: 'directory', children: new Map() };
          dirNode.children?.set(name, node);
        }
        return makeDirHandle(node);
      },
      async getFileHandle(name: string, opts?: { create?: boolean }) {
        const exists = dirNode.children?.has(name) ?? false;
        if (!exists && !opts?.create) throw new DOMException('not found', 'NotFoundError');
        return makeFileHandle(dirNode, name);
      },
      async removeEntry(name: string, _opts?: { recursive?: boolean }) {
        if (!dirNode.children?.has(name)) throw new DOMException('not found', 'NotFoundError');
        dirNode.children?.delete(name);
      },
      async *keys() {
        for (const name of dirNode.children?.keys() ?? []) yield name;
      },
    };
  }

  const storage = { getDirectory: async () => makeDirHandle(root) };
  return { storage };
}

function stubOpfs() {
  const fake = createFakeOpfs();
  vi.stubGlobal('navigator', { storage: fake.storage });
  return fake;
}

async function generateFakeDeviceStorageKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

describe('device-only-kv', () => {
  beforeEach(() => {
    getUnlockedDeviceStorageKey.mockReset();
    supports.mockReset().mockReturnValue(false);
    secureStorageGet.mockReset();
    secureStorageSet.mockReset();
    secureStorageRemove.mockReset();
    secureStorageKeys.mockReset();
    secureStorageClear.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('round-trips a value through encrypted storage', async () => {
    stubOpfs();
    const key = await generateFakeDeviceStorageKey();
    getUnlockedDeviceStorageKey.mockResolvedValue({ status: 'ok', key });

    const setResult = await setDeviceOnlyValue('io.example.notes', 'note-1', {
      title: 'Grocery list',
      done: false,
    });
    expect(setResult).toEqual({ status: 'ok' });

    const getResult = await getDeviceOnlyValue('io.example.notes', 'note-1');
    expect(getResult).toEqual({
      status: 'ok',
      value: { title: 'Grocery list', done: false },
    });
  });

  it('stores ciphertext on disk, not plaintext', async () => {
    const fake = stubOpfs();
    const key = await generateFakeDeviceStorageKey();
    getUnlockedDeviceStorageKey.mockResolvedValue({ status: 'ok', key });

    await setDeviceOnlyValue('io.example.notes', 'note-1', { secret: 'do not leak this' });

    const dir = await fake.storage.getDirectory();
    const dataDir = await dir.getDirectoryHandle('sovereign-device-only');
    const pluginsDir = await dataDir.getDirectoryHandle('data');
    const pluginDir = await pluginsDir.getDirectoryHandle('io.example.notes');
    const names: string[] = [];
    for await (const name of pluginDir.keys()) names.push(name);
    expect(names).toHaveLength(1);
    const [onlyFileName] = names;
    if (!onlyFileName) throw new Error('expected a stored file');
    const fileHandle = await pluginDir.getFileHandle(onlyFileName);
    const file = await fileHandle.getFile();
    const bytes = new Uint8Array(await file.arrayBuffer());
    const text = new TextDecoder().decode(bytes);
    expect(text).not.toContain('do not leak this');
  });

  it('returns value: undefined for a key that was never written', async () => {
    stubOpfs();
    const key = await generateFakeDeviceStorageKey();
    getUnlockedDeviceStorageKey.mockResolvedValue({ status: 'ok', key });

    const result = await getDeviceOnlyValue('io.example.notes', 'missing');
    expect(result).toEqual({ status: 'ok', value: undefined });
  });

  it('passes through a non-ok unlock status instead of attempting the read', async () => {
    stubOpfs();
    getUnlockedDeviceStorageKey.mockResolvedValue({ status: 'no-device-auth' });

    const result = await getDeviceOnlyValue('io.example.notes', 'note-1');
    expect(result).toEqual({ status: 'no-device-auth' });
  });

  it('passes through a non-ok unlock status instead of attempting the write', async () => {
    stubOpfs();
    getUnlockedDeviceStorageKey.mockResolvedValue({ status: 'cancelled' });

    const result = await setDeviceOnlyValue('io.example.notes', 'note-1', { x: 1 });
    expect(result).toEqual({ status: 'cancelled' });
  });

  it('isolates values by plugin id', async () => {
    stubOpfs();
    const key = await generateFakeDeviceStorageKey();
    getUnlockedDeviceStorageKey.mockResolvedValue({ status: 'ok', key });

    await setDeviceOnlyValue('io.example.notes', 'shared-key', { owner: 'notes' });
    await setDeviceOnlyValue('io.example.other', 'shared-key', { owner: 'other' });

    const notesValue = await getDeviceOnlyValue('io.example.notes', 'shared-key');
    const otherValue = await getDeviceOnlyValue('io.example.other', 'shared-key');
    expect(notesValue).toEqual({ status: 'ok', value: { owner: 'notes' } });
    expect(otherValue).toEqual({ status: 'ok', value: { owner: 'other' } });
  });

  it('lists and deletes keys without needing an unlocked session', async () => {
    stubOpfs();
    const key = await generateFakeDeviceStorageKey();
    getUnlockedDeviceStorageKey.mockResolvedValue({ status: 'ok', key });

    await setDeviceOnlyValue('io.example.notes', 'note-1', { n: 1 });
    await setDeviceOnlyValue('io.example.notes', 'note-2', { n: 2 });
    await setDeviceOnlyValue('io.example.notes', 'a key with spaces & symbols!', { n: 3 });

    const keys = await listDeviceOnlyKeys('io.example.notes');
    expect(keys.sort()).toEqual(['a key with spaces & symbols!', 'note-1', 'note-2'].sort());

    await deleteDeviceOnlyValue('io.example.notes', 'note-1');
    const afterDelete = await listDeviceOnlyKeys('io.example.notes');
    expect(afterDelete.sort()).toEqual(['a key with spaces & symbols!', 'note-2'].sort());
  });

  it('deleting a never-written key is a no-op', async () => {
    stubOpfs();
    await expect(deleteDeviceOnlyValue('io.example.notes', 'missing')).resolves.toBeUndefined();
  });

  it('listing keys for a plugin with nothing stored returns an empty array', async () => {
    stubOpfs();
    await expect(listDeviceOnlyKeys('io.example.notes')).resolves.toEqual([]);
  });

  it('clears every value for a plugin without touching another plugin', async () => {
    stubOpfs();
    const key = await generateFakeDeviceStorageKey();
    getUnlockedDeviceStorageKey.mockResolvedValue({ status: 'ok', key });

    await setDeviceOnlyValue('io.example.notes', 'note-1', { n: 1 });
    await setDeviceOnlyValue('io.example.other', 'note-1', { n: 2 });

    await clearDeviceOnlyPluginData('io.example.notes');

    await expect(listDeviceOnlyKeys('io.example.notes')).resolves.toEqual([]);
    await expect(getDeviceOnlyValue('io.example.other', 'note-1')).resolves.toEqual({
      status: 'ok',
      value: { n: 2 },
    });
  });

  it('clearing a plugin with nothing stored is a no-op', async () => {
    stubOpfs();
    await expect(clearDeviceOnlyPluginData('io.example.notes')).resolves.toBeUndefined();
  });
});

/**
 * Regression coverage for the gap this describe block exists to close:
 * every function here used to be OPFS-only, so a native shell (where
 * `getUnlockedDeviceStorageKey()` always fails — no WebAuthn PRF/OPFS in a
 * Capacitor WebView) could never actually store `device-only` plugin data,
 * even though `isDeviceOnlyTierAvailable()` correctly reported the tier as
 * available there. Each function now checks `supports('secureStorage')`
 * first and, when true, routes through the bridge instead of ever touching
 * OPFS or `getUnlockedDeviceStorageKey()`.
 */
describe('device-only-kv — native (Capacitor)', () => {
  beforeEach(() => {
    supports.mockReturnValue(true);
  });

  it('reads a value through the bridge and never touches the web unlock path', async () => {
    secureStorageGet.mockResolvedValue({ status: 'ok', value: { title: 'Grocery list' } });

    const result = await getDeviceOnlyValue('io.example.notes', 'note-1');

    expect(result).toEqual({ status: 'ok', value: { title: 'Grocery list' } });
    expect(secureStorageGet).toHaveBeenCalledWith('io.example.notes', 'note-1');
    expect(getUnlockedDeviceStorageKey).not.toHaveBeenCalled();
  });

  it('reports value: undefined for a null (never-written) bridge read', async () => {
    secureStorageGet.mockResolvedValue({ status: 'ok', value: null });

    const result = await getDeviceOnlyValue('io.example.notes', 'missing');

    expect(result).toEqual({ status: 'ok', value: undefined });
  });

  it('maps an unavailable read to no-device-auth', async () => {
    secureStorageGet.mockResolvedValue({ status: 'unavailable', capability: 'secureStorage' });

    const result = await getDeviceOnlyValue('io.example.notes', 'note-1');

    expect(result).toEqual({ status: 'no-device-auth' });
  });

  it('maps a dismissed write to cancelled', async () => {
    secureStorageSet.mockResolvedValue({ status: 'dismissed' });

    const result = await setDeviceOnlyValue('io.example.notes', 'note-1', { x: 1 });

    expect(result).toEqual({ status: 'cancelled' });
    expect(getUnlockedDeviceStorageKey).not.toHaveBeenCalled();
  });

  it('maps a failed write to failed with the bridge error message', async () => {
    secureStorageSet.mockResolvedValue({
      status: 'failed',
      error: 'Keychain write failed (-25299)',
    });

    const result = await setDeviceOnlyValue('io.example.notes', 'note-1', { x: 1 });

    expect(result).toEqual({ status: 'failed', error: 'Keychain write failed (-25299)' });
  });

  it('writes a plaintext value through the bridge — no app-level re-encryption', async () => {
    secureStorageSet.mockResolvedValue({ status: 'ok', value: undefined });

    await setDeviceOnlyValue('io.example.notes', 'note-1', { title: 'Grocery list' });

    expect(secureStorageSet).toHaveBeenCalledWith('io.example.notes', 'note-1', {
      title: 'Grocery list',
    });
  });

  it('deletes through the bridge and swallows a bridge failure to a no-op', async () => {
    secureStorageRemove.mockResolvedValue({ status: 'dismissed' });

    await expect(deleteDeviceOnlyValue('io.example.notes', 'note-1')).resolves.toBeUndefined();
    expect(secureStorageRemove).toHaveBeenCalledWith('io.example.notes', 'note-1');
  });

  it('lists keys through the bridge and returns an empty array on any non-ok status', async () => {
    secureStorageKeys.mockResolvedValue({ status: 'ok', value: ['note-1', 'note-2'] });
    await expect(listDeviceOnlyKeys('io.example.notes')).resolves.toEqual(['note-1', 'note-2']);

    secureStorageKeys.mockResolvedValue({ status: 'unavailable', capability: 'secureStorage' });
    await expect(listDeviceOnlyKeys('io.example.notes')).resolves.toEqual([]);
  });

  it('clears through the bridge', async () => {
    secureStorageClear.mockResolvedValue({ status: 'ok', value: undefined });

    await clearDeviceOnlyPluginData('io.example.notes');

    expect(secureStorageClear).toHaveBeenCalledWith('io.example.notes');
  });
});
