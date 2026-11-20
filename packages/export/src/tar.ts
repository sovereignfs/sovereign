import { ByteReader, concat, utf8 } from './bytes.js';
import { ExportError } from './errors.js';
import type { ByteSource } from './types.js';

const BLOCK = 512;
const MAX_OCTAL_SIZE = 8 ** 11 - 1;
/** The two empty blocks that end a tar archive. */
export const TAR_END = new Uint8Array(BLOCK * 2);

function writeString(block: Uint8Array, offset: number, length: number, value: Uint8Array): void {
  block.set(value.subarray(0, length), offset);
}

function writeOctal(block: Uint8Array, offset: number, length: number, value: number): void {
  writeString(block, offset, length, utf8(value.toString(8).padStart(length - 1, '0') + '\0'));
}

function header(
  name: Uint8Array,
  prefix: Uint8Array,
  size: number,
  type: string,
  mtime: number,
): Uint8Array {
  const block = new Uint8Array(BLOCK);
  writeString(block, 0, 100, name);
  writeOctal(block, 100, 8, 0o644);
  writeOctal(block, 108, 8, 0);
  writeOctal(block, 116, 8, 0);
  writeOctal(block, 124, 12, size > MAX_OCTAL_SIZE ? 0 : size);
  writeOctal(block, 136, 12, mtime);
  block.fill(0x20, 148, 156);
  block[156] = type.charCodeAt(0);
  writeString(block, 257, 6, utf8('ustar\0'));
  writeString(block, 263, 2, utf8('00'));
  writeString(block, 345, 155, prefix);
  let sum = 0;
  for (const byte of block) sum += byte;
  writeString(block, 148, 8, utf8(sum.toString(8).padStart(6, '0') + '\0 '));
  return block;
}

function paxRecord(key: string, value: string): string {
  const body = ` ${key}=${value}\n`;
  const bytes = Buffer.byteLength(body, 'utf8');
  let length = bytes + 1;
  while (bytes + String(length).length !== length) length = bytes + String(length).length;
  return `${length}${body}`;
}

function ustarSplit(path: Uint8Array): { name: Uint8Array; prefix: Uint8Array } | undefined {
  if (path.byteLength <= 100) return { name: path, prefix: new Uint8Array(0) };
  if (path.byteLength > 256) return undefined;
  for (let i = path.byteLength - 1; i > 0; i -= 1) {
    if (path[i] !== 0x2f) continue;
    const prefix = path.subarray(0, i);
    const name = path.subarray(i + 1);
    if (prefix.byteLength <= 155 && name.byteLength <= 100 && name.byteLength > 0)
      return { name, prefix };
  }
  return undefined;
}

/** The header blocks for one regular file: a pax header first when the name or the size needs one. */
export function tarHeader(path: string, size: number, mtime: number): Uint8Array {
  const bytes = utf8(path);
  const split = ustarSplit(bytes);
  const records: string[] = [];
  if (!split) records.push(paxRecord('path', path));
  if (size > MAX_OCTAL_SIZE) records.push(paxRecord('size', String(size)));
  const own = header(
    split?.name ?? bytes.subarray(0, 100),
    split?.prefix ?? new Uint8Array(0),
    size,
    '0',
    mtime,
  );
  if (records.length === 0) return own;
  const pax = utf8(records.join(''));
  const paxHeader = header(utf8('PaxHeader'), new Uint8Array(0), pax.byteLength, 'x', mtime);
  return concat([paxHeader, pax, new Uint8Array(tarPadding(pax.byteLength)), own]);
}

/** How many zero bytes follow `size` bytes of data to fill its last block. */
export function tarPadding(size: number): number {
  const rest = size % BLOCK;
  return rest === 0 ? 0 : BLOCK - rest;
}

/** One entry of a tar archive. Its body MUST be read, or skipped with `skip`, before the next entry. */
export interface TarEntry {
  path: string;
  size: number;
  type: 'file';
  body: AsyncGenerator<Uint8Array>;
}

function bad(message: string): never {
  throw new ExportError('invalid_archive', message);
}

function readString(block: Uint8Array, offset: number, length: number): string {
  const slice = block.subarray(offset, offset + length);
  const end = slice.indexOf(0);
  return Buffer.from(end === -1 ? slice : slice.subarray(0, end)).toString('utf8');
}

function readOctal(block: Uint8Array, offset: number, length: number): number {
  const text = readString(block, offset, length).trim();
  if (text === '') return 0;
  if (!/^[0-7]+$/.test(text)) bad('A tar header holds a number that is not octal.');
  return Number.parseInt(text, 8);
}

function checksumOk(block: Uint8Array): boolean {
  const stored = readOctal(block, 148, 8);
  let sum = 0;
  for (let i = 0; i < BLOCK; i += 1) sum += i >= 148 && i < 156 ? 0x20 : (block[i] ?? 0);
  return sum === stored;
}

function parsePax(data: Uint8Array): Map<string, string> {
  const bytes = Buffer.from(data);
  const out = new Map<string, string>();
  let at = 0;
  while (at < bytes.byteLength) {
    const space = bytes.indexOf(0x20, at);
    if (space === -1) bad('A pax header is malformed.');
    const length = Number.parseInt(bytes.subarray(at, space).toString('latin1'), 10);
    if (!Number.isSafeInteger(length) || length <= space - at || at + length > bytes.byteLength)
      bad('A pax header is malformed.');
    const record = bytes.subarray(space + 1, at + length);
    const equals = record.indexOf(0x3d);
    if (equals === -1 || record[record.byteLength - 1] !== 0x0a) bad('A pax header is malformed.');
    out.set(
      record.subarray(0, equals).toString('utf8'),
      record.subarray(equals + 1, -1).toString('utf8'),
    );
    at += length;
  }
  return out;
}

const MAX_PAX = 64 * 1024;

/**
 * Reads a tar archive's regular files in order, refusing anything else: links, directories, devices, a bad checksum, data cut short,
 * or anything after the end.
 */
export async function* readTar(source: ByteSource): AsyncGenerator<TarEntry> {
  const reader = new ByteReader(source);
  let pax = new Map<string, string>();
  try {
    for (;;) {
      const block = await reader.exactly(BLOCK);
      if (!block) bad('The archive ends without its end.');
      if (block.every((byte) => byte === 0)) {
        const second = await reader.exactly(BLOCK);
        if (!second || !second.every((byte) => byte === 0))
          bad('The archive ends without its end.');
        // Anything after the end is refused, padding of zeros aside.
        for (;;) {
          const rest = await reader.exactly(BLOCK);
          if (!rest) break;
          if (!rest.every((byte) => byte === 0)) bad('The archive has data after its end.');
        }
        if (!(await reader.atEnd())) bad('The archive has data after its end.');
        return;
      }
      if (!checksumOk(block)) bad('A tar header has a bad checksum.');
      const type = String.fromCharCode(block[156] ?? 0);
      let size = readOctal(block, 124, 12);
      if (type === 'x') {
        if (size > MAX_PAX) bad('A pax header is too large.');
        const data = await reader.exactly(size);
        if (!data) bad('The archive ends inside a pax header.');
        await reader.exactly(tarPadding(size));
        pax = parsePax(data);
        continue;
      }
      if (type !== '0' && type !== '\0')
        bad(
          `The archive holds an entry that is not a regular file (type ${JSON.stringify(type)}).`,
        );
      const prefix = readString(block, 345, 155);
      const name = readString(block, 0, 100);
      const path = pax.get('path') ?? (prefix ? `${prefix}/${name}` : name);
      const paxSize = pax.get('size');
      if (paxSize !== undefined) {
        if (!/^\d+$/.test(paxSize)) bad('A pax size is not a number.');
        size = Number(paxSize);
        if (!Number.isSafeInteger(size)) bad('A pax size is too large.');
      }
      pax = new Map();
      let read = 0;
      const body = (async function* () {
        while (read < size) {
          const next = reader.upTo(Math.min(size - read, 1 << 20));
          let got = 0;
          for await (const chunk of next) {
            read += chunk.byteLength;
            got += chunk.byteLength;
            yield chunk;
          }
          if (got === 0) return;
        }
      })();
      yield { path, size, type: 'file', body };
      // Whatever the consumer did not read is read here, so the archive stays in step.
      await body.return(undefined);
      while (read < size) {
        let got = 0;
        for await (const chunk of reader.upTo(size - read)) {
          read += chunk.byteLength;
          got += chunk.byteLength;
        }
        if (got === 0) break;
      }
      if (read !== size) bad(`The archive ends inside ${path}.`);
      const padding = tarPadding(size);
      if (padding > 0 && !(await reader.exactly(padding))) bad(`The archive ends inside ${path}.`);
    }
  } finally {
    await reader.close();
  }
}
