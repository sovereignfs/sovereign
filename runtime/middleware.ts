import { getCookieCache } from 'better-auth/cookies';
import { type NextRequest, NextResponse } from 'next/server';
import { decideApiNamespace, isPublicApiPath } from '@/src/api-namespace';
import { getInstalledPlugins } from '@/src/registry';
import { decidePluginRoute, underPrefix } from '@/src/route-guard';
import { buildContentSecurityPolicy, generateNonce } from '@/src/security';
import {
  type CachedSessionData,
  type VerifiedSession,
  resolveAuthSecret,
  verifiedUserFromCache,
} from '@/src/session-verify';

const AUTH_URL = process.env.SOVEREIGN_AUTH_URL ?? 'http://localhost:3001';

// Self-fetch address for the runtime's own Node-runtime API routes. The server
// always listens on :3000 (scripts/dev.ts and the start script both pin it),
// so localhost is reliable in every environment — unlike the public URL, which
// may sit behind a reverse proxy the container cannot hairpin through.
const SELF_URL = 'http://localhost:3000';

/**
 * Middleware runs on the Edge runtime, which cannot open the SQLite database.
 * Plugin enabled/disabled state is fetched from the runtime's own
 * /api/admin/plugins/disabled route (Node runtime, excluded from this
 * middleware's matcher) — same round-trip pattern as the auth /api/verify
 * check. Fails open: if the status fetch errors, the route stays reachable
 * (disable is an admin convenience, not a security boundary — adminOnly
 * gating below is independent of it).
 */
async function fetchDisabledPluginIds(): Promise<Set<string>> {
  try {
    const res = await fetch(`${SELF_URL}/api/admin/plugins/disabled`, {
      headers: { authorization: `Bearer ${process.env.SOVEREIGN_ADMIN_KEY ?? ''}` },
    });
    if (!res.ok) return new Set();
    const { disabled } = (await res.json()) as { disabled: string[] };
    return new Set(disabled);
  } catch {
    return new Set();
  }
}

/**
 * The configured root plugin's `routePrefix`, fetched from the Node-runtime
 * route (Edge middleware cannot read the DB). Used to serve the root plugin in
 * place at `/` (PLT-14). Returns null on any failure, so `/` falls through to
 * the placeholder home page rather than erroring.
 */
async function fetchRootPluginPrefix(): Promise<string | null> {
  try {
    const res = await fetch(`${SELF_URL}/api/admin/root-plugin`, {
      headers: { authorization: `Bearer ${process.env.SOVEREIGN_ADMIN_KEY ?? ''}` },
    });
    if (!res.ok) return null;
    const { routePrefix } = (await res.json()) as { routePrefix: string | null };
    return routePrefix;
  } catch {
    return null;
  }
}

/**
 * Verify the request's session **locally** from better-auth's signed
 * `session_data` cookie cache — no network call (SRS AUTH-05). The cookie is
 * HMAC-signed with the shared auth secret, so a forged one cannot pass. Returns
 * null when no secret is configured or no valid cache cookie is present, so the
 * caller falls back to `/api/verify`. The cookie name carries the `__Secure-`
 * prefix in production; try both so the read works in dev and prod regardless of
 * NODE_ENV drift.
 */
async function verifyFromCookieCache(request: NextRequest): Promise<VerifiedSession | null> {
  const secret = resolveAuthSecret();
  if (!secret) return null;
  for (const isSecure of [undefined, true, false] as const) {
    const cached = (await getCookieCache(request, {
      secret,
      ...(isSecure === undefined ? {} : { isSecure }),
    }).catch(() => null)) as CachedSessionData | null;
    const session = verifiedUserFromCache(cached);
    if (session) return session;
  }
  return null;
}

/**
 * Verify the request against the auth server's /api/verify (AUTH-06) — the
 * fallback when local verification has no cookie to read (e.g. a session that
 * predates cookie-cache rollout, or just past the cache window). Returns the
 * session plus better-auth's Set-Cookie headers, which the caller forwards so
 * the `session_data` cache (re)installs and subsequent requests verify locally.
 *
 * Fails closed: a non-OK response *or* an unreachable auth server (fetch
 * throws) returns null, so the caller redirects to /login rather than crashing
 * the request with a 500.
 */
async function verifyViaAuthServer(
  request: NextRequest,
): Promise<{ session: VerifiedSession; setCookies: string[] } | null> {
  try {
    const verify = await fetch(`${AUTH_URL}/api/verify`, {
      headers: { cookie: request.headers.get('cookie') ?? '' },
    });
    if (!verify.ok) return null;
    const payload = (await verify.json()) as VerifiedSession;
    return { session: payload, setCookies: verify.headers.getSetCookie() };
  } catch {
    return null;
  }
}

/**
 * Session gate + plugin route protection. Verifies the session locally from the
 * signed cookie cache and falls back to the auth server's /api/verify (SRS
 * AUTH-05/06). On success the verified user is injected as request headers for
 * downstream server components; otherwise the request is redirected to /login.
 * Routes under an `adminOnly` plugin's prefix are reachable only by
 * `platform:admin` — everyone else gets 403 (SRS §3.4, PLT-03). Routes under a
 * disabled plugin's prefix return 404 (SRS CON-07, PLT-04).
 */
export async function middleware(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  // Per-request CSP nonce (RFC 0008 Tier 0). Next reads the nonce from the
  // request's Content-Security-Policy header and applies it to its own inline
  // scripts; the root layout reads `x-nonce` for the pre-paint theme script.
  // `applyCsp` stamps the policy on every response leaving this middleware.
  const nonce = generateNonce();
  const csp = buildContentSecurityPolicy(nonce, {
    isProd: process.env.NODE_ENV === 'production',
  });
  const applyCsp = (response: NextResponse): NextResponse => {
    response.headers.set('content-security-policy', csp);
    return response;
  };

  // Public `/api/*` namespace (PLT-16): handled before the session gate — these
  // routes are unauthenticated (the provider plugin owns auth, e.g. API keys).
  // Delegate `/api/<slug>/*` to the registered provider's serve route, or 404
  // when none is installed/enabled. Reserved runtime segments (account, admin,
  // health, plugins) are not public and fall through to the normal flow below.
  if (isPublicApiPath(pathname)) {
    const disabledIds = await fetchDisabledPluginIds();
    const decision = decideApiNamespace(pathname, getInstalledPlugins(), disabledIds);
    if (decision.kind === 'not-found') {
      return applyCsp(new NextResponse('Not Found', { status: 404 }));
    }
    if (decision.kind === 'rewrite') {
      const target = new URL(decision.target, request.url);
      target.search = request.nextUrl.search;
      return applyCsp(NextResponse.rewrite(target));
    }
  }

  let session = await verifyFromCookieCache(request);
  let setCookies: string[] = [];
  if (!session) {
    const fallback = await verifyViaAuthServer(request);
    if (!fallback) {
      return applyCsp(NextResponse.redirect(new URL('/login', request.url)));
    }
    session = fallback.session;
    setCookies = fallback.setCookies;
  }
  const { user, expiresAt } = session;

  // Forward any Set-Cookie from the fallback so the signed cookie cache
  // (re)installs — subsequent requests then verify locally without a round-trip.
  const withCookies = (response: NextResponse): NextResponse => {
    for (const cookie of setCookies) response.headers.append('set-cookie', cookie);
    return response;
  };

  const installedPlugins = getInstalledPlugins();

  // Only consult plugin status when the path is actually under a plugin prefix.
  const underPlugin = installedPlugins.some((plugin) => underPrefix(pathname, plugin.routePrefix));
  if (underPlugin) {
    const disabledIds = await fetchDisabledPluginIds();
    const decision = decidePluginRoute(pathname, installedPlugins, disabledIds, user.role);
    if (decision === 'not-found') {
      return applyCsp(withCookies(new NextResponse('Not Found', { status: 404 })));
    }
    if (decision === 'forbidden') {
      return applyCsp(withCookies(new NextResponse('Forbidden', { status: 403 })));
    }
  }

  const headers = new Headers(request.headers);
  // Pass the nonce to the rendered request: Next reads it from the CSP request
  // header for its scripts; the layout reads `x-nonce` for the theme script.
  headers.set('x-nonce', nonce);
  headers.set('content-security-policy', csp);
  headers.set('x-sovereign-user-id', user.id);
  headers.set('x-sovereign-user-email', user.email);
  headers.set('x-sovereign-user-role', user.role);
  headers.set('x-sovereign-session-expires-at', String(expiresAt));
  if (user.name != null) headers.set('x-sovereign-user-name', user.name);
  if (user.image != null) headers.set('x-sovereign-user-image', user.image);

  // Serve the configured root plugin in place at `/` (PLT-14) — the URL stays
  // `/` while the plugin's route renders, and the plugin is still reachable at
  // its own routePrefix. Falls through to the placeholder home page when no
  // valid root plugin resolves. `(platform)/page.tsx` keeps a redirect as a
  // belt-and-suspenders fallback for the rare case this fetch fails.
  if (pathname === '/') {
    const rootPrefix = await fetchRootPluginPrefix();
    if (rootPrefix && rootPrefix !== '/') {
      return applyCsp(
        withCookies(
          NextResponse.rewrite(new URL(rootPrefix, request.url), { request: { headers } }),
        ),
      );
    }
  }

  return applyCsp(withCookies(NextResponse.next({ request: { headers } })));
}

export const config = {
  // Gate everything except auth redirects, internal admin API, the public
  // liveness probe (Docker HEALTHCHECK — must answer without a session), the
  // offline fallback, the PWA assets (manifest, service worker, Workbox/fallback
  // bundles, icons — must load without a session), and Next static assets.
  matcher: [
    '/((?!login|register|offline|api/admin|api/health|manifest.json|sw.js|workbox-|fallback-|icons/|_next/static|_next/image|favicon.ico).*)',
  ],
};
