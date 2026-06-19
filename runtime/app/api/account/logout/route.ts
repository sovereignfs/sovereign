import { NextResponse } from 'next/server';
import { sdk } from '@sovereignfs/sdk';

// Browser-facing auth URL for the post-logout redirect — must be reachable from
// the browser. In Docker, SOVEREIGN_AUTH_URL is the internal service name
// (http://auth:3001) which the browser cannot resolve, so prefer the public URL
// (same precedence as runtime/app/login/route.ts). sdk.auth.signOut() makes its
// own server-to-server call using SOVEREIGN_AUTH_URL internally.
const AUTH_PUBLIC_URL =
  process.env.SOVEREIGN_AUTH_PUBLIC_URL ??
  process.env.SOVEREIGN_AUTH_URL ??
  'http://localhost:3001';

/**
 * Self sign-out (AUTH-02 / ACC-11). A POST target so both the shell avatar menu
 * and the Account → Security "Log out" control work as plain form submissions
 * (no JS required). Ends the session on the auth server, then clears the
 * runtime's signed `session_data` cache cookies so the next request re-verifies
 * immediately (AUTH-05) — without this, protected routes would stay reachable
 * until the cache window (`cookieCache.maxAge`) elapsed. Finally redirects to
 * the auth server's login page with a "signed out" notice.
 *
 * 303 (See Other) so the browser follows with a GET. The session token cookie
 * is host-scoped and already invalid server-side after sign-out; clearing the
 * cache cookies is what guarantees the immediate redirect.
 */
export async function POST(): Promise<Response> {
  await sdk.auth.signOut();

  const res = NextResponse.redirect(`${AUTH_PUBLIC_URL}/login?signedout=1`, 303);
  // Drop both cache-cookie variants (the `__Secure-` one only unsets with Secure).
  res.cookies.set('better-auth.session_data', '', { maxAge: 0, path: '/' });
  res.cookies.set('__Secure-better-auth.session_data', '', {
    maxAge: 0,
    path: '/',
    secure: true,
  });
  return res;
}
