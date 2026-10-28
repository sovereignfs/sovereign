import { getDatabase } from '../../../../src/database';
import { AvatarStore } from '../../../../src/profile/avatars';

export const dynamic = 'force-dynamic';

/** A person's id as better-auth makes them: letters, digits, `-` and `_`. Anything else is not one. */
const USER_ID = /^[A-Za-z0-9_-]{8,64}$/;

/**
 * A person's picture, from the database. It is public on purpose: an app shows it in an `<img>` with no
 * credentials, from the address in the `picture` claim. The address carries the picture's version, so it
 * is cached for a year and never stale; the ETag answers a revalidation. It is served as the kind its
 * bytes proved to be, with `nosniff`, so it can only ever be displayed.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ userId: string }> },
): Promise<Response> {
  const { userId } = await params;
  if (!USER_ID.test(userId)) return new Response(null, { status: 404 });
  const avatar = await new AvatarStore(await getDatabase()).get(userId);
  if (!avatar) return new Response(null, { status: 404, headers: { 'cache-control': 'no-store' } });

  const etag = `"${avatar.version}"`;
  const headers = {
    etag,
    'cache-control': 'public, max-age=31536000, immutable',
    'x-content-type-options': 'nosniff',
    'content-security-policy': "default-src 'none'; sandbox",
  };
  if (request.headers.get('if-none-match') === etag)
    return new Response(null, { status: 304, headers });
  return new Response(new Uint8Array(avatar.bytes), {
    headers: {
      ...headers,
      'content-type': avatar.contentType,
      'content-length': String(avatar.bytes.length),
      'content-disposition': 'inline',
    },
  });
}
