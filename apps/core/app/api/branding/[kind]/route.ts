import { isBrandingKind, BrandingStore } from '../../../../src/branding/store';
import { getDatabase } from '../../../../src/database';

export const dynamic = 'force-dynamic';

/**
 * The instance's logo or favicon, from the database. It is public on purpose: core's pages, its emails and
 * apps show it with no credentials. The address carries the picture's version, so it is cached for a year
 * and never stale; the ETag answers a revalidation. It is served as the kind its bytes proved to be, with
 * `nosniff`, and under a policy that forbids everything, so it can only ever be displayed.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ kind: string }> },
): Promise<Response> {
  const { kind } = await params;
  if (!isBrandingKind(kind)) return new Response(null, { status: 404 });
  const picture = await new BrandingStore(await getDatabase()).get(kind);
  if (!picture)
    return new Response(null, { status: 404, headers: { 'cache-control': 'no-store' } });

  const etag = `"${picture.version}"`;
  const headers = {
    etag,
    'cache-control': 'public, max-age=31536000, immutable',
    'x-content-type-options': 'nosniff',
    'content-security-policy': "default-src 'none'; sandbox",
  };
  if (request.headers.get('if-none-match') === etag)
    return new Response(null, { status: 304, headers });
  return new Response(new Uint8Array(picture.bytes), {
    headers: {
      ...headers,
      'content-type': picture.contentType,
      'content-length': String(picture.bytes.length),
      'content-disposition': 'inline',
    },
  });
}
