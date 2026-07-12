import { NextResponse } from 'next/server';
import { getPlatformDb, getStorageObjectByIdForToken } from '@sovereignfs/db';
import { readObjectBytes, verifyStorageToken } from '@/src/storage';

interface RouteParams {
  params: Promise<{ token: string }>;
}

/**
 * Serve a plugin-owned storage object via a short-lived signed token
 * (`sdk.storage.getSignedUrl()`, RFC 0044). The token is the authorization
 * proof — it is HMAC-signed, embeds tenant/plugin/object IDs, expires within
 * an hour, and cannot be extended or widened by editing it. Not part of the
 * session-gated middleware surface by design: signed URLs must work for
 * `<img src>`/direct downloads without forwarding cookies.
 */
export async function GET(_request: Request, { params }: RouteParams): Promise<Response> {
  const { token } = await params;

  let payload: { tenantId: string; pluginId: string; objectId: string };
  try {
    payload = verifyStorageToken(token);
  } catch {
    return new NextResponse('Not Found', { status: 404 });
  }

  const pdb = await getPlatformDb();
  const row = await getStorageObjectByIdForToken(
    pdb,
    payload.objectId,
    payload.tenantId,
    payload.pluginId,
  );
  if (!row) return new NextResponse('Not Found', { status: 404 });

  const bytes = readObjectBytes(payload.pluginId, row.id);
  if (!bytes) return new NextResponse('Not Found', { status: 404 });

  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      'Content-Type': row.contentType,
      'Content-Length': String(row.size),
      // Private, expiry-bound object — never cached by a shared/reverse-proxy
      // cache (RFC 0044: "Private signed URL responses use conservative cache
      // headers by default").
      'Cache-Control': 'private, no-store',
    },
  });
}
