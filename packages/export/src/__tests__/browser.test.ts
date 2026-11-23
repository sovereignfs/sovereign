import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32 as nodeCrc32 } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { chunksOf, concat, utf8 } from '../bytes.js';
import { BrowserExportWriter, crc32 } from '../browser.js';
import { ExportError, ExportWriter, readExport, type ExportHead } from '../index.js';

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const head: ExportHead = {
  format: 1,
  kind: 'person',
  producer: { name: 'shopper', version: '0.4.0' },
  instance: { id: 'instance-1', url: 'https://shopper.example.org' },
  sub: 'person-1',
  takenAt: '2026-11-23T10:00:00.000Z',
};

const records = [
  { id: 'l1', name: 'Groceries' },
  { id: 'l2', name: 'Hardware', note: 'Screws, 4 mm' },
];
const photo = utf8('not really a picture, but bytes all the same');

async function nodeArchive(archive: 'tar' | 'zip'): Promise<Uint8Array> {
  const writer = new ExportWriter({ head, archive });
  const out = (async () => {
    const parts: Uint8Array[] = [];
    for await (const chunk of chunksOf(writer.readable)) parts.push(chunk);
    return concat(parts);
  })();
  await writer.addRecords('apps/shopper/lists.jsonl', 'list', records, { endToEnd: false });
  await writer.addFile('apps/shopper/files/photo.bin', photo);
  writer.addPart({ name: 'shopper', status: 'complete' });
  await writer.finish();
  return out;
}

async function browserArchive(archive: 'tar' | 'zip') {
  const writer = new BrowserExportWriter({ head, archive });
  writer.addRecords('apps/shopper/lists.jsonl', 'list', records, { endToEnd: false });
  writer.addFile('apps/shopper/files/photo.bin', photo);
  writer.addPart({ name: 'shopper', status: 'complete' });
  return writer.finish();
}

/** Every module the browser's entry reaches, following relative imports. */
function reachedFrom(entry: string): Map<string, string> {
  const seen = new Map<string, string>();
  const visit = (file: string) => {
    if (seen.has(file)) return;
    const text = readFileSync(file, 'utf8');
    seen.set(file, text);
    for (const [, spec] of text.matchAll(/(?:import|export)[^'"]*?from\s+'([^']+)'/g)) {
      if (spec?.startsWith('.')) visit(join(dirname(file), spec.replace(/\.js$/, '.ts')));
    }
  };
  visit(entry);
  return seen;
}

describe('the browser writer', () => {
  it('reaches no node: module, and nothing outside the package', () => {
    const reached = reachedFrom(join(SRC, 'browser.ts'));
    expect(reached.size).toBeGreaterThan(3);
    for (const [file, text] of reached) {
      const imports = [...text.matchAll(/(?:import|export)[^'"]*?from\s+'([^']+)'/g)].map(
        (m) => m[1],
      );
      expect(
        imports.filter((spec) => !spec?.startsWith('.')),
        file,
      ).toEqual([]);
    }
  });

  it('computes zip’s CRC-32 as node:zlib does', () => {
    for (const bytes of [new Uint8Array(0), utf8('a'), utf8('The quick brown fox'), photo]) {
      expect(crc32(bytes)).toBe(nodeCrc32(bytes));
    }
    expect(crc32(utf8('fox'), crc32(utf8('The quick brown ')))).toBe(
      nodeCrc32(utf8('The quick brown fox')),
    );
  });

  it('writes the same archive as the server’s writer, byte for byte, as tar and as zip', async () => {
    for (const archive of ['tar', 'zip'] as const) {
      const fromPage = await browserArchive(archive);
      expect(fromPage.bytes, archive).toEqual(await nodeArchive(archive));
    }
  });

  it('writes what readExport reads back, checked', async () => {
    const { bytes, contents } = await browserArchive('tar');
    const files: Record<string, string> = {};
    const read = await readExport(bytes, {
      onFile: async ({ path, body }) => {
        const parts: Uint8Array[] = [];
        for await (const chunk of body) parts.push(chunk);
        files[path] = new TextDecoder().decode(concat(parts));
      },
    });
    expect(read.head).toEqual(head);
    expect(read.contents).toEqual(contents);
    expect(
      files['apps/shopper/lists.jsonl']
        ?.trim()
        .split('\n')
        .map((line) => JSON.parse(line)),
    ).toEqual(records);
  });

  it('refuses what the format does not allow, as the server’s does', async () => {
    const writer = new BrowserExportWriter({ head });
    expect(() => writer.addFile('elsewhere/x.bin', photo)).toThrow(ExportError);
    expect(() => writer.addRecords('apps/shopper/x.json', 'list', [])).toThrow(ExportError);
    expect(() => writer.addRecords('apps/shopper/x.jsonl', 'list', [3])).toThrow(ExportError);
    writer.addFile('apps/shopper/a.bin', photo);
    expect(() => writer.addFile('apps/shopper/a.bin', photo)).toThrow(ExportError);
    writer.addPart({ name: 'shopper', status: 'missing', reason: 'unreachable' });
    await expect(writer.finish()).rejects.toThrow(ExportError);
  });
});
