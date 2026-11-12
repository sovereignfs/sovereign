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
export function fileResponse(file: StoredFile): Response {
  return new Response(Readable.toWeb(file.body) as ReadableStream<Uint8Array>, {
    status: 200,
    headers: {
      'content-type': file.record.type,
      'content-length': String(file.record.size),
      'content-disposition': disposition(file.record),
      'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'none'; sandbox",
      'cache-control': 'private, max-age=300',
    },
  });
}
