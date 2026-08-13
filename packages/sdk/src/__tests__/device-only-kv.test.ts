import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getUnlockedDeviceStorageKey = vi.fn();

vi.mock('../device-only-session', async () => {
  const actual =
    await vi.importActual<typeof import('../device-only-session')>('../device-only-session');
  return {
    ...actual,
    getUnlockedDeviceStorageKey: (...args: unknown[]) => getUnlockedDeviceStorageKey(...args),
  };
});

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
