import { createWriteStream } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { once } from 'node:events';
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
export function readArchive(
  archive: Buffer,
  allowed: (name: string) => boolean,
  options: { maxBytes?: number; stripDot?: boolean } = {},
): Entry[] {
  if (archive.length > (options.maxBytes ?? MAX_ARCHIVE_BYTES)) {
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
    const written = longName ?? (prefix ? `${prefix}/` : '') + text(header, 0, 100);
    // A tar made with `tar -C dir .` names everything `./name`.
    const name = options.stripDot ? written.replace(/^\.\//, '') : written;
    longName = undefined;
    if (type === '5' || (options.stripDot && written === '.')) continue;
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
    entries.push({ name, data });
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

/** What `sv restore` sends: the deployment's files as one archive, then the backup, with the length of the first in front. */
export function joinRestore(deployment: Buffer, backup: Buffer): Buffer {
  const length = Buffer.alloc(8);
  length.writeBigUInt64BE(BigInt(deployment.length));
  return Buffer.concat([length, deployment, backup]);
}

export function splitRestore(sent: Buffer): { deployment: Buffer; backup: Buffer } {
  if (sent.length < 8) throw new Refused('The restore was cut short.');
  const length = Number(sent.readBigUInt64BE(0));
  if (length > MAX_ARCHIVE_BYTES || 8 + length > sent.length)
    throw new Refused('The restore is not in the shape the toolkit sends.');
  return { deployment: sent.subarray(8, 8 + length), backup: sent.subarray(8 + length) };
}

/** Pulls exact numbers of bytes from a stream that arrives in chunks of any size, and hands back the rest of it as it is. */
export class ChunkReader {
  readonly #iterator: AsyncIterator<Uint8Array>;
  #buffer: Buffer = Buffer.alloc(0);
  #done = false;

  constructor(source: AsyncIterable<Uint8Array>) {
    this.#iterator = source[Symbol.asyncIterator]();
  }

  async #more(): Promise<boolean> {
    if (this.#done) return false;
    const next = await this.#iterator.next();
    if (next.done) {
      this.#done = true;
      return false;
    }
    const chunk = Buffer.from(next.value);
    this.#buffer = this.#buffer.length === 0 ? chunk : Buffer.concat([this.#buffer, chunk]);
    return true;
  }

  /** Exactly `length` bytes, or the fewer there were when the stream ended. */
  async take(length: number): Promise<Buffer> {
    while (this.#buffer.length < length && (await this.#more())) {
      // keep reading
    }
    const taken = this.#buffer.subarray(0, length);
    this.#buffer = this.#buffer.subarray(length);
    return taken;
  }

  /** The next chunk, whatever size, or nothing at the end: for writing a body to disk without holding it. */
  async next(limit: number): Promise<Buffer | undefined> {
    if (this.#buffer.length === 0 && !(await this.#more())) return undefined;
    const taken = this.#buffer.subarray(0, limit);
    this.#buffer = this.#buffer.subarray(limit);
    return taken;
  }
}

/**
 * Takes a restore's frame from a stream (see `joinRestore`): the deployment's files, which are small and held, and then the backup,
 * which may be of any size and is handed back as the reader to carry on with.
 */
export async function takeRestoreFrame(reader: ChunkReader): Promise<{ deployment: Buffer }> {
  const head = await reader.take(8);
  if (head.length < 8) throw new Refused('The restore was cut short.');
  const length = Number(head.readBigUInt64BE(0));
  if (length > MAX_ARCHIVE_BYTES)
    throw new Refused('The restore is not in the shape the toolkit sends.');
  const deployment = await reader.take(length);
  if (deployment.length < length) throw new Refused('The restore was cut short.');
  return { deployment };
}

export type StreamRules = {
  /** Whether a name may be in the archive at all; the same list a whole archive is held to. */
  allowed: (name: string) => boolean;
  /** Names that are read and thrown away rather than written, such as the server's own `state.json`. */
  skip?: (name: string) => boolean;
  /** A tar made with `tar -C dir .` names everything `./name`. */
  stripDot?: boolean;
  maxEntries?: number;
  /** Called after about every 64 MiB written, so a restore that would fill the disk stops before it does. */
  guard?: (written: number) => Promise<void>;
  /** How many bytes between asks of the guard. Default 64 MiB. */
  guardEvery?: number;
};

const GUARD_EVERY = 64 * 1024 * 1024;

/**
 * Writes the files of a tar stream under `dir` as they arrive, so a backup of any size is never held in memory (operator-cli §10.2). The
 * same rules as `readArchive`: regular files and folders only, names that stay inside `dir`, every name on the allowed list. Whatever
 * has been written when the archive turns out to be wrong stays, which is why `dir` is a place of its own that the next run removes.
 */
export async function extractStream(
  reader: ChunkReader,
  dir: string,
  rules: StreamRules,
): Promise<{ names: string[]; bytes: number }> {
  const names: string[] = [];
  let bytes = 0;
  let sinceGuard = 0;
  let longName: string | undefined;
  for (;;) {
    const header = await reader.take(BLOCK);
    if (header.length < BLOCK) {
      if (header.length === 0 || header.every((byte) => byte === 0)) break;
      throw new Refused('The archive ends before its last file does.');
    }
    if (header.every((byte) => byte === 0)) break;
    const type = String.fromCharCode(header[156] === 0 ? 0x30 : (header[156] as number));
    const sizeText = text(header, 124, 136).trim();
    if (!/^[0-7]*$/.test(sizeText)) throw new Refused('The archive is not one this can read.');
    const size = sizeText === '' ? 0 : parseInt(sizeText, 8);
    const padding = (BLOCK - (size % BLOCK)) % BLOCK;

    if (type === 'g' || type === 'x') {
      if (size > 1024 * 1024) throw new Refused('The archive is not one this can read.');
      const data = await reader.take(size);
      await reader.take(padding);
      if (type === 'x') longName = paxPath(data);
      continue;
    }
    const prefix = text(header, 345, 500);
    const written = longName ?? (prefix ? `${prefix}/` : '') + text(header, 0, 100);
    const name = rules.stripDot ? written.replace(/^\.\//, '') : written;
    longName = undefined;
    if (type === '5' || (rules.stripDot && written === '.')) continue;
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
    if (!rules.allowed(name))
      throw new Refused(`The archive holds a file that is not an instance file: ${name}.`);
    if (names.length >= (rules.maxEntries ?? MAX_ENTRIES))
      throw new Refused('The archive holds too many files.');

    const discard = rules.skip?.(name) ?? false;
    const target = path.join(dir, name);
    if (!discard) await mkdir(path.dirname(target), { recursive: true, mode: 0o755 });
    const out = discard ? undefined : createWriteStream(target, { mode: 0o644 });
    let left = size;
    try {
      while (left > 0) {
        const chunk = await reader.next(left);
        if (!chunk) throw new Refused('The archive ends before its last file does.');
        left -= chunk.length;
        bytes += chunk.length;
        sinceGuard += chunk.length;
        if (out && !out.write(chunk)) await once(out, 'drain');
        if (rules.guard && sinceGuard >= (rules.guardEvery ?? GUARD_EVERY)) {
          sinceGuard = 0;
          await rules.guard(bytes);
        }
      }
      if (out) {
        out.end();
        await once(out, 'close');
      }
    } catch (error) {
      out?.destroy();
      await rm(target, { force: true });
      throw error;
    }
    await reader.take(padding);
    if (!discard) names.push(name);
  }
  return { names, bytes };
}
