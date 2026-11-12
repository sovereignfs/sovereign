import { Readable } from 'node:stream';
import type { FileRecord } from './driver.js';
import type { StoredFile } from './store.js';

/** `Content-Disposition` with the person's name for the file, in both forms browsers read. */
function disposition(record: FileRecord): string {
  const kind = record.inline ? 'inline' : 'attachment';
  const plain = record.name.replace(/[^\x20-\x7e]|["\\]/g, '_');
  return `${kind}; filename="${plain}"; filename*=UTF-8''${encodeURIComponent(record.name)}`;
}

/**
 * The answer that serves a stored file (RFC 0004, Security): its type as its bytes say, `nosniff`, images shown and everything else
 * downloaded, a policy that lets nothing in it run, and not kept by any cache but the person's own.
 */
export function fileResponse(file: StoredFile, range?: ByteRange): Response {
  const length = range ? range.end - range.start + 1 : file.record.size;
  return new Response(Readable.toWeb(file.body) as ReadableStream<Uint8Array>, {
    status: range ? 206 : 200,
    headers: {
      ...(range
        ? { 'content-range': `bytes ${range.start}-${range.end}/${file.record.size}` }
        : {}),
      'accept-ranges': 'bytes',
      'content-type': file.record.type,
      'content-length': String(length),
      'content-disposition': disposition(file.record),
      'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'none'; sandbox",
      'cache-control': 'private, max-age=300',
    },
  });
}

/** What a `Range` header asks for of a file of `size` bytes: one span, both ends included. */
export type ByteRange = { start: number; end: number };

/**
 * Reads a `Range: bytes=…` header for a file of `size` bytes. `undefined` is "the whole file": no header, a unit that is not bytes, or
 * several spans, which are answered whole as the standard allows. `'unsatisfiable'` is a span that starts past the end (416).
 */
export function parseRange(
  header: string | null,
  size: number,
): ByteRange | 'unsatisfiable' | undefined {
  const match = /^bytes=(\d*)-(\d*)$/.exec((header ?? '').trim());
  if (!match) return undefined;
  const [, first = '', last = ''] = match;
  if (first === '' && last === '') return undefined;
  if (first === '') {
    // The last `n` bytes.
    const n = Number(last);
    if (!Number.isSafeInteger(n) || n === 0) return 'unsatisfiable';
    return { start: Math.max(0, size - n), end: size - 1 };
  }
  const start = Number(first);
  const end = last === '' ? size - 1 : Math.min(Number(last), size - 1);
  if (!Number.isSafeInteger(start) || start >= size || end < start) return 'unsatisfiable';
  return { start, end };
}
