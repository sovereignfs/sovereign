/**
 * Middleware response helpers: applying the per-request CSP, forwarding
 * Set-Cookie headers and the dev-mode marker, stripping caller-supplied
 * platform-trust headers before any forward, and building the login/paywall
 * redirects. Extracted from `runtime/middleware.ts` (Task 2.17) — behavior
 * unchanged, purely a relocation plus turning request-scoped closures into
 * explicit parameters.
 */
import type { SovereignManifest } from '@sovereignfs/manifest';
import { type NextRequest, NextResponse } from 'next/server';

/**
 * Headers this middleware treats as platform-computed and injects itself —
 * never legitimate input from a caller. Every branch that forwards a request
 * (rewrite or `next()`) must strip these from the *inbound* clone before
 * conditionally re-setting any of them, so an unauthenticated or anonymous
 * path can never let a caller-supplied value (e.g. `curl -H
 * "x-sovereign-user-role: platform:owner"`) survive into a plugin route —
 * downstream code (e.g. `runtime/app/api/instance/logo/route.ts`) trusts
 * these headers directly for authorization.
 */
export const SOVEREIGN_TRUST_HEADERS = [
  'x-sovereign-user-id',
  'x-sovereign-user-email',
  'x-sovereign-user-role',
  'x-sovereign-user-capabilities',
  'x-sovereign-user-name',
  'x-sovereign-user-image',
  'x-sovereign-session-expires-at',
  'x-sovereign-plugin-id',
  'x-sovereign-verification-level',
] as const;

/** Clone the inbound request headers with every platform-trust header stripped. */
export function strippedRequestHeaders(request: NextRequest): Headers {
  const headers = new Headers(request.headers);
  for (const name of SOVEREIGN_TRUST_HEADERS) headers.delete(name);
  return headers;
}

/** Stamp the per-request CSP on a response leaving the middleware. */
export function applyCsp(response: NextResponse, csp: string): NextResponse {
  response.headers.set('content-security-policy', csp);
  return response;
}

/**
 * Forward any Set-Cookie from the auth-server fallback verification so the
 * signed cookie cache (re)installs — subsequent requests then verify locally
 * without a round-trip.
 */
export function withCookies(response: NextResponse, setCookies: string[]): NextResponse {
  for (const cookie of setCookies) response.headers.append('set-cookie', cookie);
  return response;
}

/**
 * Attach a visible response header so clients (curl, browser devtools) can
 * confirm dev-mode is active — a guardrail against mistaking mock data for
 * real (RFC 0020 "visibly flagged" requirement).
 */
export function withDevMode(response: NextResponse, devModeActive: boolean): NextResponse {
  if (devModeActive) response.headers.set('x-sovereign-dev-mode', 'active');
  return response;
}

/**
 * Build the unauthenticated-request response for a gated path: a rewrite to
 * `/login` (not a redirect) for `/` and an `installable` plugin's own bare
 * `routePrefix` (RFC 0081) — see the inline history below — otherwise a 303
 * redirect to `/login` with `returnUrl`.
 *
 * `/` is the PWA manifest's start_url (RFC 0013). iOS resolves an installed
 * app's launch/splash image from the *direct* response to start_url and does
 * not follow an HTTP redirect to find one. A 303 redirect has no body/head at
 * all, so a cold launch with no session yet (fresh "Add to Home Screen", or
 * right after Safari site data is cleared) shows a blank white screen instead
 * of the splash — even though /login itself carries every
 * apple-touch-startup-image link correctly. Rewriting instead of redirecting
 * returns the real /login document (200, full <head>) at the same URL, same
 * as the authenticated root-plugin rewrite in `runtime/middleware.ts`. GET
 * only: a rewrite preserves the request method, and /login only handles GET.
 *
 * An `installable` plugin's own bare `routePrefix` needs exactly the same
 * treatment for exactly the same reason: it's that plugin's *own* PWA
 * `start_url` once installed standalone, with its own scope — a 303 to
 * /login would either leave the installed app's scope entirely or show the
 * same blank-flash bug `/` already avoids. Exact match against the bare
 * prefix only (not a prefix match) — a nested path like `/tally/groups/42`
 * is an ordinary session-gated page, not the app's installed entry point.
 *
 * 303 (See Other), not the `NextResponse.redirect` default of 307, on the
 * plain-redirect path below. A 307 preserves the request method, so an
 * unauthenticated POST to a gated route (e.g. the logout form once the
 * session has lapsed, or any plugin form submit) would redirect as
 * `POST /login` — and /login only handles GET, returning 405. 303 forces the
 * browser to GET /login instead.
 */
export function buildLoginRedirect(
  request: NextRequest,
  installedPlugins: SovereignManifest[],
): NextResponse {
  const { pathname } = request.nextUrl;
  const installablePlugin = installedPlugins.find(
    (plugin) => plugin.installable === true && plugin.routePrefix === pathname,
  );
  if ((pathname === '/' || installablePlugin) && request.method === 'GET') {
    const rewriteUrl = new URL('/login', request.url);
    // Only the plugin case needs `returnUrl` — post-login must return *into
    // the installed app's scope*, not out to `/`. The `/` case stays exactly
    // as it always has: no param, defaults to `/` itself. This is set on the
    // *rewrite target* URL, not the browser's visible address bar (a
    // rewrite never changes that). `runtime/app/login/page.tsx` reads it
    // server-side via its `searchParams` prop rather than `LoginForm`'s own
    // `useSearchParams()` client hook — that distinction is load-bearing,
    // not stylistic: a client hook reads `window.location`, which a rewrite
    // never updates, so it silently sees no query string at all here.
    // Confirmed live (not assumed): the client-hook version landed
    // post-login at `/` instead of the plugin route every time, until
    // page.tsx was changed to read this server-side instead.
    if (installablePlugin) rewriteUrl.searchParams.set('returnUrl', pathname);
    return NextResponse.rewrite(rewriteUrl);
  }
  const loginUrl = new URL('/login', request.url);
  if (pathname !== '/') {
    loginUrl.searchParams.set('returnUrl', pathname + request.nextUrl.search);
  }
  return NextResponse.redirect(loginUrl, 303);
}

/** Build the 303 redirect to a paywalled plugin's `/paywall/<pluginId>` page. */
export function buildPaywallRedirect(request: NextRequest, pluginId: string): NextResponse {
  return NextResponse.redirect(new URL(`/paywall/${encodeURIComponent(pluginId)}`, request.url), {
    status: 303,
  });
}
