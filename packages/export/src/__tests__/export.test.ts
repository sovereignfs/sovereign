import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateX25519Identity, identityToRecipient } from 'age-encryption';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { concat, chunksOf, utf8 } from '../bytes.js';
import {
  decryptWith,
  encryptTo,
  ExportError,
  exportFileName,
  ExportWriter,
  parseRecipients,
  readExport,
  recipientFingerprint,
  type ExportHead,
} from '../index.js';
import { TAR_END, tarHeader, tarPadding } from '../tar.js';

const head: ExportHead = {
  format: 1,
  kind: 'person',
  producer: { name: 'core', version: '0.80.0' },
  instance: { id: 'instance-1', url: 'https://sovereign.example.org' },
  sub: 'person-1',
  takenAt: '2026-11-20T10:00:00.000Z',
};

async function collect(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const parts: Uint8Array[] = [];
  for await (const chunk of chunksOf(stream)) parts.push(chunk);
  return concat(parts);
}

async function* stream(text: string, times: number): AsyncGenerator<Uint8Array> {
  for (let i = 0; i < times; i += 1) yield utf8(text);
}

const longPath = `core/files/${'a'.repeat(120)}/${'b'.repeat(150)}/file.bin`;

async function sample(archive: 'tar' | 'zip' = 'tar'): Promise<Uint8Array> {
  const writer = new ExportWriter({ head, archive });
  const out = collect(writer.readable);
  writer.addPart({ name: 'core', status: 'complete' });
  await writer.addRecords('core/records/profile.jsonl', 'profile', [{ name: 'Ada' }]);
  await writer.addRecords(
    'core/records/vault.jsonl',
    'vault',
    [{ v: 'c2VjcmV0' }, { v: 'b3RoZXI' }],
    { endToEnd: true },
  );
  await writer.addFile('core/files/notes.txt', utf8('hello'));
  await writer.addFile('core/files/streamed.txt', stream('chunk ', 1000));
  await writer.addFile(longPath, utf8('deep'));
  writer.addPart({ name: 'ledger', status: 'missing', reason: 'unreachable' });
  await writer.finish();
  return out;
}

function rawTar(entries: { path: string; body: Uint8Array }[]): Uint8Array {
  const parts: Uint8Array[] = [];
  for (const entry of entries) {
    parts.push(
      tarHeader(entry.path, entry.body.byteLength, 0),
      entry.body,
      new Uint8Array(tarPadding(entry.body.byteLength)),
    );
  }
  parts.push(TAR_END);
  return concat(parts);
}

let folder: string;
beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), 'export-test-'));
});
afterEach(async () => {
  await rm(folder, { recursive: true, force: true });
});

describe('writing and reading an export', () => {
  it('reads back what was written, with its parts, records and hashes', async () => {
    const bytes = await sample();
    const files = new Map<string, string>();
    const read = await readExport(bytes, {
      onFile: async ({ path, body }) => {
        const parts: Uint8Array[] = [];
        for await (const chunk of body) parts.push(chunk);
        files.set(path, Buffer.from(concat(parts)).toString('utf8'));
      },
    });
    expect(read.head).toEqual(head);
    expect(read.contents.parts).toEqual([
      { name: 'core', status: 'complete' },
      { name: 'ledger', status: 'missing', reason: 'unreachable' },
    ]);
    expect(read.contents.records).toEqual([
      { path: 'core/records/profile.jsonl', kind: 'profile', count: 1, endToEnd: false },
      { path: 'core/records/vault.jsonl', kind: 'vault', count: 2, endToEnd: true },
    ]);
    expect(read.contents.files.map((file) => file.path)).toEqual([
      'core/records/profile.jsonl',
      'core/records/vault.jsonl',
      'core/files/notes.txt',
      'core/files/streamed.txt',
      longPath,
    ]);
    expect(files.get('core/records/vault.jsonl')).toBe('{"v":"c2VjcmV0"}\n{"v":"b3RoZXI"}\n');
    expect(files.get('core/files/streamed.txt')).toBe('chunk '.repeat(1000));
    expect(files.get(longPath)).toBe('deep');
  });

  it('writes a tar the system tar reads, export.json first and contents.json last', async () => {
    const file = join(folder, 'export.tar');
    await writeFile(file, await sample());
    const listed = execFileSync('tar', ['-tf', file], { encoding: 'utf8' }).trim().split('\n');
    expect(listed[0]).toBe('export.json');
    expect(listed.at(-1)).toBe('contents.json');
    expect(listed).toContain(longPath);
    execFileSync('tar', ['-xf', file, '-C', folder]);
    expect(await readFile(join(folder, longPath), 'utf8')).toBe('deep');
  });

  it('writes a zip that unzip tests clean', async () => {
    const file = join(folder, 'export.zip');
    const bytes = await sample('zip');
    await writeFile(file, bytes);
    expect(Buffer.from(bytes.subarray(0, 4)).readUInt32LE(0)).toBe(0x04034b50);
    let unzip = true;
    try {
      execFileSync('unzip', ['-v'], { stdio: 'ignore' });
    } catch {
      unzip = false;
    }
    if (!unzip) return;
    const listed = execFileSync('unzip', ['-Z1', file], { encoding: 'utf8' }).trim().split('\n');
    expect(listed[0]).toBe('export.json');
    expect(listed.at(-1)).toBe('contents.json');
    execFileSync('unzip', ['-tq', file]);
    execFileSync('unzip', ['-q', file, '-d', folder]);
    expect(await readFile(join(folder, 'core/files/streamed.txt'), 'utf8')).toBe(
      'chunk '.repeat(1000),
    );
  });

  it('streams a file larger than it holds at once', async () => {
    const megabyte = new Uint8Array(1 << 20).fill(7);
    const writer = new ExportWriter({ head });
    let size = 0;
    const drained = (async () => {
      for await (const chunk of chunksOf(writer.readable)) size += chunk.byteLength;
    })();
    await writer.addFile(
      'core/files/big.bin',
      (async function* () {
        for (let i = 0; i < 64; i += 1) yield megabyte;
      })(),
      64 << 20,
    );
    await writer.finish();
    await drained;
    expect(size).toBeGreaterThan(64 << 20);
  });

  it('refuses paths, kinds and parts the format does not allow', async () => {
    const writer = new ExportWriter({ head });
    void collect(writer.readable).catch(() => undefined);
    expect(() => writer.addFile('../etc/passwd', utf8('x'))).toThrow(ExportError);
    expect(() => writer.addFile('core/./x', utf8('x'))).toThrow(ExportError);
    expect(() => writer.addFile('elsewhere/x', utf8('x'))).toThrow(ExportError);
    expect(() => writer.addFile('apps/Tusk/x', utf8('x'))).toThrow(ExportError);
    expect(() => writer.addRecords('core/records/x.json', 'x', [])).toThrow(ExportError);
    expect(() => writer.addRecords('core/records/x.jsonl', 'Bad', [])).toThrow(ExportError);
    expect(() => writer.addPart({ name: 'core', status: 'missing' })).toThrow(ExportError);
    await writer.addFile('apps/tusk/x', utf8('x'));
    writer.addPart({ name: 'tusk', status: 'missing', reason: 'invalid' });
    await expect(writer.finish()).rejects.toThrow(/has files/);
  });

  it('refuses a size that is not the one given', async () => {
    const writer = new ExportWriter({ head });
    const out = collect(writer.readable);
    await expect(writer.addFile('core/files/x', stream('ab', 3), 5)).rejects.toThrow(ExportError);
    await expect(out).rejects.toBeDefined();
  });

  it('refuses a head that is not one', () => {
    expect(() => new ExportWriter({ head: { ...head, sub: undefined } })).toThrow(
      /names its person/,
    );
    expect(() => new ExportWriter({ head: { ...head, takenAt: '2026-11-20' } })).toThrow(
      ExportError,
    );
    expect(() => new ExportWriter({ head: { ...head, kind: 'app' } as ExportHead })).toThrow(
      ExportError,
    );
  });
});

describe('checking an export', () => {
  const good = { path: 'export.json', body: utf8(JSON.stringify(head)) };
  const data = { path: 'core/files/a', body: utf8('abc') };
  const sha = (text: string) => createHash('sha256').update(text).digest('hex');
  const contents = (files: unknown[], parts: unknown[] = []) => ({
    path: 'contents.json',
    body: utf8(JSON.stringify({ parts, records: [], files })),
  });

  it('accepts an archive made by hand that follows the format', async () => {
    const tar = rawTar([
      good,
      data,
      contents([{ path: 'core/files/a', bytes: 3, sha256: sha('abc') }]),
    ]);
    await expect(readExport(tar)).resolves.toBeDefined();
  });

  it('refuses a changed byte', async () => {
    const bytes = await sample();
    const index = Buffer.from(bytes).indexOf('chunk chunk');
    bytes[index] = 'X'.charCodeAt(0);
    await expect(readExport(bytes)).rejects.toMatchObject({ code: 'mismatch' });
  });

  it('refuses a file listed and not there, and one there and not listed', async () => {
    const listed = rawTar([
      good,
      contents([{ path: 'core/files/a', bytes: 3, sha256: sha('abc') }]),
    ]);
    await expect(readExport(listed)).rejects.toMatchObject({ code: 'mismatch' });
    const unlisted = rawTar([good, data, contents([])]);
    await expect(readExport(unlisted)).rejects.toMatchObject({ code: 'mismatch' });
  });

  it('refuses a path outside the archive', async () => {
    const tar = rawTar([good, { path: 'core/../../etc/x', body: utf8('x') }, contents([])]);
    await expect(readExport(tar)).rejects.toMatchObject({ code: 'invalid_path' });
  });

  it('refuses an entry that is not a regular file', async () => {
    const link = tarHeader('core/link', 0, 0);
    link[156] = '2'.charCodeAt(0);
    let sum = 0;
    link.fill(0x20, 148, 156);
    for (const byte of link) sum += byte;
    link.set(utf8(sum.toString(8).padStart(6, '0') + '\0 '), 148);
    const tar = concat([rawTar([good]).subarray(0, -1024), link, TAR_END]);
    await expect(readExport(tar)).rejects.toMatchObject({ code: 'invalid_archive' });
  });

  it('refuses an unknown format, naming it', async () => {
    const tar = rawTar([
      { path: 'export.json', body: utf8(JSON.stringify({ ...head, format: 2 })) },
      contents([]),
    ]);
    await expect(readExport(tar)).rejects.toMatchObject({ code: 'unknown_format' });
  });

  it('refuses an archive whose first entry is not export.json, or that is cut short', async () => {
    await expect(readExport(rawTar([data, good]))).rejects.toMatchObject({
      code: 'invalid_archive',
    });
    const bytes = await sample();
    await expect(readExport(bytes.subarray(0, bytes.byteLength - 2048))).rejects.toBeInstanceOf(
      ExportError,
    );
  });

  it('refuses a missing part that has files', async () => {
    const tar = rawTar([
      good,
      data,
      contents(
        [{ path: 'core/files/a', bytes: 3, sha256: sha('abc') }],
        [{ name: 'core', status: 'missing', reason: 'refused' }],
      ),
    ]);
    await expect(readExport(tar)).rejects.toMatchObject({ code: 'invalid_contents' });
  });
});

describe('encryption', () => {
  it('opens with the identity and with no other key', async () => {
    const identity = await generateX25519Identity();
    const other = await generateX25519Identity();
    const recipient = await identityToRecipient(identity);
    const plain = await sample();
    const sealed = await collect(await encryptTo([recipient], plain));
    expect(Buffer.from(sealed).includes(Buffer.from('export.json'))).toBe(false);
    const opened = await collect(await decryptWith([identity], sealed));
    expect(Buffer.from(opened).equals(Buffer.from(plain))).toBe(true);
    await expect(readExport(await decryptWith([identity], sealed))).resolves.toBeDefined();
    await expect(decryptWith([other], sealed).then(collect)).rejects.toBeDefined();
  });

  it('opens with the system age when it is installed', async () => {
    let age = true;
    try {
      execFileSync('age', ['--version'], { stdio: 'ignore' });
    } catch {
      age = false;
    }
    if (!age) return;
    const identity = await generateX25519Identity();
    const key = join(folder, 'key.txt');
    await writeFile(key, identity + '\n', { mode: 0o600 });
    const sealed = await collect(
      await encryptTo([await identityToRecipient(identity)], await sample()),
    );
    await writeFile(join(folder, 'x.tar.age'), sealed);
    const opened = execFileSync('age', ['-d', '-i', key, join(folder, 'x.tar.age')]);
    await expect(readExport(new Uint8Array(opened))).resolves.toBeDefined();
  });

  it('parses a pasted line of recipients and refuses anything else', async () => {
    const one = await identityToRecipient(await generateX25519Identity());
    const two = await identityToRecipient(await generateX25519Identity());
    expect(parseRecipients(` ${one}, ${two}\n`)).toEqual([one, two]);
    expect(() => parseRecipients('')).toThrow(/no recipient/);
    expect(() => parseRecipients('ssh-ed25519 AAAA')).toThrow(ExportError);
    expect(() => parseRecipients(`${one} ${one}`)).toThrow(/twice/);
    expect(() => parseRecipients(one.slice(0, -1) + (one.endsWith('q') ? 'p' : 'q'))).toThrow(
      ExportError,
    );
    expect(recipientFingerprint(one)).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe('file names', () => {
  it('names an export by host, time and kind', () => {
    expect(exportFileName(head, 'Sovereign.Example.org', 'zip')).toBe(
      'sovereign-sovereign.example.org-20261120T100000Z-person.zip',
    );
    expect(
      exportFileName({ ...head, kind: 'app', app: 'tusk', sub: undefined }, 'x.org', 'tar.age'),
    ).toBe('sovereign-x.org-tusk-20261120T100000Z-app.tar.age');
  });
});
