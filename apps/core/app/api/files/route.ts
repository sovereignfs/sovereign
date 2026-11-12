import { NextResponse } from 'next/server';
import { StorageError } from '@sovereignfs/storage';
import {
  authorizationResponse,
  requireCapability,
  requireSameOrigin,
} from '../../../src/auth/authorize';
import { getFileStore, MAX_UPLOAD_BYTES } from '../../../src/files';
import { storageErrorResponse } from '../../../src/files/respond';

export const dynamic = 'force-dynamic';

/** The signed-in person's own files, newest first, and how much of their space they use (core-app §4.6). */
export async function GET(): Promise<Response> {
  try {
    const session = await requireCapability('files:manage');
    const files = getFileStore();
    const [records, usage] = await Promise.all([
      files.list(session.user.id),
      files.usage(session.user.id),
    ]);
    return NextResponse.json(
      { files: records.map((record) => ({ ...record, url: `/api/files/${record.id}` })), usage },
      { headers: { 'cache-control': 'no-store' } },
    );
  } catch (error) {
    return storageErrorResponse(error) ?? authorizationResponse(error) ?? Promise.reject(error);
  }
}

/**
 * Stores a file for the signed-in person. The body is the file itself; its name is in `X-File-Name`, percent-encoded. The request must
 * say its length (core-app §4.6): core takes at most 100 MB in one upload, since its proxy keeps only that much of a body.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    requireSameOrigin(request);
    const session = await requireCapability('files:manage');
    const length = Number(request.headers.get('content-length') ?? Number.NaN);
    if (!Number.isSafeInteger(length) || length < 0) {
      return NextResponse.json(
        { error: 'length_required', message: 'Send the file with its length.' },
        { status: 411 },
      );
    }
    if (length > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: 'too_large', message: 'A file sent to core can be at most 100 MB.' },
        { status: 413 },
      );
    }
    if (!request.body) throw new StorageError('empty', 'That file is empty.');
    let name: string | undefined;
    try {
      name = decodeURIComponent(request.headers.get('x-file-name') ?? '');
    } catch {
      name = undefined;
    }
    const record = await getFileStore().put(
      session.user.id,
      request.body as unknown as AsyncIterable<Uint8Array>,
      { name, size: length },
    );
    return NextResponse.json(
      { ...record, url: `/api/files/${record.id}` },
      { status: 201, headers: { 'cache-control': 'no-store' } },
    );
  } catch (error) {
    return storageErrorResponse(error) ?? authorizationResponse(error) ?? Promise.reject(error);
  }
}
