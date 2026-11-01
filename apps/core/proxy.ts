import { NextResponse, type NextRequest } from 'next/server';
import { sessionCookieName } from './src/auth/cookies';
import { buildCsp, createNonce, securityHeaders } from './src/csp';

/**
 * Applies the Content Security Policy, and the other security headers, to every response. The nonce is also handed to
 * the page through the request, where Next reads it to stamp its own scripts.
 *
 * A request with no session cookie is sent to sign-in. That is only a first, cheap turning-away:
 * the cookie is not verified here (the proxy cannot reach the database), so every page and
 * route that needs a person checks the session itself. Only the name this instance sets counts: a cookie
 * under another one is not a session, and better-auth would not read it as one.
 *
 * Keep the Edge discipline here: no Node built-ins and no database access. Every way
 * out of this function goes through `withSecurity`, so a branch added later cannot skip the headers.
 */
export function proxy(request: NextRequest): NextResponse {
  const nonce = createNonce();
  // SV_URL is validated at start-up (instrumentation.ts); the proxy only reads it, and
  // not through the configuration package, to keep to web-standard APIs.
  const https = isHttps(process.env.SV_URL);
  const csp = buildCsp({
    nonce,
    development: process.env.NODE_ENV === 'development',
    upgradeInsecureRequests: https,
    // The launcher draws each app's icon from the address an operator gave; no other page loads a remote picture.
    remoteImages: request.nextUrl.pathname === '/',
  });

  // Read from the environment like SV_URL, and not through the configuration package. Whether the cookie domain is
  // set decides the cookie's name (src/auth/cookies.ts), and a blank value is unset, as it is there.
  const sessionCookie = sessionCookieName({
    secure: https,
    domain: process.env.SV_AUTH_COOKIE_DOMAIN?.trim() || undefined,
  });

  if (!isPublic(request.nextUrl.pathname) && !request.cookies.has(sessionCookie)) {
    // SV_URL, not the request's own address: behind a reverse proxy that is an internal one.
    const signIn = new URL('/sign-in', process.env.SV_URL);
    const returnTo = request.nextUrl.pathname + request.nextUrl.search;
    if (returnTo !== '/') signIn.searchParams.set('returnTo', returnTo);
    // 303, never 307: a 307 repeats the method, so a POST would be replayed at the sign-in page.
    return withSecurity(NextResponse.redirect(signIn, 303), csp, https);
  }

  const headers = new Headers(request.headers);
  headers.set('x-nonce', nonce);
  headers.set('Content-Security-Policy', csp);

  return withSecurity(NextResponse.next({ request: { headers } }), csp, https);
}

/**
 * Whether core is served over https, read as the configuration reads it: SV_URL is parsed, not matched as text, so
 * `HTTPS://Core.Sovereign.local` is https here as well. The cookie's name depends on it (src/auth/cookies.ts), and a proxy that
 * disagreed with better-auth would look for a name nobody sets and send every signed-in person back to sign-in.
 */
function isHttps(url: string | undefined): boolean {
  try {
    return new URL((url ?? '').trim()).protocol === 'https:';
  } catch {
    return false;
  }
}

/** The pages and routes anyone may reach: sign-in and its second step, sign-up, invitation links, the password reset pages, the legal pages, better-auth's own routes, health, assets. */
function isPublic(pathname: string): boolean {
  return (
    pathname === '/sign-in' ||
    pathname === '/sign-up' ||
    pathname === '/sign-in/two-factor' ||
    pathname === '/privacy' ||
    pathname === '/tos' ||
    pathname === '/forgot-password' ||
    pathname === '/reset-password' ||
    // An invitation link: the person it was sent to has no account or cookie yet.
    pathname.startsWith('/invite/') ||
    pathname === '/api/health' ||
    // Discovery: an app finds the instance's endpoints here with no account and no cookie.
    pathname === '/.well-known/openid-configuration' ||
    pathname === '/.well-known/oauth-authorization-server' ||
    // The instance's public branding for apps (core-app §3.13).
    pathname === '/.well-known/sovereign-instance' ||
    // The Core API: a call carries a bearer token and no cookie, and every route asks for its own (core-app §3.9).
    pathname.startsWith('/api/v1/') ||
    pathname.startsWith('/api/auth/') ||
    pathname.startsWith('/api/avatars/') ||
    pathname.startsWith('/api/branding/') ||
    pathname.startsWith('/_next/') ||
    // The service worker: a browser fetches it with no session, and it is the same for everyone.
    pathname === '/sw.js' ||
    // The web app manifest: a browser fetches it with no session, and it is the same for everyone.
    pathname === '/manifest.webmanifest' ||
    // The icons an instance has until it sets a favicon of its own.
    pathname.startsWith('/icons/') ||
    pathname === '/favicon.ico'
  );
}

function withSecurity(response: NextResponse, csp: string, https: boolean): NextResponse {
  response.headers.set('Content-Security-Policy', csp);
  for (const [name, value] of Object.entries(securityHeaders({ https }))) {
    response.headers.set(name, value);
  }
  return response;
}

// Everything, API routes and static files included: the policy and the headers go on every response.
export const config = {
  matcher: '/:path*',
};
