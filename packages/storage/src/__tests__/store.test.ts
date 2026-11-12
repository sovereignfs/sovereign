import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { Secret } from '@sovereignfs/config';
import { StorageError } from '../errors.js';
import { fileResponse } from '../response.js';
import { createFileStore, DEFAULT_FILE_QUOTA, DEFAULT_QUOTA_MB } from '../settings.js';
import { cleanName, type FileStore } from '../store.js';
import { RECOUNT_AFTER_MS } from '../usage.js';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const SUB = 'person-1';

function store(
  quota: { mb?: number; files?: number } = {},
  extra: { key?: string; now?: () => number } = {},
): { files: FileStore; root: string } {
  const root = mkdtempSync(path.join(os.tmpdir(), 'sv-storage-'));
  roots.push(root);
  const files = createFileStore(
    {
      storageDriver: 'fs',
      storagePath: root,
      storageQuotaMb: quota.mb ?? 1,
      storageFileQuota: quota.files ?? 10,
      storageSigningKey: extra.key ? new Secret(extra.key) : undefined,
    },
    { prefix: 'NOTES', defaultPath: '/nowhere', ...(extra.now ? { now: extra.now } : {}) },
  );
  return { files, root };
}

const refusal = (promise: Promise<unknown>) =>
  promise.then(
    () => undefined,
    (error: unknown) => (error instanceof StorageError ? error.code : error),
  );

async function* slowly(bytes: Uint8Array, parts = 4): AsyncIterable<Uint8Array> {
  const step = Math.ceil(bytes.length / parts);
  for (let at = 0; at < bytes.length; at += step) {
    await new Promise((resolve) => setTimeout(resolve, 2));
    yield bytes.subarray(at, at + step);
  }
}

describe('a file store', () => {
  it('keeps a file under an id it made, with its record, in the person’s own folder, and serves it back', async () => {
    const { files, root } = store();
    const record = await files.put(SUB, PNG, { name: '../../etc/passwd.png', size: PNG.length });
    expect(record.id).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(record).toMatchObject({ name: 'passwd.png', type: 'image/png', inline: true, size: 12 });
    expect(readdirSync(path.join(root, SUB)).sort()).toEqual(
      ['.usage.json', record.id, `${record.id}.json`].sort(),
    );
    const got = await files.get(SUB, record.id);
    const response = fileResponse(got);
    expect(Buffer.from(await response.arrayBuffer())).toEqual(Buffer.from(PNG));
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('content-disposition')).toMatch(/^inline; filename="passwd.png"/);
    expect(await files.list(SUB)).toEqual([record]);
  });

  it('judges a file by its bytes: a page called a picture is downloaded, never shown', async () => {
    const { files } = store();
    const page = new TextEncoder().encode('<svg onload="alert(1)"></svg>');
    const record = await files.put(SUB, page, { name: 'cat.png' });
    expect(record).toMatchObject({ type: 'application/octet-stream', inline: false });
    const response = fileResponse(await files.get(SUB, record.id));
    expect(response.headers.get('content-type')).toBe('application/octet-stream');
    expect(response.headers.get('content-disposition')).toMatch(/^attachment;/);
    expect(response.headers.get('content-security-policy')).toContain('sandbox');
  });

  it('never lets a person or a file name a path', async () => {
    const { files } = store();
    for (const sub of ['..', '../other', 'a/b', '', 'x'.repeat(129)])
      expect(await refusal(files.put(sub, PNG)), sub).toBe('invalid');
    for (const id of ['../person-2/x', '..', 'short'])
      expect(await refusal(files.get(SUB, id)), id).toBe('not_found');
  });

  it('treats another person’s file as one that is not there', async () => {
    const { files } = store();
    const record = await files.put('person-2', PNG);
    expect(await refusal(files.get(SUB, record.id))).toBe('not_found');
    expect(await refusal(files.remove(SUB, record.id))).toBe('not_found');
  });

  it('refuses a file larger than the whole quota before reading it, and one with no room left', async () => {
    const { files } = store({ mb: 1 });
    expect(await refusal(files.put(SUB, PNG, { size: 2 * 1024 * 1024 }))).toBe('too_large');
    await files.put(SUB, new Uint8Array(1024 * 1024 - 10), { size: 1024 * 1024 - 10 });
    expect(await refusal(files.put(SUB, PNG, { size: PNG.length }))).toBe('over_quota');
    expect(await refusal(files.put(SUB, PNG))).toBe('over_quota');
  });

  it('refuses the file past the file quota', async () => {
    const { files } = store({ files: 2 });
    await files.put(SUB, PNG);
    await files.put(SUB, PNG);
    expect(await refusal(files.put(SUB, PNG))).toBe('over_quota');
  });

  it('lets no two uploads at once pass the quota together', async () => {
    const { files } = store({ mb: 1 });
    const big = new Uint8Array(600 * 1024);
    const results = await Promise.all([
      refusal(files.put(SUB, slowly(big), { size: big.length })),
      refusal(files.put(SUB, slowly(big), { size: big.length })),
    ]);
    expect(results.sort()).toEqual(['over_quota', undefined].sort());
    expect((await files.usage(SUB)).bytes).toBe(big.length);
  });

  it('gives a failed upload’s reservation back, and leaves no part of it', async () => {
    const { files, root } = store({ mb: 1 });
    async function* broken(): AsyncIterable<Uint8Array> {
      yield PNG;
      throw new Error('the connection dropped');
    }
    await expect(files.put(SUB, broken(), { size: 500 })).rejects.toThrow('dropped');
    expect(await refusal(files.put(SUB, new Uint8Array(0)))).toBe('empty');
    // A body longer than it said is refused, and its reservation given back too.
    expect(await refusal(files.put(SUB, new Uint8Array(100), { size: 10 }))).toBe('invalid');
    // And one shorter than it said, which arrived cut short.
    expect(await refusal(files.put(SUB, new Uint8Array(10), { size: 100 }))).toBe('invalid');
    expect(await files.usage(SUB)).toMatchObject({ bytes: 0, files: 0 });
    expect(readdirSync(path.join(root, SUB))).toEqual(['.usage.json']);
  });

  it('keeps only what was written when the size was not said, and frees it on removal', async () => {
    const { files } = store({ mb: 1 });
    const record = await files.put(SUB, slowly(PNG));
    expect(await files.usage(SUB)).toMatchObject({ bytes: 12, files: 1 });
    await files.remove(SUB, record.id);
    expect(await files.usage(SUB)).toMatchObject({ bytes: 0, files: 0 });
  });

  it('counts again when the usage record is missing or old', async () => {
    let now = 1_000_000;
    const { files, root } = store({}, { now: () => now });
    await files.put(SUB, PNG);
    writeFileSync(
      path.join(root, SUB, '.usage.json'),
      '{"bytes":999,"files":9,"countedAt":1000000}',
    );
    expect((await files.usage(SUB)).bytes).toBe(999);
    now += RECOUNT_AFTER_MS + 1;
    expect(await files.usage(SUB)).toMatchObject({ bytes: 12, files: 1 });
    rmSync(path.join(root, SUB, '.usage.json'));
    expect(await files.usage(SUB)).toMatchObject({ bytes: 12, files: 1 });
  });

  it('removes every file of a person, and nobody else’s', async () => {
    const { files, root } = store();
    await files.put(SUB, PNG);
    await files.put('person-2', PNG);
    await files.removeAll(SUB);
    await files.removeAll(SUB);
    expect(existsSync(path.join(root, SUB))).toBe(false);
    expect(await files.list('person-2')).toHaveLength(1);
  });

  it('signs an address for one person and file, which stops working when it runs out', async () => {
    let now = 1_800_000_000_000;
    const { files } = store({}, { key: 'k'.repeat(40), now: () => now });
    const record = await files.put(SUB, PNG);
    const query = files.signedQuery(SUB, record.id, 300);
    expect(files.signedFor(record.id, query)).toBe(SUB);
    const other = await files.put(SUB, PNG);
    expect(files.signedFor(other.id, query)).toBeUndefined();
    const forged = new URLSearchParams(query);
    forged.set('u', 'person-2');
    expect(files.signedFor(record.id, forged)).toBeUndefined();
    forged.set('u', SUB);
    forged.set('signature', `${query.get('signature')?.slice(0, -1)}A`);
    expect(files.signedFor(record.id, forged)).toBeUndefined();
    now += 301_000;
    expect(files.signedFor(record.id, query)).toBeUndefined();
  });

  it('signs nothing without a key', async () => {
    const { files } = store();
    const record = await files.put(SUB, PNG);
    expect(files.signs).toBe(false);
    expect(() => files.signedQuery(SUB, record.id)).toThrow();
    expect(files.signedFor(record.id, new URLSearchParams({ u: SUB }))).toBeUndefined();
  });

  it('defaults to 200 GB and 1000 files per person', () => {
    expect([DEFAULT_QUOTA_MB, DEFAULT_FILE_QUOTA]).toEqual([204800, 1000]);
  });

  it('cleans a name of paths and control characters', () => {
    expect(cleanName('a/b\\c\u0000d.txt')).toBe('cd.txt');
    expect(cleanName('..')).toBe('file');
    expect(cleanName(undefined)).toBe('file');
    expect(cleanName('x'.repeat(300))).toHaveLength(200);
  });
});
