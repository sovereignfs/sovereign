import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Refused } from '../errors.js';

export type Entry = { name: string; data: Buffer };

const BLOCK = 512;
export const MAX_ARCHIVE_BYTES = 32 * 1024 * 1024;
const MAX_ENTRIES = 1000;

const text = (header: Buffer, from: number, to: number) => {
  const slice = header.subarray(from, to);
  const end = slice.indexOf(0);
  return slice.subarray(0, end === -1 ? slice.length : end).toString('utf8');
};

/** `len key=value\n` records of a pax header: the long names `git archive` writes for paths over 100 characters. */
function paxPath(data: Buffer): string | undefined {
  let at = 0;
  let found: string | undefined;
  while (at < data.length) {
    const space = data.indexOf(0x20, at);
    if (space === -1) break;
    const length = Number(data.subarray(at, space).toString('utf8'));
    if (!Number.isInteger(length) || length <= 0 || at + length > data.length) break;
    const record = data.subarray(space + 1, at + length - 1).toString('utf8');
    if (record.startsWith('path=')) found = record.slice('path='.length);
    at += length;
  }
  return found;
}

/**
 * Reads a tar archive that holds files and nothing else (operator-cli §8): regular files and folders, under names that stay inside
 * where they are put. A link, a device, a name that climbs out, or an archive too large is refused whole, before anything is written.
 * It reads what `git archive` writes, which is ustar with pax headers for long names and for the commit.
 */
export function readArchive(archive: Buffer, allowed: (name: string) => boolean): Entry[] {
  if (archive.length > MAX_ARCHIVE_BYTES) {
    throw new Refused('The archive is larger than a deployment can be.');
  }
  const entries: Entry[] = [];
  let at = 0;
  let longName: string | undefined;
  while (at + BLOCK <= archive.length) {
    const header = archive.subarray(at, at + BLOCK);
    if (header.every((byte) => byte === 0)) break;
    const type = String.fromCharCode(header[156] === 0 ? 0x30 : (header[156] as number));
    const sizeText = text(header, 124, 136).trim();
    if (!/^[0-7]*$/.test(sizeText)) throw new Refused('The archive is not one this can read.');
    const size = sizeText === '' ? 0 : parseInt(sizeText, 8);
    const start = at + BLOCK;
    if (start + size > archive.length)
      throw new Refused('The archive ends before its last file does.');
    const data = archive.subarray(start, start + size);
    at = start + Math.ceil(size / BLOCK) * BLOCK;
    if (type === 'g') continue;
    if (type === 'x') {
      longName = paxPath(data);
      continue;
    }
    const prefix = text(header, 345, 500);
    const name = longName ?? (prefix ? `${prefix}/` : '') + text(header, 0, 100);
    longName = undefined;
    if (type === '5') continue;
    if (type !== '0') throw new Refused(`The archive holds something that is not a file: ${name}.`);
    if (
      name === '' ||
      name.startsWith('/') ||
      name.includes('\\') ||
      name.includes('\0') ||
      name.split('/').some((part) => part === '..' || part === '.' || part === '')
    ) {
      throw new Refused(`The archive holds a name that is not allowed: ${name}.`);
    }
    if (!allowed(name))
      throw new Refused(`The archive holds a file that is not an instance file: ${name}.`);
    if (entries.length >= MAX_ENTRIES) throw new Refused('The archive holds too many files.');
    entries.push({ name, data: Buffer.from(data) });
  }
  return entries;
}

/** Writes the entries under `dir`, which must be a place of its own. */
export async function extract(entries: Entry[], dir: string): Promise<void> {
  for (const entry of entries) {
    const target = path.join(dir, entry.name);
    await mkdir(path.dirname(target), { recursive: true, mode: 0o755 });
    await writeFile(target, entry.data, { mode: 0o644 });
  }
}

/** A tar archive of files, for a test and for nothing else: `git archive` is what makes the real one. */
export function makeArchive(files: Record<string, string>): Buffer {
  const blocks: Buffer[] = [];
  for (const [name, body] of Object.entries(files)) {
    const header = Buffer.alloc(BLOCK);
    header.write(name, 0, 100, 'utf8');
    header.write('0000644\0', 100);
    header.write('0000000\0', 108);
    header.write('0000000\0', 116);
    header.write(`${Buffer.byteLength(body).toString(8).padStart(11, '0')}\0`, 124);
    header.write('00000000000\0', 136);
    header.write('        ', 148);
    header.write('0', 156);
    header.write('ustar\0', 257);
    header.write('00', 263);
    let sum = 0;
    for (const byte of header) sum += byte;
    header.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148);
    blocks.push(header);
    const data = Buffer.from(body);
    blocks.push(data, Buffer.alloc((BLOCK - (data.length % BLOCK)) % BLOCK));
  }
  blocks.push(Buffer.alloc(BLOCK * 2));
  return Buffer.concat(blocks);
}
