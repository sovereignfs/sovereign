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

  const res = NextResponse.redirect(new URL('/login?signedout=1', request.url), 303);
  // Drop both cache-cookie variants (the `__Secure-` one only unsets with Secure).
  res.cookies.set('better-auth.session_data', '', { maxAge: 0, path: '/' });
  res.cookies.set('__Secure-better-auth.session_data', '', {
    maxAge: 0,
    path: '/',
    secure: true,
  });
  return res;
}
