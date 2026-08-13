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

const { exportDeviceOnlyData, importDeviceOnlyData } = await import('../device-only-export');
const { getDeviceOnlyValue, setDeviceOnlyValue } = await import('../device-only-kv');

/** Same nested-directory OPFS fake as device-only-kv.test.ts. */
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

describe('exportDeviceOnlyData / importDeviceOnlyData', () => {
  beforeEach(() => {
    getUnlockedDeviceStorageKey.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('exports every stored value and restores it on import', async () => {
    stubOpfs();
    const key = await generateFakeDeviceStorageKey();
    getUnlockedDeviceStorageKey.mockResolvedValue({ status: 'ok', key });

    await setDeviceOnlyValue('io.example.notes', 'note-1', { title: 'Groceries' });
    await setDeviceOnlyValue('io.example.notes', 'note-2', { title: 'Chores' });
    await setDeviceOnlyValue('io.example.other', 'entry-1', { n: 42 });

    const exportResult = await exportDeviceOnlyData('correct horse battery staple');
    expect(exportResult.status).toBe('ok');
    if (exportResult.status !== 'ok') return;

    // Simulate a fresh device: new OPFS, but the same (mocked) unlocked key —
    // real cross-device import always targets the importing device's own
    // key, which this test doesn't need to model differently since the
    // module never compares export-time and import-time keys against each
    // other.
    stubOpfs();

    const importResult = await importDeviceOnlyData(
      exportResult.file,
      'correct horse battery staple',
    );
    expect(importResult).toEqual({ status: 'ok', pluginCount: 2, entryCount: 3 });

    await expect(getDeviceOnlyValue('io.example.notes', 'note-1')).resolves.toEqual({
      status: 'ok',
      value: { title: 'Groceries' },
    });
    await expect(getDeviceOnlyValue('io.example.notes', 'note-2')).resolves.toEqual({
      status: 'ok',
      value: { title: 'Chores' },
    });
    await expect(getDeviceOnlyValue('io.example.other', 'entry-1')).resolves.toEqual({
      status: 'ok',
      value: { n: 42 },
    });
  });

  it('produces ciphertext that does not contain the plaintext data', async () => {
    stubOpfs();
    const key = await generateFakeDeviceStorageKey();
    getUnlockedDeviceStorageKey.mockResolvedValue({ status: 'ok', key });

    await setDeviceOnlyValue('io.example.notes', 'note-1', { secret: 'do not leak this either' });

    const exportResult = await exportDeviceOnlyData('a strong passphrase');
    expect(exportResult.status).toBe('ok');
    if (exportResult.status !== 'ok') return;

    expect(JSON.stringify(exportResult.file)).not.toContain('do not leak this either');
  });

  it('rejects import with the wrong passphrase', async () => {
    stubOpfs();
    const key = await generateFakeDeviceStorageKey();
    getUnlockedDeviceStorageKey.mockResolvedValue({ status: 'ok', key });

    await setDeviceOnlyValue('io.example.notes', 'note-1', { title: 'Groceries' });
    const exportResult = await exportDeviceOnlyData('correct horse battery staple');
    expect(exportResult.status).toBe('ok');
    if (exportResult.status !== 'ok') return;

    const importResult = await importDeviceOnlyData(exportResult.file, 'wrong passphrase');
    expect(importResult).toEqual({ status: 'invalid-passphrase' });
  });

  it('rejects a file with an unrecognized format version', async () => {
    stubOpfs();
    const key = await generateFakeDeviceStorageKey();
    getUnlockedDeviceStorageKey.mockResolvedValue({ status: 'ok', key });

    const result = await importDeviceOnlyData(
      {
        formatVersion: 'v99',
        kdfAlgorithm: 'PBKDF2-SHA256',
        kdfParams: '{}',
        kdfSalt: 'x',
        wrappedData: 'y',
      },
      'anything',
    );
    expect(result).toEqual({ status: 'invalid-file' });
  });

  it('produces a valid empty export when nothing is stored', async () => {
    stubOpfs();
    const key = await generateFakeDeviceStorageKey();
    getUnlockedDeviceStorageKey.mockResolvedValue({ status: 'ok', key });

    const exportResult = await exportDeviceOnlyData('correct horse battery staple');
    expect(exportResult.status).toBe('ok');
    if (exportResult.status !== 'ok') return;

    const importResult = await importDeviceOnlyData(
      exportResult.file,
      'correct horse battery staple',
    );
    expect(importResult).toEqual({ status: 'ok', pluginCount: 0, entryCount: 0 });
  });

  it('passes through a non-ok unlock status instead of attempting export', async () => {
    stubOpfs();
    getUnlockedDeviceStorageKey.mockResolvedValue({ status: 'no-device-auth' });

    const result = await exportDeviceOnlyData('anything');
    expect(result).toEqual({ status: 'no-device-auth' });
  });

  it('passes through a non-ok unlock status instead of attempting import', async () => {
    stubOpfs();
    getUnlockedDeviceStorageKey.mockResolvedValue({ status: 'cancelled' });

    const result = await importDeviceOnlyData(
      {
        formatVersion: 'v1',
        kdfAlgorithm: 'PBKDF2-SHA256',
        kdfParams: '{}',
        kdfSalt: 'x',
        wrappedData: 'y',
      },
      'anything',
    );
    expect(result).toEqual({ status: 'cancelled' });
  });
});
