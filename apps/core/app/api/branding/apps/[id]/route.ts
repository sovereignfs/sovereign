import { getLauncherApps } from '../../../../../src/clients';
import { appIcon } from '../../../../../src/clients/app-icons';

export const dynamic = 'force-dynamic';

/**
 * An app's launcher icon, from core's own address (core-app §3.8), so that an app's header shows the launcher with images from core
 * alone. Public on purpose, as the instance's logo is: an image an app's page shows carries no credentials, and the launcher is not
 * access control. Only an app the launcher lists has one here; any other id is not there. Served as the kind its bytes proved to be,
 * with `nosniff`, under a policy that forbids everything.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const icon = await appIcon(id, { listed: getLauncherApps });
  if (!icon) return new Response(null, { status: 404, headers: { 'cache-control': 'no-store' } });
  const headers = {
    etag: icon.etag,
    'cache-control': 'public, max-age=3600',
    'x-content-type-options': 'nosniff',
    'content-security-policy': "default-src 'none'; sandbox",
  };
  if (request.headers.get('if-none-match') === icon.etag)
    return new Response(null, { status: 304, headers });
  return new Response(new Uint8Array(icon.bytes), {
    headers: {
      ...headers,
      'content-type': icon.contentType,
      'content-length': String(icon.bytes.length),
      'content-disposition': 'inline',
    },
  });
}
