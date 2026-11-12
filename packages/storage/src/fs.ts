import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { LimitExceeded, type Driver, type FileRecord } from './driver.js';
import { SNIFF_BYTES } from './types.js';

const RECORD = '.json';
const PART = '.part';
export const STALE_PART_MS = 24 * 60 * 60 * 1000;

/**
 * The `fs` driver (RFC 0004 §1): `<root>/<sub>/<id>` and its record `<id>.json`. A file is written to `<id>.part` and renamed once its
 * record is written, so a file that is listed always has its bytes. Folders are made on first use, readable by the app alone.
 */
export class FsDriver implements Driver {
  readonly #root: string;

  constructor(root: string) {
    this.#root = path.resolve(root);
  }

  #folder(sub: string): string {
    return path.join(this.#root, sub);
  }

  #file(sub: string, id: string, suffix = ''): string {
    return path.join(this.#root, sub, `${id}${suffix}`);
  }

  async write(
    sub: string,
    id: string,
    chunks: AsyncIterable<Uint8Array>,
    limit: number,
  ): Promise<{ size: number; head: Uint8Array }> {
    await mkdir(this.#folder(sub), { recursive: true, mode: 0o700 });
    const part = this.#file(sub, id, PART);
    let size = 0;
    const head: number[] = [];
    async function* counted() {
      for await (const chunk of chunks) {
        size += chunk.byteLength;
        if (size > limit) throw new LimitExceeded();
        for (let i = 0; i < chunk.byteLength && head.length < SNIFF_BYTES; i += 1)
          head.push(chunk[i] as number);
        yield chunk;
      }
    }
    try {
      await pipeline(counted(), createWriteStream(part, { mode: 0o600, flags: 'wx' }));
    } catch (error) {
      await rm(part, { force: true });
      throw error;
    }
    return { size, head: Uint8Array.from(head) };
  }

  async commit(sub: string, record: FileRecord): Promise<void> {
    await writeFile(this.#file(sub, record.id, RECORD), `${JSON.stringify(record)}\n`, {
      mode: 0o600,
    });
    await rename(this.#file(sub, record.id, PART), this.#file(sub, record.id));
  }

  async discard(sub: string, id: string): Promise<void> {
    await rm(this.#file(sub, id, PART), { force: true });
  }

  async read(
    sub: string,
    id: string,
    range?: { start: number; end: number },
  ): Promise<Readable | undefined> {
    const file = this.#file(sub, id);
    try {
      await stat(file);
    } catch {
      return undefined;
    }
    return createReadStream(file, range ? { start: range.start, end: range.end } : {});
  }

  async record(sub: string, id: string): Promise<FileRecord | undefined> {
    try {
      const record = JSON.parse(await readFile(this.#file(sub, id, RECORD), 'utf8')) as FileRecord;
      await stat(this.#file(sub, id));
      return record;
    } catch {
      return undefined;
    }
  }

  async records(sub: string): Promise<FileRecord[]> {
    let names: string[];
    try {
      names = await readdir(this.#folder(sub));
    } catch {
      return [];
    }
    await this.#clearStale(sub, names);
    const present = new Set(names);
    const found: FileRecord[] = [];
    for (const name of names) {
      if (!name.endsWith(RECORD) || name.startsWith('.')) continue;
      const id = name.slice(0, -RECORD.length);
      if (!present.has(id)) continue;
      try {
        found.push(JSON.parse(await readFile(path.join(this.#folder(sub), name), 'utf8')));
      } catch {
        // A record that cannot be read is not listed; its file stays until it is removed.
      }
    }
    return found;
  }

  /**
   * Removes what an upload that never finished left: a `.part` file not written to for a day. A slow upload of a large file is
   * still being written, so it is newer than that; one whose process died is not, and its bytes were never counted against anyone.
   */
  async #clearStale(sub: string, names: string[]): Promise<void> {
    for (const name of names) {
      if (!name.endsWith(PART)) continue;
      const file = path.join(this.#folder(sub), name);
      try {
        if (Date.now() - (await stat(file)).mtimeMs > STALE_PART_MS)
          await rm(file, { force: true });
      } catch {
        // Gone already: finished, or cleared by another process.
      }
    }
  }

  async remove(sub: string, id: string): Promise<void> {
    await rm(this.#file(sub, id), { force: true });
    await rm(this.#file(sub, id, RECORD), { force: true });
  }

  async removeAll(sub: string): Promise<void> {
    await rm(this.#folder(sub), { recursive: true, force: true });
  }

  /** Where the person's usage record is kept, beside their files. */
  usageFile(sub: string): string {
    return path.join(this.#folder(sub), '.usage.json');
  }
}
