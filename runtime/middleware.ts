import { getCookieCache } from 'better-auth/cookies';
import { type NextRequest, NextResponse } from 'next/server';
import { decideApiNamespace, isPublicApiPath } from '@/src/api-namespace';
import { capabilitiesForRole } from '@/src/capabilities';
import {
  DEV_MODE_FORWARDED_HEADER,
  DEV_MODE_INCOMING_HEADER,
  isDevModeConfigured,
  validateDevModeSecret,
} from '@/src/dev-mode';
import { ALL_GRANTED_PLUGIN_CAPS } from '@/generated/plugin-capabilities';
import { getInstalledPlugins } from '@/src/registry';
import { decidePluginRoute, matchedPluginId, underPrefix } from '@/src/route-guard';
import { buildContentSecurityPolicy, generateNonce } from '@/src/security';
import {
  type CachedSessionData,
  type VerifiedSession,
  resolveAuthSecret,
  verifiedUserFromCache,
} from '@/src/session-verify';

const AUTH_URL =
  process.env.SOVEREIGN_AUTH_URL ?? `http://localhost:${process.env.AUTH_PORT ?? '3001'}`;

// Self-fetch address for the runtime's own Node-runtime API routes. The server
// always listens on :3000 (scripts/dev.ts and the start script both pin it),
// so localhost is reliable in every environment — unlike the public URL, which
// may sit behind a reverse proxy the container cannot hairpin through.
const SELF_URL = `http://localhost:${process.env.RUNTIME_PORT ?? process.env.PORT ?? '3000'}`;

/**
 * The browser-facing auth origin (scheme + host + port) for the CSP form-action
 * allowance — same value the /login and logout routes redirect to. Returns
 * undefined if the URL can't be parsed (CSP then falls back to 'self' only).
 */
function authPublicOrigin(): string | undefined {
  const url = process.env.SOVEREIGN_AUTH_PUBLIC_URL ?? process.env.SOVEREIGN_AUTH_URL ?? AUTH_URL;
  try {
    return new URL(url).origin;
  } catch {
    return undefined;
  }
}

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
 * Returns the set of paid plugin IDs for which the given user has no active
 * entitlement (RFC 0003). Fails open — if the fetch errors, no plugin is
 * paywalled (same conservative approach as disabled-plugin gating).
 */
async function fetchPaywalledPluginIds(userId: string): Promise<Set<string>> {
  try {
    const res = await fetch(
      `${SELF_URL}/api/admin/entitlements?userId=${encodeURIComponent(userId)}`,
      { headers: { authorization: `Bearer ${process.env.SOVEREIGN_ADMIN_KEY ?? ''}` } },
    );
    if (!res.ok) return new Set();
    const { paywalled } = (await res.json()) as { paywalled: string[] };
    return new Set(paywalled);
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
 * Routes under an `adminOnly` plugin's prefix require the `console:access`
 * capability (RFC 0021) — users without it get 403 (SRS §3.4, PLT-03). Routes under a
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
    // Allow direct posts from auth-server compatibility pages while the auth
    // app remains browser-reachable during the route migration.
    authFormActionOrigin: authPublicOrigin(),
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
      // 303 (See Other), not the NextResponse.redirect default of 307. A 307
      // preserves the request method, so an unauthenticated POST to a gated
      // route (e.g. the logout form once the session has lapsed, or any plugin
      // form submit) would redirect as POST /login — and /login only handles
      // GET, returning 405. 303 forces the browser to GET /login instead.
      return applyCsp(NextResponse.redirect(new URL('/login', request.url), 303));
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

  // Attach a visible response header so clients (curl, browser devtools) can
  // confirm dev-mode is active — a guardrail against mistaking mock data for
  // real (RFC 0020 "visibly flagged" requirement).
  const withDevMode = (response: NextResponse): NextResponse => {
    if (devModeActive) response.headers.set('x-sovereign-dev-mode', 'active');
    return response;
  };

  const installedPlugins = getInstalledPlugins();

  // Only consult plugin status when the path is actually under a plugin prefix.
  const underPlugin = installedPlugins.some((plugin) => underPrefix(pathname, plugin.routePrefix));
  if (underPlugin) {
    const [disabledIds, paywallIds] = await Promise.all([
      fetchDisabledPluginIds(),
      fetchPaywalledPluginIds(user.id),
    ]);
    const decision = decidePluginRoute(
      pathname,
      installedPlugins,
      disabledIds,
      user.role,
      paywallIds,
    );
    if (decision === 'not-found') {
      return applyCsp(withCookies(new NextResponse('Not Found', { status: 404 })));
    }
    if (decision === 'forbidden') {
      return applyCsp(withCookies(new NextResponse('Forbidden', { status: 403 })));
    }
    if (decision === 'paywall') {
      const pluginId = matchedPluginId(pathname, installedPlugins) ?? '';
      // API routes under a paywalled plugin return 402; page routes redirect to the paywall.
      if (pathname.startsWith('/api/')) {
        return applyCsp(withCookies(new NextResponse('Payment Required', { status: 402 })));
      }
      return applyCsp(
        withCookies(
          NextResponse.redirect(new URL(`/paywall/${encodeURIComponent(pluginId)}`, request.url), {
            status: 303,
          }),
        ),
      );
    }
  }

  // Dev-mode switch (RFC 0020): if SOVEREIGN_DEV_MODE_ENABLED=true and the
  // request carries a valid dev-mode secret, forward the marker header so
  // downstream route handlers resolve the mock DB via getPlatformDb(). The
  // check happens after session verification so we know the caller is
  // authenticated. Edge runtime cannot write to the DB, so audit logging is
  // done via console.log (picked up by operators reading server stdout).
  const devModeActive =
    isDevModeConfigured() && validateDevModeSecret(request.headers.get(DEV_MODE_INCOMING_HEADER));
  if (devModeActive) {
    console.log(
      JSON.stringify({
        ts: new Date().toISOString(),
        level: 'info',
        msg: 'dev-mode activated',
        userId: user.id,
        path: pathname,
      }),
    );
  }

  const headers = new Headers(request.headers);
  // Pass the nonce to the rendered request: Next reads it from the CSP request
  // header for its scripts; the layout reads `x-nonce` for the theme script.
  headers.set('x-nonce', nonce);
  headers.set('content-security-policy', csp);
  headers.set('x-sovereign-user-id', user.id);
  headers.set('x-sovereign-user-email', user.email);
  headers.set('x-sovereign-user-role', user.role);
  const platformCaps = capabilitiesForRole(user.role);
  const allCaps =
    ALL_GRANTED_PLUGIN_CAPS.length > 0
      ? [...platformCaps, ...ALL_GRANTED_PLUGIN_CAPS]
      : platformCaps;
  headers.set('x-sovereign-user-capabilities', JSON.stringify(allCaps));
  headers.set('x-sovereign-session-expires-at', String(expiresAt));
  if (user.name != null) headers.set('x-sovereign-user-name', user.name);
  if (user.image != null) headers.set('x-sovereign-user-image', user.image);

  // Inject the current plugin ID so sdk.data.query() knows the consumer (RFC 0002).
  const currentPlugin = installedPlugins.find((plugin) =>
    underPrefix(pathname, plugin.routePrefix),
  );
  if (currentPlugin) headers.set('x-sovereign-plugin-id', currentPlugin.id);

  // Forward the dev-mode flag to Node runtime handlers (RFC 0020). The marker
  // header is safe to inject here — it was validated above; stripping the
  // incoming secret header prevents it from reaching plugin code.
  headers.delete(DEV_MODE_INCOMING_HEADER);
  if (devModeActive) headers.set(DEV_MODE_FORWARDED_HEADER, '1');

  // Serve the configured root plugin in place at `/` (PLT-14) — the URL stays
  // `/` while the plugin's route renders, and the plugin is still reachable at
  // its own routePrefix. Falls through to the placeholder home page when no
  // valid root plugin resolves. `(platform)/page.tsx` keeps a redirect as a
  // belt-and-suspenders fallback for the rare case this fetch fails.
  if (pathname === '/') {
    const rootPrefix = await fetchRootPluginPrefix();
    if (rootPrefix && rootPrefix !== '/') {
      return applyCsp(
        withDevMode(
          withCookies(
            NextResponse.rewrite(new URL(rootPrefix, request.url), { request: { headers } }),
          ),
        ),
      );
    }
  }

  return applyCsp(withDevMode(withCookies(NextResponse.next({ request: { headers } }))));
}

export const config = {
  // Gate everything except auth redirects, internal admin API, the public
  // liveness probe (Docker HEALTHCHECK — must answer without a session), the
  // offline fallback, the PWA assets (manifest, service worker, Workbox/fallback
  // bundles, icons — must load without a session), and Next static assets.
  matcher: [
    // Exclude: auth pages, admin API (self-authenticated), public liveness probe,
    // brand assets (must load on the login page pre-session), dynamic manifest
    // (browsers fetch it before login for PWA install), offline fallback, PWA
    // assets, and Next.js static assets.
    '/((?!login|register|forgot-password|reset-password|offline|api/auth|api/admin|api/health|api/instance|api/manifest|manifest.json|sw.js|workbox-|fallback-|icons/|_next/static|_next/image|favicon.ico).*)',
  ],
};
