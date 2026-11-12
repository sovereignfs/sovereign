import { randomBytes } from 'node:crypto';
import type { Readable } from 'node:stream';
import { LimitExceeded, type Driver, type FileRecord } from './driver.js';
import { fileResponse, parseRange } from './response.js';
import { StorageError } from './errors.js';
import { sign, verify } from './sign.js';
import { detectKind } from './types.js';
import type { Usage, UsageStore } from './usage.js';

/** A person, as core names them: an opaque id. Checked before it is ever part of a path. */
const SUB = /^[A-Za-z0-9_-]{1,128}$/;
/** A file, as the store names it: 128 random bits. */
const ID = /^[A-Za-z0-9_-]{22}$/;

export type Quota = { bytes: number; files: number };

export type FileStoreOptions = {
  driver: Driver;
  usage: UsageStore;
  quota: Quota;
  /** Signs download addresses. Without it, files are served to their owner's session only. */
  signingKey?: string;
  now?: () => number;
};

/** What `get` returns: the record and the bytes, to hand to `fileResponse`. */
export type StoredFile = { record: FileRecord; body: Readable };

export type Body = AsyncIterable<Uint8Array> | Uint8Array;

/** What `usage` returns: what the person keeps, and what they may. */
export type UsageReport = { bytes: number; files: number; quota: Quota };

const checkSub = (sub: string) => {
  if (!SUB.test(sub)) throw new StorageError('invalid', 'That is not a person this store knows.');
};
const checkId = (id: string) => {
  if (!ID.test(id)) throw new StorageError('not_found', 'There is no such file.');
};

/** The name a person gave, kept for showing and for the download's name: no path, no control characters, not too long. */
export function cleanName(name: string | undefined): string {
  const base = (name ?? '').split(/[/\\]/).pop() ?? '';
  const printable = [...base].filter((c) => c.charCodeAt(0) > 0x1f && c.charCodeAt(0) !== 0x7f);
  const cleaned = printable.join('').trim().slice(0, 200);
  return cleaned === '' || cleaned === '.' || cleaned === '..' ? 'file' : cleaned;
}

async function* chunksOf(body: Body): AsyncIterable<Uint8Array> {
  if (body instanceof Uint8Array) {
    yield body;
    return;
  }
  for await (const chunk of body) yield chunk;
}

/**
 * A person's files in one app (RFC 0004 §2). Every method takes the person's `sub` from the app's own session, never from a request.
 * Quotas are per person: a file and its bytes are reserved before anything is written, and what was not used is given back after.
 */
export class FileStore {
  readonly #driver: Driver;
  readonly #usage: UsageStore;
  readonly quota: Quota;
  readonly #signingKey: string | undefined;
  readonly #now: () => number;

  constructor(options: FileStoreOptions) {
    this.#driver = options.driver;
    this.#usage = options.usage;
    this.quota = options.quota;
    this.#signingKey = options.signingKey;
    this.#now = options.now ?? Date.now;
  }

  /** Counts a person's files again from what is stored. */
  async #recount(sub: string): Promise<Usage> {
    const records = await this.#driver.records(sub);
    return {
      bytes: records.reduce((sum, record) => sum + record.size, 0),
      files: records.length,
      countedAt: this.#now(),
    };
  }

  #change(sub: string, bytes: number, files: number): Promise<void> {
    return this.#usage.update(
      sub,
      () => this.#recount(sub),
      (usage) => ({
        usage: {
          ...usage,
          bytes: Math.max(0, usage.bytes + bytes),
          files: Math.max(0, usage.files + files),
        },
        result: undefined,
      }),
    );
  }

  /**
   * Stores a file for a person. `size`, when the request said it, lets a file that cannot fit be refused before any byte is read.
   * Refuses with `too_large` (larger than the whole quota), `over_quota` (no room or no file left) or `empty`.
   */
  async put(
    sub: string,
    body: Body,
    info: { name?: string; size?: number } = {},
  ): Promise<FileRecord> {
    checkSub(sub);
    if (info.size !== undefined && info.size > this.quota.bytes) {
      throw new StorageError('too_large', 'That file is larger than all the space you have here.');
    }
    // Reserve one file, and the bytes the request said it has, or all the room there is when it said nothing.
    const reserved = await this.#usage.update(
      sub,
      () => this.#recount(sub),
      (usage) => {
        if (usage.files + 1 > this.quota.files)
          throw new StorageError(
            'over_quota',
            'You have as many files here as you can keep. Delete some first.',
          );
        const room = this.quota.bytes - usage.bytes;
        const want = info.size ?? room;
        if (want > room || room <= 0)
          throw new StorageError(
            'over_quota',
            'There is not enough room left for that file. Delete some files first.',
          );
        return {
          usage: { ...usage, bytes: usage.bytes + want, files: usage.files + 1 },
          result: want,
        };
      },
    );

    const id = randomBytes(16).toString('base64url');
    let written: { size: number; head: Uint8Array };
    try {
      written = await this.#driver.write(sub, id, chunksOf(body), reserved);
      if (written.size === 0) throw new StorageError('empty', 'That file is empty.');
      // A body shorter than the request said arrived incomplete: something on the way cut it short.
      if (info.size !== undefined && written.size !== info.size)
        throw new StorageError('invalid', 'The file arrived incomplete. Try again.');
    } catch (error) {
      await this.#driver.discard(sub, id).catch(() => undefined);
      await this.#change(sub, -reserved, -1);
      if (error instanceof LimitExceeded) {
        throw info.size === undefined
          ? new StorageError(
              'over_quota',
              'There is not enough room left for that file. Delete some files first.',
            )
          : new StorageError('invalid', 'The file was longer than the request said.');
      }
      throw error;
    }

    const kind = detectKind(written.head);
    const record: FileRecord = {
      id,
      name: cleanName(info.name),
      type: kind.type,
      inline: kind.inline,
      size: written.size,
      createdAt: new Date(this.#now()).toISOString(),
    };
    try {
      await this.#driver.commit(sub, record);
    } catch (error) {
      await this.#driver.discard(sub, id).catch(() => undefined);
      await this.#change(sub, -reserved, -1);
      throw error;
    }
    if (reserved !== written.size) await this.#change(sub, written.size - reserved, 0);
    return record;
  }

  /** A person's files, newest first. */
  async list(sub: string): Promise<FileRecord[]> {
    checkSub(sub);
    const records = await this.#driver.records(sub);
    return records.sort(
      (a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id),
    );
  }

  /** One file of a person's, or `not_found`: a file of someone else's is the same as none. */
  async get(sub: string, id: string): Promise<StoredFile> {
    checkSub(sub);
    checkId(id);
    const record = await this.#driver.record(sub, id);
    const body = record ? await this.#driver.read(sub, id) : undefined;
    if (!record || !body) throw new StorageError('not_found', 'There is no such file.');
    return { record, body };
  }

  /**
   * The answer that serves one of a person's files, whole or the part of it a `Range` header asks for, so a video can be sought in and a
   * large download resumed. A person's other files, and ones that are not there, are `not_found`.
   */
  async serve(sub: string, id: string, request?: Request): Promise<Response> {
    checkSub(sub);
    checkId(id);
    const record = await this.#driver.record(sub, id);
    if (!record) throw new StorageError('not_found', 'There is no such file.');
    const asked = parseRange(request?.headers.get('range') ?? null, record.size);
    if (asked === 'unsatisfiable') {
      return new Response(null, {
        status: 416,
        headers: { 'content-range': `bytes */${record.size}`, 'accept-ranges': 'bytes' },
      });
    }
    const body = await this.#driver.read(sub, id, asked);
    if (!body) throw new StorageError('not_found', 'There is no such file.');
    return fileResponse({ record, body }, asked);
  }

  async remove(sub: string, id: string): Promise<void> {
    checkSub(sub);
    checkId(id);
    const record = await this.#driver.record(sub, id);
    if (!record) throw new StorageError('not_found', 'There is no such file.');
    await this.#driver.remove(sub, id);
    await this.#change(sub, -record.size, -1);
  }

  /** Every file of a person's, for when their account is deleted. Safe to run again. */
  async removeAll(sub: string): Promise<void> {
    checkSub(sub);
    await this.#driver.removeAll(sub);
  }

  async usage(sub: string): Promise<UsageReport> {
    checkSub(sub);
    const usage = await this.#usage.update(
      sub,
      () => this.#recount(sub),
      (current) => ({ usage: current, result: current }),
    );
    return { bytes: usage.bytes, files: usage.files, quota: this.quota };
  }

  /** Whether files can be served through signed addresses: the app has a signing key. */
  get signs(): boolean {
    return this.#signingKey !== undefined;
  }

  /**
   * The query of an address that serves one file without a session, for `seconds` (at most an hour). The app appends it to its own
   * download route: `/api/files/<id>?<query>`.
   */
  signedQuery(sub: string, id: string, seconds = 300): URLSearchParams {
    checkSub(sub);
    checkId(id);
    if (!this.#signingKey) throw new Error('This store has no signing key.');
    const expires = Math.floor(this.#now() / 1000) + Math.min(Math.max(1, seconds), 3600);
    return new URLSearchParams({
      u: sub,
      expires: String(expires),
      signature: sign(this.#signingKey, sub, id, expires),
    });
  }

  /** The person a signed address is for, when its signature is good and current; otherwise nothing. */
  signedFor(id: string, query: URLSearchParams): string | undefined {
    const sub = query.get('u');
    if (!this.#signingKey || !sub || !SUB.test(sub) || !ID.test(id)) return undefined;
    const good = verify(
      this.#signingKey,
      sub,
      id,
      {
        expires: query.get('expires') ?? undefined,
        signature: query.get('signature') ?? undefined,
      },
      Math.floor(this.#now() / 1000),
    );
    return good ? sub : undefined;
  }
}
