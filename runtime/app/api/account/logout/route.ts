import { NextResponse } from 'next/server';
import { sdk } from '@sovereignfs/sdk';

/**
 * Self sign-out (AUTH-02 / ACC-11). A POST target so both the shell avatar menu
 * and the Account → Security "Log out" control work as plain form submissions
 * (no JS required). Ends the session on the auth server, then clears the
 * runtime's signed `session_data` cache cookies so the next request re-verifies
 * immediately (AUTH-05) — without this, protected routes would stay reachable
 * until the cache window (`cookieCache.maxAge`) elapsed. Redirects to the
 * runtime's own /login page (same origin — keeps iOS PWA in standalone mode).
 *
 * 303 (See Other) so the browser follows with a GET. The session token cookie
 * is host-scoped and already invalid server-side after sign-out; clearing the
 * cache cookies is what guarantees the immediate redirect.
 */
export async function POST(request: Request): Promise<Response> {
  await sdk.auth.signOut();

  // Reconstruct the public origin from proxy headers rather than request.url —
  // in Docker, Next.js binds to 0.0.0.0 so request.url contains that address,
  // which the browser cannot reach. x-forwarded-proto/host reflect the actual
  // public URL set by the reverse proxy (or default to http/localhost:3000 in
  // native dev where request.url is already correct).
  const req = request as import('next/server').NextRequest;
  const proto =
    req.headers.get('x-forwarded-proto') ?? new URL(request.url).protocol.replace(':', '');
  const host =
    req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? new URL(request.url).host;
  const res = NextResponse.redirect(new URL('/login?signedout=1', `${proto}://${host}`), 303);
  // Drop both cache-cookie variants (the `__Secure-` one only unsets with Secure).
  res.cookies.set('better-auth.session_data', '', { maxAge: 0, path: '/' });
  res.cookies.set('__Secure-better-auth.session_data', '', {
    maxAge: 0,
    path: '/',
    secure: true,
  });
  return res;
}
