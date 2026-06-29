/**
 * General proxy for /api/auth/* → auth server.
 *
 * The runtime's login/register/2fa pages call /api/auth/* from the browser.
 * Without this proxy the browser would need to call the auth server cross-origin,
 * but SameSite=Lax cookies are not forwarded on cross-origin fetches, so the
 * auth server never sees the session. Routing through the same-origin runtime
 * avoids that, and also keeps every auth flow on the runtime's origin — required
 * for iOS PWA standalone mode, which breaks out to Safari on cross-origin redirects.
 *
 * The more-specific runtime/app/api/auth/passkey/[...path] route still handles
 * /api/auth/passkey/* (Next.js prefers the static 'passkey' segment); this
 * catch-all handles sign-in, sign-up, two-factor, and all other auth endpoints.
 */
import { headers } from 'next/headers';

const AUTH_URL = process.env.SOVEREIGN_AUTH_URL ?? 'http://localhost:3001';

async function proxy(req: Request, path: string[]): Promise<Response> {
  const h = await headers();
  const cookie = h.get('cookie') ?? '';
  const targetPath = path.join('/');
  const search = new URL(req.url).search;
  const isGet = req.method === 'GET' || req.method === 'HEAD';
  const targetUrl = `${AUTH_URL}/api/auth/${targetPath}${search}`;

  const res = await fetch(targetUrl, {
    method: req.method,
    headers: {
      ...(isGet ? {} : { 'content-type': req.headers.get('content-type') ?? 'application/json' }),
      cookie,
      // better-auth CSRF check requires Origin to equal a trusted origin.
      origin: AUTH_URL,
    },
    ...(isGet ? {} : { body: await req.text() }),
  });

  const out = new Headers();
  const ct = res.headers.get('content-type');
  if (ct) out.set('content-type', ct);

  const getSetCookie = (res.headers as { getSetCookie?: () => string[] }).getSetCookie;
  const setCookies =
    typeof getSetCookie === 'function'
      ? getSetCookie.call(res.headers)
      : (() => {
          const v = res.headers.get('set-cookie');
          return v ? [v] : [];
        })();
  for (const c of setCookies) out.append('set-cookie', c);

  return new Response(res.body, { status: res.status, headers: out });
}

export async function GET(req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  return proxy(req, path);
}

export async function POST(req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  return proxy(req, path);
}

export async function PUT(req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  return proxy(req, path);
}

export async function DELETE(req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  return proxy(req, path);
}
