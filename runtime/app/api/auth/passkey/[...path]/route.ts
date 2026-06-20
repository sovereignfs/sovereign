/**
 * Proxy for /api/auth/passkey/* → auth server.
 *
 * The account plugin's PasskeySection calls these endpoints from the browser.
 * Without this proxy, the browser would need to call the auth server directly
 * (cross-origin), but SameSite=Lax session cookies are not sent on cross-origin
 * fetch requests, so the auth server never sees the session. Routing through the
 * same-origin runtime avoids that: the proxy reads the session cookie from the
 * incoming request and forwards it to the auth server server-side.
 */
import { headers } from 'next/headers';

const AUTH_URL = process.env.SOVEREIGN_AUTH_URL ?? 'http://localhost:3001';

async function proxy(req: Request, path: string[]): Promise<Response> {
  const h = await headers();
  const cookie = h.get('cookie') ?? '';
  const targetPath = path.join('/');
  const search = new URL(req.url).search;

  const isGet = req.method === 'GET';
  const targetUrl = `${AUTH_URL}/api/auth/passkey/${targetPath}${isGet ? search : ''}`;

  const res = await fetch(targetUrl, {
    method: req.method,
    headers: {
      ...(isGet ? {} : { 'content-type': 'application/json' }),
      cookie,
      origin: AUTH_URL,
    },
    ...(isGet ? {} : { body: await req.text() }),
  });

  const responseHeaders = new Headers();
  const contentType = res.headers.get('content-type');
  if (contentType) responseHeaders.set('content-type', contentType);

  // Forward any session-update cookies the auth server sends back (e.g. after
  // a successful passkey registration better-auth may refresh the session).
  const getSetCookie = (res.headers as { getSetCookie?: () => string[] }).getSetCookie;
  const setCookies =
    typeof getSetCookie === 'function'
      ? getSetCookie.call(res.headers)
      : (() => {
          const v = res.headers.get('set-cookie');
          return v ? [v] : [];
        })();
  for (const c of setCookies) responseHeaders.append('set-cookie', c);

  return new Response(res.body, { status: res.status, headers: responseHeaders });
}

export async function GET(req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  return proxy(req, path);
}

export async function POST(req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  return proxy(req, path);
}
