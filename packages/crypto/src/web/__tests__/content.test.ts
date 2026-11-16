import { describe, expect, it } from 'vitest';
import { concat, utf8 } from '../bytes.js';
import {
  decryptBytes,
  decryptContent,
  encryptBytes,
  encryptContent,
  importDocumentKey,
} from '../content.js';
import { newKey, RecordError } from '../records.js';

const hex = (bytes: Uint8Array) => Buffer.from(bytes).toString('hex');
const target = { documentId: 'doc-1', version: 3 };
const HEADER = 4 + 1 + 4 + 4 + 2 + 'doc-1'.length + 32;

/** A stream that hands the bytes over in pieces of the given sizes, to cross chunk edges in every way. */
function streamOf(bytes: Uint8Array, piece = 7): ReadableStream<Uint8Array> {
  let at = 0;
  return new ReadableStream({
    pull(controller) {
      if (at >= bytes.length) {
        controller.close();
        return;
      }
      controller.enqueue(bytes.slice(at, at + piece));
      at += piece;
    },
  });
}

async function collect(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const parts: Uint8Array[] = [];
  for await (const part of stream as unknown as AsyncIterable<Uint8Array>) parts.push(part);
  return concat(...parts);
}

async function sealed(plaintext: Uint8Array, chunkSize = 16) {
  const key = await importDocumentKey(newKey());
  const blob = await collect(encryptContent(key, target, streamOf(plaintext), chunkSize));
  return { key, blob };
}

const opened = (key: CryptoKeyLike, blob: Uint8Array, expected = target, piece = 5) =>
  collect(decryptContent(key, expected, streamOf(blob, piece)));
type CryptoKeyLike = Awaited<ReturnType<typeof importDocumentKey>>;

describe('content in chunks (RFC 0005 §1.3)', () => {
  it.each([0, 1, 15, 16, 17, 32, 33, 100])(
    'round-trips %i bytes across 16-byte chunks',
    async (length) => {
      const plaintext = crypto.getRandomValues(new Uint8Array(length));
      const { key, blob } = await sealed(plaintext);
      const chunks = Math.max(1, Math.ceil(length / 16));
      expect(blob.length).toBe(HEADER + length + chunks * 16);
      for (const piece of [1, 5, 33, 1000]) {
        expect(hex(await opened(key, blob, target, piece))).toBe(hex(plaintext));
      }
    },
  );

  it('round-trips a file of several default chunks', async () => {
    const plaintext = new Uint8Array(200_000);
    for (let at = 0; at < plaintext.length; at += 65_536) {
      crypto.getRandomValues(plaintext.subarray(at, Math.min(at + 65_536, plaintext.length)));
    }
    const key = await importDocumentKey(newKey());
    const blob = await collect(encryptContent(key, target, streamOf(plaintext, 10_000)));
    expect(hex(await opened(key, blob, target, 9_999))).toBe(hex(plaintext));
  });

  it('makes a different blob each time, from a fresh key', async () => {
    const key = await importDocumentKey(newKey());
    const one = await encryptBytes(key, target, utf8('same'));
    const two = await encryptBytes(key, target, utf8('same'));
    expect(hex(one)).not.toBe(hex(two));
  });

  describe('refuses a blob that is', () => {
    const plaintext = crypto.getRandomValues(new Uint8Array(40)); // three chunks: 16, 16, 8
    const failure = (reason: RecordError['reason']) => expect.objectContaining({ reason });

    it('read under another document', async () => {
      const { key, blob } = await sealed(plaintext);
      await expect(opened(key, blob, { ...target, documentId: 'doc-2' })).rejects.toEqual(
        failure('authentication-failed'),
      );
    });

    it('another version than the one asked for', async () => {
      const { key, blob } = await sealed(plaintext);
      await expect(opened(key, blob, { ...target, version: 2 })).rejects.toEqual(
        failure('authentication-failed'),
      );
    });

    it('opened with another key', async () => {
      const { blob } = await sealed(plaintext);
      await expect(opened(await importDocumentKey(newKey()), blob)).rejects.toEqual(
        failure('authentication-failed'),
      );
    });

    it('cut short, mid-chunk or at a chunk’s edge', async () => {
      const { key, blob } = await sealed(plaintext);
      await expect(opened(key, blob.slice(0, -3))).rejects.toBeInstanceOf(RecordError);
      // The last chunk (8 bytes and a tag) removed entirely: the stream now ends on a whole chunk sealed as not last.
      await expect(opened(key, blob.slice(0, -(8 + 16)))).rejects.toEqual(
        failure('authentication-failed'),
      );
      await expect(opened(key, blob.slice(0, HEADER))).rejects.toEqual(
        failure('authentication-failed'),
      );
      await expect(opened(key, blob.slice(0, 10))).rejects.toEqual(failure('malformed'));
    });

    it('longer than it was made', async () => {
      const { key, blob } = await sealed(plaintext);
      await expect(opened(key, concat(blob, new Uint8Array(5)))).rejects.toEqual(
        failure('authentication-failed'),
      );
    });

    it('with chunks in another order', async () => {
      const { key, blob } = await sealed(crypto.getRandomValues(new Uint8Array(48))); // 16, 16, 16
      const body = blob.slice(HEADER);
      const swapped = concat(
        blob.slice(0, HEADER),
        body.slice(32, 64),
        body.slice(0, 32),
        body.slice(64),
      );
      await expect(opened(key, swapped)).rejects.toEqual(failure('authentication-failed'));
    });

    it('changed in any one byte', async () => {
      const { key, blob } = await sealed(plaintext);
      for (const at of [0, 4, 5, 9, 13, HEADER - 1, HEADER, blob.length - 1]) {
        const changed = blob.slice();
        changed[at] = (changed[at] as number) ^ 0x40;
        await expect(opened(key, changed), `byte ${at}`).rejects.toBeInstanceOf(RecordError);
      }
    });

    it('of another suite', async () => {
      const { key, blob } = await sealed(plaintext);
      const changed = blob.slice();
      changed[4] = 2;
      await expect(opened(key, changed)).rejects.toEqual(failure('unknown-suite'));
    });
  });

  it('encrypts a small value whole, and opens it', async () => {
    const key = await importDocumentKey(newKey());
    const value = utf8(
      JSON.stringify({ name: 'tax return 2025.pdf', type: 'application/pdf', size: 81_234 }),
    );
    const blob = await encryptBytes(key, target, value);
    expect(hex(await decryptBytes(key, target, blob))).toBe(hex(value));
  });

  it('refuses a document key, id, version or chunk size out of range', async () => {
    await expect(importDocumentKey(new Uint8Array(16))).rejects.toThrow(TypeError);
    const key = await importDocumentKey(newKey());
    expect(() => encryptContent(key, target, streamOf(new Uint8Array()), 0)).toThrow(TypeError);
    expect(() =>
      encryptContent(key, { documentId: '', version: 1 }, streamOf(new Uint8Array())),
    ).toThrow(TypeError);
    expect(() =>
      encryptContent(key, { documentId: 'd', version: -1 }, streamOf(new Uint8Array())),
    ).toThrow(TypeError);
  });
});
