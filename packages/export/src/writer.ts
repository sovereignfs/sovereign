import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdtemp, open, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crc32 } from 'node:zlib';
import { chunksOf, utf8 } from './bytes.js';
import { ExportError } from './errors.js';
import { checkHead } from './head.js';
import { checkPath, isDataPath, isKind, partFolder } from './paths.js';
import { TAR_END, tarHeader, tarPadding } from './tar.js';
import type {
  ByteSource,
  ExportContents,
  ExportHead,
  ExportPart,
  FileEntry,
  RecordsEntry,
} from './types.js';
import {
  needsZip64,
  zipCentralDirectory,
  zipDataDescriptor,
  zipLocalHeader,
  zipName,
  type ZipEntry,
} from './zip.js';

export interface ExportWriterOptions {
  head: ExportHead;
  /** `tar` (the default, and the only choice for an export that is encrypted) or `zip`, for a person's export. */
  archive?: 'tar' | 'zip';
  /** Where data of unknown size is held while its size is learned. Default: the system's temporary folder. */
  spoolDirectory?: string;
}

type Records = Iterable<unknown> | AsyncIterable<unknown>;

/**
 * Writes one export (`contracts/export.md`) as a stream. Read `readable` while adding: each call resolves only as its bytes are taken.
 * `export.json` is written first, `contents.json` by `finish`. A path, a kind or a part that the format does not allow throws, and so
 * does adding after `finish` or `abort`.
 */
export class ExportWriter {
  readonly readable: ReadableStream<Uint8Array>;
  readonly head: ExportHead;
  readonly #archive: 'tar' | 'zip';
  readonly #out: WritableStreamDefaultWriter<Uint8Array>;
  readonly #when: Date;
  readonly #spoolDirectory: string;
  readonly #paths = new Set<string>();
  readonly #files: FileEntry[] = [];
  readonly #records: RecordsEntry[] = [];
  readonly #parts: ExportPart[] = [];
  readonly #zipEntries: ZipEntry[] = [];
  #offset = 0;
  #started = false;
  #state: 'open' | 'finished' | 'aborted' = 'open';
  #queue: Promise<void> = Promise.resolve();
  #spool: string | undefined;
  #spooled = 0;

  constructor(options: ExportWriterOptions) {
    this.head = checkHead(options.head);
    this.#archive = options.archive ?? 'tar';
    this.#when = new Date(this.head.takenAt);
    this.#spoolDirectory = options.spoolDirectory ?? tmpdir();
    const stream = new TransformStream<Uint8Array, Uint8Array>();
    this.readable = stream.readable;
    this.#out = stream.writable.getWriter();
  }

  /** Runs one operation after the ones before it, so that calls made without awaiting still write in order. */
  #serial<T>(work: () => Promise<T>): Promise<T> {
    const run = this.#queue.then(() => {
      if (this.#state !== 'open')
        throw new ExportError('closed', 'This export is already finished or abandoned.');
      return work();
    });
    this.#queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  async #emit(chunk: Uint8Array): Promise<void> {
    if (chunk.byteLength === 0) return;
    await this.#out.write(chunk);
    this.#offset += chunk.byteLength;
  }

  async #start(): Promise<void> {
    if (this.#started) return;
    this.#started = true;
    await this.#entry(
      'export.json',
      utf8(JSON.stringify(this.head, null, 2) + '\n'),
      undefined,
      false,
    );
  }

  /** Writes one entry whose size is known; returns its SHA-256. */
  async #entry(
    path: string,
    source: ByteSource,
    size: number | undefined,
    listed: boolean,
  ): Promise<void> {
    const known = size ?? (source instanceof Uint8Array ? source.byteLength : undefined);
    if (known === undefined) {
      const spooled = await this.#spoolOf(source);
      try {
        await this.#entry(
          path,
          createReadStream(spooled.file) as AsyncIterable<Uint8Array>,
          spooled.size,
          listed,
        );
      } finally {
        await rm(spooled.file, { force: true });
      }
      return;
    }
    const hash = createHash('sha256');
    let crc = 0;
    let written = 0;
    const zip = this.#archive === 'zip';
    const zipEntry: ZipEntry | undefined = zip
      ? {
          name: zipName(path),
          offset: this.#offset,
          size: known,
          crc: 0,
          zip64: needsZip64(known, this.#offset),
        }
      : undefined;
    await this.#emit(
      zipEntry
        ? zipLocalHeader(zipEntry, this.#when)
        : tarHeader(path, known, Math.floor(this.#when.getTime() / 1000)),
    );
    for await (const chunk of chunksOf(source)) {
      written += chunk.byteLength;
      if (written > known) break;
      hash.update(chunk);
      if (zip) crc = crc32(chunk, crc);
      await this.#emit(chunk);
    }
    if (written !== known) {
      await this.#fail(
        new ExportError(
          'mismatch',
          `${path} was said to be ${known} bytes and was ${written > known ? 'more' : written}.`,
        ),
      );
    }
    if (zipEntry) {
      zipEntry.crc = crc;
      await this.#emit(zipDataDescriptor(zipEntry));
      this.#zipEntries.push(zipEntry);
    } else {
      await this.#emit(new Uint8Array(tarPadding(known)));
    }
    if (listed) this.#files.push({ path, bytes: known, sha256: hash.digest('hex') });
  }

  async #spoolOf(source: ByteSource): Promise<{ file: string; size: number }> {
    this.#spool ??= await mkdtemp(join(this.#spoolDirectory, 'sovereign-export-'));
    this.#spooled += 1;
    const file = join(this.#spool, `${this.#spooled}.part`);
    const handle = await open(file, 'wx', 0o600);
    try {
      for await (const chunk of chunksOf(source)) await handle.write(chunk);
    } finally {
      await handle.close();
    }
    return { file, size: (await stat(file)).size };
  }

  #claim(path: string): void {
    checkPath(path);
    if (!isDataPath(path)) {
      throw new ExportError('invalid_path', `${path} is not under core/ or apps/<prefix>/.`);
    }
    if (this.#paths.has(path)) throw new ExportError('invalid_path', `${path} is added twice.`);
    this.#paths.add(path);
  }

  /**
   * Adds a file of bytes. Without `size`, a stream is held on disk first to learn it. With `records`, the file is records already written
   * as JSON Lines (such as another export's, being placed in this one) and is listed as such.
   */
  addFile(
    path: string,
    source: ByteSource,
    size?: number,
    records?: { kind: string; count: number; endToEnd: boolean },
  ): Promise<void> {
    if (
      records &&
      (!isKind(records.kind) ||
        !path.endsWith('.jsonl') ||
        !Number.isSafeInteger(records.count) ||
        records.count < 0)
    ) {
      throw new ExportError(
        'invalid_path',
        `${path} cannot be records of ${JSON.stringify(records.kind)}.`,
      );
    }
    this.#claim(path);
    return this.#serial(async () => {
      await this.#start();
      await this.#entry(path, source, size, true);
      if (records) this.#records.push({ path, ...records });
    });
  }

  /** Adds a file of records, one JSON object per line, and lists it as records of `kind`. */
  addRecords(
    path: string,
    kind: string,
    records: Records,
    options: { endToEnd?: boolean } = {},
  ): Promise<void> {
    if (!isKind(kind))
      throw new ExportError('invalid_path', `${JSON.stringify(kind)} is not a kind of record.`);
    if (!path.endsWith('.jsonl'))
      throw new ExportError('invalid_path', `${path} does not end in .jsonl.`);
    this.#claim(path);
    let count = 0;
    const lines = (async function* () {
      for await (const record of records as AsyncIterable<unknown>) {
        if (typeof record !== 'object' || record === null || Array.isArray(record)) {
          throw new ExportError('invalid_contents', `A record of ${kind} is not an object.`);
        }
        count += 1;
        yield utf8(JSON.stringify(record) + '\n');
      }
    })();
    return this.#serial(async () => {
      await this.#start();
      await this.#entry(path, lines, undefined, true);
      this.#records.push({ path, kind, count, endToEnd: options.endToEnd === true });
    });
  }

  /** Records one producer whose data the export was meant to hold. A missing part must have no files. */
  addPart(part: ExportPart): void {
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

  /** The files written so far under a part's folder: what a part that turns out missing would have to take back. */
  filesOf(name: string): string[] {
    const folder = partFolder(name);
    return [...this.#paths].filter((path) => path.startsWith(folder));
  }

  /** Writes `contents.json`, ends the archive and closes the stream. */
  finish(): Promise<ExportContents> {
    return this.#serial(async () => {
      await this.#start();
      for (const part of this.#parts) {
        if (part.status === 'missing' && this.filesOf(part.name).length > 0) {
          throw new ExportError('invalid_contents', `The missing part ${part.name} has files.`);
        }
      }
      const contents: ExportContents = {
        parts: this.#parts,
        records: this.#records,
        files: this.#files,
      };
      await this.#entry(
        'contents.json',
        utf8(JSON.stringify(contents, null, 2) + '\n'),
        undefined,
        false,
      );
      await this.#emit(
        this.#archive === 'zip'
          ? zipCentralDirectory(this.#zipEntries, this.#offset, this.#when)
          : TAR_END,
      );
      this.#state = 'finished';
      await this.#out.close();
      await this.#cleanUp();
      return contents;
    });
  }

  async #fail(error: ExportError): Promise<never> {
    await this.abort(error);
    throw error;
  }

  /** Abandons the export: the stream errors, so whoever reads it keeps nothing of it. */
  async abort(reason?: unknown): Promise<void> {
    if (this.#state !== 'open') return;
    this.#state = 'aborted';
    await this.#out.abort(reason).catch(() => undefined);
    await this.#cleanUp();
  }

  async #cleanUp(): Promise<void> {
    if (this.#spool) await rm(this.#spool, { recursive: true, force: true });
  }
}
