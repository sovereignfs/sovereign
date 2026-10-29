import { DEFAULT_ICONS } from '../../../src/branding/default-icons';

/**
 * The icons an instance has until its operator sets a favicon of its own. They are the same for every
 * instance and never change within a release, so they are cached; the policy forbids everything, so they can
 * only ever be displayed.
 */
export function GET(
  _request: Request,
  { params }: { params: Promise<{ name: string }> },
): Promise<Response> {
  return params.then(({ name }) => {
    const icon = Object.hasOwn(DEFAULT_ICONS, name) ? DEFAULT_ICONS[name] : undefined;
    if (!icon) return new Response(null, { status: 404 });
    return new Response(new Uint8Array(icon.bytes), {
      headers: {
        'content-type': icon.contentType,
        'content-length': String(icon.bytes.length),
        'cache-control': 'public, max-age=86400',
        'x-content-type-options': 'nosniff',
        'content-security-policy': "default-src 'none'; sandbox",
      },
    });
  });
}
