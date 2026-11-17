import { authorizationResponse, requireCapability } from '../../../../../src/auth/authorize';
import { getShortcutManager } from '../../../../../src/shortcuts';

export const dynamic = 'force-dynamic';

/** A shortcut's id as the manager makes them: a UUID. Anything else is not one. */
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * A launcher shortcut's picture (core-app §3.8.1), for a signed-in person with `launcher:access`: one shown to
 * everyone, or their own, never another person's. The address carries the picture's version, so it is cached for
 * a year in this browser alone (`private`); it is served as the kind its bytes proved to be, with `nosniff` and a
 * sandbox, so it can only ever be displayed.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  let userId: string;
  try {
    userId = (await requireCapability('launcher:access')).user.id;
  } catch (error) {
    const refused = authorizationResponse(error);
    if (refused) return refused;
    throw error;
  }
  const { id } = await params;
  const notFound = () =>
    new Response(null, { status: 404, headers: { 'cache-control': 'no-store' } });
  if (!ID.test(id)) return notFound();
  const icon = await (await getShortcutManager()).icon(userId, id);
  if (!icon) return notFound();

  const etag = `"${icon.version}"`;
  const headers = {
    etag,
    'cache-control': 'private, max-age=31536000, immutable',
    'x-content-type-options': 'nosniff',
    'content-security-policy': "default-src 'none'; sandbox",
  };
  if (request.headers.get('if-none-match') === etag) {
    return new Response(null, { status: 304, headers });
  }
  return new Response(new Uint8Array(icon.bytes), {
    headers: {
      ...headers,
      'content-type': icon.contentType,
      'content-length': String(icon.bytes.length),
      'content-disposition': 'inline',
    },
  });
}
