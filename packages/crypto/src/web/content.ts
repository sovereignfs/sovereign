/**
 * Documents and files, encrypted in chunks as streams (RFC 0005 §1.3), so that a large file is never whole in memory.
 *
 * ```
 * header  = "SVE1" ‖ suite (1 byte) ‖ chunk size (4) ‖ version (4) ‖ id length (2) ‖ document id ‖ 32 random bytes
 * key     = HKDF(document key, salt = the header's random bytes, info = "sovereign/1/content")
 * chunk i = AES-256-GCM(key, nonce = i in 11 bytes ‖ last (1 byte), associated data = header)
 * ```
 *
 * - **A key for each blob**, from the random bytes, so counting nonces from zero is safe and no two blobs share a key.
 * - **The header is authenticated with every chunk**, so a blob read under another document's id, or with a version other than the
 *   one asked for, does not open. Which version is current is the app's to know.
 * - **The last chunk is marked**, and the reader holds a chunk back until it knows whether more follows, so a blob cut short, even
 *   at a chunk's edge, does not open; nor does one with bytes added.
 * - A reader is given plaintext chunk by chunk, each authenticated, before the end is reached: **only a stream that ends without an
 *   error is the whole document.**
 */
import { concat, source, utf8 } from './bytes.js';
import type { WebKey } from './password.js';
import { KEY_BYTES, RecordError, SUITE } from './records.js';

const MAGIC = utf8('SVE1');
const RANDOM_BYTES = 32;
const TAG_BYTES = 16;
const FIXED_HEADER = MAGIC.length + 1 + 4 + 4 + 2;
const CONTENT_INFO = utf8('sovereign/1/content');

/** The chunk size used unless a test asks for another: 64 KiB. */
export const CHUNK_BYTES = 64 * 1024;
/** The largest chunk a reader accepts, so a header cannot make it hold more than this. */
const MAX_CHUNK_BYTES = 1024 * 1024;

/** What a blob belongs to, which both sides must agree on. */
export interface ContentTarget {
  readonly documentId: string;
  readonly version: number;
}

/** A document key's 32 bytes as an HKDF key that cannot be exported. The caller overwrites the bytes. */
export async function importDocumentKey(raw: Uint8Array): Promise<WebKey> {
  if (raw.length !== KEY_BYTES) throw new TypeError('A document key is 32 bytes.');
  return crypto.subtle.importKey('raw', source(raw), 'HKDF', false, ['deriveKey']);
}

function header(target: ContentTarget, chunkSize: number, random: Uint8Array): Uint8Array {
  const id = utf8(target.documentId);
  if (id.length === 0 || id.length > 0xffff)
    throw new TypeError('A document id is 1 to 65535 bytes.');
  if (!Number.isInteger(target.version) || target.version < 0 || target.version > 0xffffffff) {
    throw new TypeError('A version is a whole number from 0 to 2^32 - 1.');
  }
  const fixed = new Uint8Array(FIXED_HEADER);
  fixed.set(MAGIC);
  const view = new DataView(fixed.buffer);
  view.setUint8(MAGIC.length, SUITE);
  view.setUint32(MAGIC.length + 1, chunkSize);
  view.setUint32(MAGIC.length + 5, target.version);
  view.setUint16(MAGIC.length + 9, id.length);
  return concat(fixed, id, random);
}

const contentKey = (documentKey: WebKey, random: Uint8Array) =>
  crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: source(random), info: source(CONTENT_INFO) },
    documentKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );

function nonce(index: number, last: boolean): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(12);
  // Eleven bytes of counter; a blob of 2^53 chunks is far beyond any file.
  new DataView(out.buffer).setBigUint64(3, BigInt(index));
  out[11] = last ? 1 : 0;
  return out;
}

/** Encrypts a stream for one document version. */
export function encryptContent(
  documentKey: WebKey,
  target: ContentTarget,
  input: ReadableStream<Uint8Array>,
  chunkSize = CHUNK_BYTES,
): ReadableStream<Uint8Array> {
  if (!Number.isInteger(chunkSize) || chunkSize < 1 || chunkSize > MAX_CHUNK_BYTES) {
    throw new TypeError(`A chunk is 1 byte to ${MAX_CHUNK_BYTES} bytes.`);
  }
  const random = crypto.getRandomValues(new Uint8Array(RANDOM_BYTES));
  const head = header(target, chunkSize, random);
  let key: WebKey;
  let pending: Uint8Array = new Uint8Array();
  let index = 0;
  const seal = async (plaintext: Uint8Array, last: boolean) =>
    new Uint8Array(
      await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: nonce(index++, last), additionalData: source(head) },
        key,
        source(plaintext),
      ),
    );
  return input.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      async start(controller) {
        key = await contentKey(documentKey, random);
        controller.enqueue(head);
      },
      async transform(chunk, controller) {
        pending = concat(pending, chunk);
        // Strictly more than a chunk: a full chunk is sealed as not last only once something follows it.
        while (pending.length > chunkSize) {
          controller.enqueue(await seal(pending.subarray(0, chunkSize), false));
          pending = pending.slice(chunkSize);
        }
      },
      async flush(controller) {
        controller.enqueue(await seal(pending, true));
      },
    }),
  );
}

/** Decrypts a stream `encryptContent` made, refusing it unless it is for `expected` and whole. */
export function decryptContent(
  documentKey: WebKey,
  expected: ContentTarget,
  input: ReadableStream<Uint8Array>,
): ReadableStream<Uint8Array> {
  let buffer: Uint8Array = new Uint8Array();
  let head: Uint8Array | undefined;
  let key: WebKey;
  let chunkSize = 0;
  let index = 0;
  const open = async (ciphertext: Uint8Array, last: boolean) => {
    try {
      return new Uint8Array(
        await crypto.subtle.decrypt(
          { name: 'AES-GCM', iv: nonce(index++, last), additionalData: source(head as Uint8Array) },
          key,
          source(ciphertext),
        ),
      );
    } catch {
      throw new RecordError('authentication-failed');
    }
  };
  async function readHeader(): Promise<boolean> {
    if (buffer.length < FIXED_HEADER) return false;
    const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    const idLength = view.getUint16(MAGIC.length + 9);
    const total = FIXED_HEADER + idLength + RANDOM_BYTES;
    if (buffer.length < total) return false;
    if (!MAGIC.every((byte, i) => buffer[i] === byte)) throw new RecordError('malformed');
    const suite = view.getUint8(MAGIC.length);
    if (suite !== SUITE) throw new RecordError('unknown-suite');
    chunkSize = view.getUint32(MAGIC.length + 1);
    if (chunkSize < 1 || chunkSize > MAX_CHUNK_BYTES) throw new RecordError('malformed');
    head = buffer.slice(0, total);
    // The header must be exactly the one this document and version would have, random bytes aside.
    const random = head.slice(total - RANDOM_BYTES);
    const wanted = header(expected, chunkSize, random);
    if (wanted.length !== head.length || !wanted.every((byte, i) => head?.[i] === byte)) {
      throw new RecordError('authentication-failed');
    }
    key = await contentKey(documentKey, random);
    buffer = buffer.slice(total);
    return true;
  }
  return input.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      async transform(chunk, controller) {
        buffer = concat(buffer, chunk);
        if (!head && !(await readHeader())) return;
        // Hold back a whole chunk until something follows it: only then is it known not to be the last.
        while (buffer.length > chunkSize + TAG_BYTES) {
          controller.enqueue(await open(buffer.subarray(0, chunkSize + TAG_BYTES), false));
          buffer = buffer.slice(chunkSize + TAG_BYTES);
        }
      },
      async flush(controller) {
        if (!head && !(await readHeader())) throw new RecordError('malformed');
        if (buffer.length < TAG_BYTES) throw new RecordError('authentication-failed');
        controller.enqueue(await open(buffer, true));
      },
    }),
  );
}

const once = (bytes: Uint8Array) =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });

async function collect(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const parts: Uint8Array[] = [];
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return concat(...parts);
    parts.push(value);
  }
}

/** A small value (a name, a type, a size) encrypted the same way, whole. */
export const encryptBytes = (documentKey: WebKey, target: ContentTarget, bytes: Uint8Array) =>
  collect(encryptContent(documentKey, target, once(bytes)));

/** Opens what `encryptBytes` made. */
export const decryptBytes = (documentKey: WebKey, expected: ContentTarget, bytes: Uint8Array) =>
  collect(decryptContent(documentKey, expected, once(bytes)));
