import { DEFAULT_ICONS, type DefaultIcon } from '../../../src/branding/default-icons';
import { SCREENSHOTS } from '../../../src/branding/screenshots';

/**
 * The icons an instance has until its operator sets a favicon of its own. They are the same for every
 * instance and never change within a release, so they are cached; the policy forbids everything, so they can
 * only ever be displayed. The pictures an install sheet shows (RFC 0001 A1) are served the same way.
 */
export function GET(
  _request: Request,
  { params }: { params: Promise<{ name: string }> },
): Promise<Response> {
  return params.then(({ name }) => {
    const icon: DefaultIcon | undefined = Object.hasOwn(DEFAULT_ICONS, name)
      ? DEFAULT_ICONS[name]
      : Object.hasOwn(SCREENSHOTS, name)
        ? SCREENSHOTS[name]
        : undefined;
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
