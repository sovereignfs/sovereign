/**
 * `@sovereignfs/export/browser`: writing an export (`contracts/export.md`) in a page, for an app whose data only the browser can open.
 * It imports no `node:` module (a test follows every import from here to hold that). The data is in memory, as a page holds it, so
 * nothing is spooled; SHA-256 is the browser's (`crypto.subtle`), and the archive's CRC-32 is computed here.
 */
import { concat, utf8 } from './bytes.js';
import { ExportError } from './errors.js';
import { checkHead } from './head.js';
import { checkPath, isDataPath, isKind, partFolder } from './paths.js';
import { TAR_END, tarHeader, tarPadding } from './tar.js';
import type { ExportContents, ExportHead, ExportPart, FileEntry, RecordsEntry } from './types.js';
import {
  needsZip64,
  zipCentralDirectory,
  zipDataDescriptor,
  zipLocalHeader,
  zipName,
  type ZipEntry,
} from './zip.js';

export { checkHead, FORMAT } from './head.js';
export { exportFileName } from './name.js';
export { ExportError, type ExportErrorCode } from './errors.js';
export type { ExportContents, ExportHead, ExportPart } from './types.js';

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

/** CRC-32 (ISO-HDLC), as zip asks: the same answer as `node:zlib`'s `crc32`. */
export function crc32(bytes: Uint8Array, previous = 0): number {
  let crc = ~previous >>> 0;
  for (const byte of bytes) crc = (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  return ~crc >>> 0;
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = new Uint8Array(
    await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>),
  );
  return [...digest].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export interface BrowserExportWriterOptions {
  head: ExportHead;
  /** `tar` (the default) or `zip`, for a person who opens it on their own computer. */
  archive?: 'tar' | 'zip';
}

export interface BrowserExport {
  /** The archive's bytes, to be given to the person as a file. */
  bytes: Uint8Array;
  contents: ExportContents;
}

/**
 * Writes one export in a page, the same format `ExportWriter` writes on a server: `export.json` first, the data files, then
 * `contents.json`. A path, a kind or a part the format does not allow throws, as it does there.
 */
export class BrowserExportWriter {
  readonly head: ExportHead;
  readonly #archive: 'tar' | 'zip';
  readonly #when: Date;
  readonly #paths = new Set<string>();
  readonly #entries: { path: string; bytes: Uint8Array; listed: boolean }[] = [];
  readonly #records: RecordsEntry[] = [];
  readonly #parts: ExportPart[] = [];
  #finished = false;

  constructor(options: BrowserExportWriterOptions) {
    this.head = checkHead(options.head);
    this.#archive = options.archive ?? 'tar';
    this.#when = new Date(this.head.takenAt);
  }

  #open(): void {
    if (this.#finished) throw new ExportError('closed', 'This export is already finished.');
  }

  #claim(path: string): void {
    checkPath(path);
    if (!isDataPath(path)) {
      throw new ExportError('invalid_path', `${path} is not under core/ or apps/<prefix>/.`);
    }
    if (this.#paths.has(path)) throw new ExportError('invalid_path', `${path} is added twice.`);
    this.#paths.add(path);
  }

  /** Adds a file of bytes. */
  addFile(path: string, bytes: Uint8Array): void {
    this.#open();
    this.#claim(path);
    this.#entries.push({ path, bytes, listed: true });
  }

  /** Adds a file of records, one JSON object per line, and lists it as records of `kind`. */
  addRecords(
    path: string,
    kind: string,
    records: Iterable<unknown>,
    options: { endToEnd?: boolean } = {},
  ): void {
    this.#open();
    if (!isKind(kind))
      throw new ExportError('invalid_path', `${JSON.stringify(kind)} is not a kind of record.`);
    if (!path.endsWith('.jsonl'))
      throw new ExportError('invalid_path', `${path} does not end in .jsonl.`);
    const lines: string[] = [];
    for (const record of records) {
      if (typeof record !== 'object' || record === null || Array.isArray(record)) {
        throw new ExportError('invalid_contents', `A record of ${kind} is not an object.`);
      }
      lines.push(JSON.stringify(record) + '\n');
    }
    this.#claim(path);
    this.#entries.push({ path, bytes: utf8(lines.join('')), listed: true });
    this.#records.push({ path, kind, count: lines.length, endToEnd: options.endToEnd === true });
  }

  /** Records one producer whose data the export was meant to hold. A missing part must have no files. */
  addPart(part: ExportPart): void {
    this.#open();
    if (this.#parts.some((existing) => existing.name === part.name)) {
      throw new ExportError('invalid_contents', `The part ${part.name} is added twice.`);
    }
    if ((part.status === 'missing') !== (part.reason !== undefined)) {
      throw new ExportError(
        'invalid_contents',
        `The part ${part.name} must have a reason if and only if it is missing.`,
      );
    }
    this.#parts.push({ ...part });
  }

  /** Writes `contents.json` and the archive, and closes the writer. */
  async finish(): Promise<BrowserExport> {
    this.#open();
    for (const part of this.#parts) {
      const folder = partFolder(part.name);
      if (part.status === 'missing' && [...this.#paths].some((path) => path.startsWith(folder))) {
        throw new ExportError('invalid_contents', `The missing part ${part.name} has files.`);
      }
    }
    this.#finished = true;
    const files: FileEntry[] = [];
    for (const entry of this.#entries) {
      files.push({
        path: entry.path,
        bytes: entry.bytes.byteLength,
        sha256: await sha256(entry.bytes),
      });
    }
    const contents: ExportContents = { parts: this.#parts, records: this.#records, files };
    const all = [
      { path: 'export.json', bytes: utf8(JSON.stringify(this.head, null, 2) + '\n') },
      ...this.#entries,
      { path: 'contents.json', bytes: utf8(JSON.stringify(contents, null, 2) + '\n') },
    ];
    return { bytes: this.#archive === 'zip' ? this.#zip(all) : this.#tar(all), contents };
  }

  #tar(entries: { path: string; bytes: Uint8Array }[]): Uint8Array {
    const mtime = Math.floor(this.#when.getTime() / 1000);
    const parts: Uint8Array[] = [];
    for (const { path, bytes } of entries) {
      parts.push(
        tarHeader(path, bytes.byteLength, mtime),
        bytes,
        new Uint8Array(tarPadding(bytes.byteLength)),
      );
    }
    parts.push(TAR_END);
    return concat(parts);
  }

  #zip(entries: { path: string; bytes: Uint8Array }[]): Uint8Array {
    const parts: Uint8Array[] = [];
    const zipEntries: ZipEntry[] = [];
    let offset = 0;
    const emit = (chunk: Uint8Array) => {
      parts.push(chunk);
      offset += chunk.byteLength;
    };
    for (const { path, bytes } of entries) {
      const entry: ZipEntry = {
        name: zipName(path),
        offset,
        size: bytes.byteLength,
        crc: 0,
        zip64: needsZip64(bytes.byteLength, offset),
      };
      emit(zipLocalHeader(entry, this.#when));
      emit(bytes);
      entry.crc = crc32(bytes);
      emit(zipDataDescriptor(entry));
      zipEntries.push(entry);
    }
    emit(zipCentralDirectory(zipEntries, offset, this.#when));
    return concat(parts);
  }
}
