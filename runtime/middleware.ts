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
import {
  applyCsp as applyCspToResponse,
  buildLoginRedirect,
  buildPaywallRedirect,
  strippedRequestHeaders,
  withCookies as withCookiesOnResponse,
  withDevMode as withDevModeOnResponse,
} from '@/src/middleware/response';
import {
  fetchDisabledPluginIds,
  fetchPaywalledPluginIds,
  fetchRestrictedPluginIds,
  fetchRootPluginPrefix,
} from '@/src/middleware/plugin-gate';
import { AUTH_URL, verifySession } from '@/src/middleware/session';
import { getInstalledPlugins, getOfflineRoutePrefixes } from '@/src/registry';
import {
  decidePluginRoute,
  matchedPluginId,
  matchedPublicHandoffRoute,
  matchedPublicPluginRouteId,
  matchedWebhookRoute,
  underPrefix,
} from '@/src/route-guard';
import { checkGlobalRateLimit, clientIp, isGlobalRateLimitDisabled } from '@/src/rate-limit';
import { decideFocusRoute } from '@/src/route-lock';
import { buildContentSecurityPolicy, generateNonce } from '@/src/security';
import { applySurfaceHeaders, resolveSurface } from '@/src/surface';

/**
 * Runtime API routes that must be readable with no session — the login page
 * renders instance branding before any user is authenticated, and native
 * shells validate an instance (RFC 0058 epic task 20.2) before one exists.
 *
 * GET-only, deliberately: `/api/instance/logo` and `/api/instance/favicon`
 * also expose privileged POST (upload) and DELETE (remove) on the *same*
 * path, gated by `request.headers.get('x-sovereign-user-role')` in the route
 * handler. That header is trustworthy only because middleware strips any
 * caller-supplied copy and re-injects it from a verified session (see
 * `SOVEREIGN_TRUST_HEADERS` in `@/src/middleware/response`) — a guarantee that holds solely for paths
 * the middleware actually runs on. This path was previously excluded from
 * the matcher entirely (GET *and* POST/DELETE), which meant middleware never
 * ran and the header check trusted a caller-supplied value outright: `curl
 * -X POST -H "x-sovereign-user-role: platform:owner"` with no session
 * passed. Listing the path here (public GET) while leaving it inside the
 * matcher (gated everything else) closes that gap: GET is served below
 * before the session gate runs, POST/DELETE fall through to it like any
 * other authenticated route.
 */
const PUBLIC_INSTANCE_GET_PATHS: ReadonlySet<string> = new Set([
  '/api/instance',
  '/api/instance/logo',
  '/api/instance/favicon',
]);

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
  const applyCsp = (response: NextResponse): NextResponse => applyCspToResponse(response, csp);

  // General per-IP request-flood protection (runtime/src/rate-limit.ts) —
  // deliberately the very first check, before the public-API-namespace branch
  // below does its own fetch. Every path this middleware matches was
  // previously unprotected; only apps/auth's better-auth server had any rate
  // limiting, and only for its own routes.
  if (!isGlobalRateLimitDisabled()) {
    const limited = checkGlobalRateLimit(clientIp(request));
    if (!limited.allowed) {
      return applyCsp(
        new NextResponse('Too Many Requests', {
          status: 429,
          headers: { 'Retry-After': String(limited.retryAfterSeconds ?? 60) },
        }),
      );
    }
  }

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
      // The provider plugin does its own API-key auth for this namespace and
      // isn't expected to read these headers, but nothing stops a caller from
      // sending them — strip them so a forged value can never reach plugin
      // code as if it were platform-computed.
      const headers = strippedRequestHeaders(request);
      applySurfaceHeaders(headers, request.headers.get('user-agent'));
      return applyCsp(NextResponse.rewrite(target, { request: { headers } }));
    }
  }

  // Public, read-only instance branding/identity (see
  // PUBLIC_INSTANCE_GET_PATHS above) — served before the session gate so it
  // works on the login page and for pre-auth instance validation. POST/DELETE
  // to these same paths are NOT included here and fall through to the normal
  // authenticated flow below, which verifies a real session and injects the
  // trustworthy `x-sovereign-user-role` header those handlers check.
  if (
    (request.method === 'GET' || request.method === 'HEAD') &&
    PUBLIC_INSTANCE_GET_PATHS.has(pathname)
  ) {
    const headers = strippedRequestHeaders(request);
    applySurfaceHeaders(headers, request.headers.get('user-agent'));
    headers.set('x-nonce', nonce);
    headers.set('content-security-policy', csp);
    return applyCsp(NextResponse.next({ request: { headers } }));
  }

  const installedPlugins = getInstalledPlugins();

  // Focused native app route lock (RFC 0082 §3). Must run before any branch
  // below that could otherwise serve a *different* plugin's content (the
  // public-plugin-route branch, the session-gated main path, and the `/`
  // root-plugin rewrite), so an out-of-focus request always redirects
  // rather than briefly succeeding. Placed after the public-API-namespace
  // and public-instance-branding branches above on purpose, not by
  // oversight — both serve only `/api/*` paths, which
  // `runtime/src/route-lock.ts`'s allowlist always permits, so this check
  // would be a no-op for them regardless of placement.
  //
  // Hard rule (restated from `docs/architecture-rules.md`, canonical there):
  // this is a product-scoping/UX mechanism, never a security boundary — the
  // signal derives from a client-controlled User-Agent and is trivially
  // spoofable. Nothing below this point relies on it for confidentiality;
  // session, capability, and plugin-permission gates are unchanged and are
  // the only real boundaries. A forged focus header or edited User-Agent
  // grants no access the caller's role doesn't already have.
  const { surface: currentSurface, focusPlugin } = resolveSurface(
    request.headers.get('user-agent'),
  );
  const focusDecision = decideFocusRoute(pathname, focusPlugin, installedPlugins);
  if (focusDecision.kind === 'redirect') {
    return applyCsp(
      NextResponse.redirect(new URL(focusDecision.routePrefix, request.url), { status: 303 }),
    );
  }

  // Manifest-declared public webhook endpoints (RFC 0050): resolved before
  // both the public-page-route branch and the login-redirect gate. A webhook
  // is a narrower, distinct primitive from a public *page* route — no
  // paywall or session-fallback logic applies, since there is no human
  // browsing session on the other end, only a provider's callback. Method
  // and Content-Length limits are enforced here, before any plugin code
  // runs (RFC 0050 requirement 3) — see docs/plugin-development.md's
  // "webhooks" section for the documented gap this doesn't close: a
  // chunked-transfer body with no Content-Length header cannot be
  // pre-checked without consuming it, so the plugin's own handler is the
  // backstop for that case. A method not in the declared list gets 404, not
  // 405 — the platform never reveals which methods a declared path accepts,
  // matching the disabled-plugin 404 below (RFC 0050: "Invalid signatures
  // return 404 or 401 without revealing whether a resource exists" — the
  // same fail-closed-without-disclosure posture extends to method mismatch).
  const webhookMatch = matchedWebhookRoute(pathname, installedPlugins);
  if (webhookMatch) {
    const disabledIds = await fetchDisabledPluginIds();
    if (disabledIds.has(webhookMatch.pluginId)) {
      return applyCsp(new NextResponse('Not Found', { status: 404 }));
    }
    if (!webhookMatch.webhook.methods.includes(request.method)) {
      return applyCsp(new NextResponse('Not Found', { status: 404 }));
    }
    const contentLength = request.headers.get('content-length');
    if (contentLength !== null && Number(contentLength) > webhookMatch.webhook.maxBodyBytes) {
      return applyCsp(new NextResponse('Payload Too Large', { status: 413 }));
    }

    // Strip inbound trust headers unconditionally, then set only plugin
    // identity — deliberately never any x-sovereign-user-* header, even if
    // the request happens to carry a valid session cookie. RFC 0050: "never
    // injects a forged user identity" — there is no user for a webhook call.
    const webhookHeaders = strippedRequestHeaders(request);
    applySurfaceHeaders(webhookHeaders, request.headers.get('user-agent'));
    webhookHeaders.set('x-nonce', nonce);
    webhookHeaders.set('content-security-policy', csp);
    webhookHeaders.set('x-sovereign-plugin-id', webhookMatch.pluginId);

    return applyCsp(NextResponse.next({ request: { headers: webhookHeaders } }));
  }

  // Manifest-declared public plugin page routes (RFC 0042): resolved before the
  // login-redirect gate, since an anonymous request must be able to reach them.
  // The plugin itself owns authorization for these paths (token/public-ID/
  // session-fallback) and must fail closed — this middleware only decides
  // whether the *platform* gates apply, not whether the page's content is safe
  // to serve. Disabled-plugin and paywall gates still apply here (RFC 0042
  // "Middleware behavior"); there is no `paywallExempt` yet, so a monetized
  // plugin's public routes block anonymous access by default.
  const publicRoutePluginId = matchedPublicPluginRouteId(pathname, installedPlugins);
  if (publicRoutePluginId) {
    const disabledIds = await fetchDisabledPluginIds();
    if (disabledIds.has(publicRoutePluginId)) {
      return applyCsp(new NextResponse('Not Found', { status: 404 }));
    }

    // Unlike the normal gate below, a failed verification does not redirect
    // to /login — the request proceeds anonymously and the plugin decides.
    const publicResult = await verifySession(request);
    const publicSession = publicResult?.session ?? null;
    const publicSetCookies = publicResult?.setCookies ?? [];

    // With a session, defer to the entitlements API exactly like the normal
    // paywall gate below. Without one, we cannot ask the entitlements API (it
    // requires a user id) — fall back to the manifest's own monetization flag
    // and block by default, since there is no `paywallExempt` yet.
    const plugin = installedPlugins.find((p) => p.id === publicRoutePluginId);
    const requiresPaywallCheck = publicSession
      ? true
      : plugin?.monetization != null && plugin.monetization.model !== 'free';
    if (requiresPaywallCheck) {
      const isPaywalled = publicSession
        ? (await fetchPaywalledPluginIds(publicSession.user.id)).has(publicRoutePluginId)
        : true;
      if (isPaywalled) {
        return applyCsp(buildPaywallRedirect(request, publicRoutePluginId));
      }
    }

    // Strip inbound trust headers unconditionally first — the `if
    // (publicSession)` block below only *conditionally* re-sets the
    // user-identity ones, so the anonymous case must not inherit whatever a
    // caller sent.
    const headers = strippedRequestHeaders(request);
    applySurfaceHeaders(headers, request.headers.get('user-agent'));
    headers.set('x-nonce', nonce);
    headers.set('content-security-policy', csp);
    headers.set('x-sovereign-plugin-id', publicRoutePluginId);
    if (publicSession) {
      const { user, expiresAt } = publicSession;
      headers.set('x-sovereign-user-id', user.id);
      headers.set('x-sovereign-user-email', user.email);
      headers.set('x-sovereign-user-role', user.role);
      const platformCaps = capabilitiesForRole(user.role, user.verificationLevel);
      const allCaps =
        ALL_GRANTED_PLUGIN_CAPS.length > 0
          ? [...platformCaps, ...ALL_GRANTED_PLUGIN_CAPS]
          : platformCaps;
      headers.set('x-sovereign-user-capabilities', JSON.stringify(allCaps));
      headers.set('x-sovereign-session-expires-at', String(expiresAt));
      headers.set('x-sovereign-verification-level', String(user.verificationLevel));
      if (user.name != null) headers.set('x-sovereign-user-name', user.name);
      if (user.image != null) headers.set('x-sovereign-user-image', user.image);
    }

    const response = NextResponse.next({ request: { headers } });
    for (const cookie of publicSetCookies) response.headers.append('set-cookie', cookie);
    return applyCsp(response);
  }

  // Manifest-declared public handoff receivers (RFC 0053): resolved before
  // the login-redirect gate, for the same reason as the public-page-route
  // branch above — an anonymous visitor consuming a `mode: 'public'` handoff
  // must be able to reach the receiver with no session. Unlike that branch,
  // there is no paywall check here — RFC 0053 doesn't gate handoffs on
  // monetization, and inventing one wasn't asked for. A session, if present,
  // is still forwarded (an authenticated visitor can legitimately land on a
  // `public: true` receiver too) — actual mode/actor enforcement (does this
  // token require a session, does the consuming user match the creating
  // user) happens in `sdk.handoffs.consume()`, not here; this branch only
  // decides whether the *platform's* session gate applies to the path.
  const handoffMatch = matchedPublicHandoffRoute(pathname, installedPlugins);
  if (handoffMatch) {
    const disabledIds = await fetchDisabledPluginIds();
    if (disabledIds.has(handoffMatch.pluginId)) {
      return applyCsp(new NextResponse('Not Found', { status: 404 }));
    }

    // No redirect to /login on failure — proceed anonymously, same as the
    // public-page-route branch above.
    const handoffResult = await verifySession(request);
    const handoffSession = handoffResult?.session ?? null;
    const handoffSetCookies = handoffResult?.setCookies ?? [];

    const headers = strippedRequestHeaders(request);
    applySurfaceHeaders(headers, request.headers.get('user-agent'));
    headers.set('x-nonce', nonce);
    headers.set('content-security-policy', csp);
    headers.set('x-sovereign-plugin-id', handoffMatch.pluginId);
    if (handoffSession) {
      const { user, expiresAt } = handoffSession;
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
    }

    const response = NextResponse.next({ request: { headers } });
    for (const cookie of handoffSetCookies) response.headers.append('set-cookie', cookie);
    return applyCsp(response);
  }

  // Both local cookie-cache verification and the auth-server fallback are
  // tried by `verifySession`; a null result here fails closed (unlike the
  // public-route and handoff branches above, which proceed anonymously) —
  // see `buildLoginRedirect`'s own doc comment in `@/src/middleware/response`
  // for why this is a rewrite (not a redirect) for `/` and an `installable`
  // plugin's own bare `routePrefix`, and a 303 (not 307) redirect otherwise.
  const gateResult = await verifySession(request);
  if (!gateResult) {
    return applyCsp(buildLoginRedirect(request, installedPlugins));
  }
  const { session, setCookies } = gateResult;
  const { user, expiresAt } = session;

  // Forward any Set-Cookie from the fallback so the signed cookie cache
  // (re)installs — subsequent requests then verify locally without a round-trip.
  const withCookies = (response: NextResponse): NextResponse =>
    withCookiesOnResponse(response, setCookies);

  // Attach a visible response header so clients (curl, browser devtools) can
  // confirm dev-mode is active — a guardrail against mistaking mock data for
  // real (RFC 0020 "visibly flagged" requirement).
  const withDevMode = (response: NextResponse): NextResponse =>
    withDevModeOnResponse(response, devModeActive);

  // Only consult plugin status when the path is actually under a plugin prefix.
  const underPlugin = installedPlugins.some((plugin) => underPrefix(pathname, plugin.routePrefix));
  if (underPlugin) {
    const [disabledIds, paywallIds, restrictedIds] = await Promise.all([
      fetchDisabledPluginIds(),
      fetchPaywalledPluginIds(user.id),
      fetchRestrictedPluginIds(user.id, user.role),
    ]);
    const decision = decidePluginRoute(
      pathname,
      installedPlugins,
      disabledIds,
      user.role,
      paywallIds,
      restrictedIds,
      currentSurface,
      user.verificationLevel,
    );
    if (decision === 'not-found') {
      if (pathname.startsWith('/api/')) {
        return applyCsp(withCookies(new NextResponse('Not Found', { status: 404 })));
      }
      // Rewrite (not redirect) so the URL bar is preserved — the target page
      // calls next/navigation's notFound(), which guarantees a true 404
      // status and the styled not-found.tsx boundary, unlike a bare
      // NextResponse(..., { status: 404 }) for a page navigation.
      return applyCsp(withCookies(NextResponse.rewrite(new URL('/__not-found', request.url))));
    }
    if (decision === 'forbidden') {
      if (pathname.startsWith('/api/')) {
        return applyCsp(withCookies(new NextResponse('Forbidden', { status: 403 })));
      }
      // Redirect (not rewrite) to a real page, same pattern as the paywall
      // gate below — simpler than Next's experimental forbidden()/
      // authInterrupts API, at the cost of the final page load reporting 200.
      return applyCsp(
        withCookies(NextResponse.redirect(new URL('/forbidden', request.url), { status: 303 })),
      );
    }
    if (decision === 'verification-required') {
      const pluginId = matchedPluginId(pathname, installedPlugins) ?? '';
      const requiredLevel =
        installedPlugins.find((p) => p.id === pluginId)?.minVerificationLevel ?? 0;
      // API routes get 403 with a machine-readable body (RFC 0035 §5.8) so a
      // plugin's own error boundary can distinguish this from a plain
      // capability 403; page routes redirect to a nudge page, same pattern
      // as the paywall/forbidden gates above.
      if (pathname.startsWith('/api/')) {
        return applyCsp(
          withCookies(
            NextResponse.json({ error: 'verification_required', requiredLevel }, { status: 403 }),
          ),
        );
      }
      return applyCsp(
        withCookies(
          NextResponse.redirect(
            new URL(
              `/verification-required/${encodeURIComponent(pluginId)}?level=${requiredLevel}`,
              request.url,
            ),
            { status: 303 },
          ),
        ),
      );
    }
    if (decision === 'paywall') {
      const pluginId = matchedPluginId(pathname, installedPlugins) ?? '';
      // API routes under a paywalled plugin return 402; page routes redirect to the paywall.
      if (pathname.startsWith('/api/')) {
        return applyCsp(withCookies(new NextResponse('Payment Required', { status: 402 })));
      }
      return applyCsp(withCookies(buildPaywallRedirect(request, pluginId)));
    }
    if (decision === 'unavailable-surface') {
      // RFC 0080 — presentation only, not a security boundary (see the hard
      // rule in docs/architecture-rules.md): a manifest-declared `surfaces`
      // list this request's (spoofable) surface isn't in. API routes get 404
      // — there is no sensible response body for "this works, just not from
      // here" — page routes redirect to a generic explanation, same pattern
      // as the paywall/forbidden gates above.
      if (pathname.startsWith('/api/')) {
        return applyCsp(withCookies(new NextResponse('Not Found', { status: 404 })));
      }
      return applyCsp(
        withCookies(
          NextResponse.redirect(new URL('/unavailable-surface', request.url), { status: 303 }),
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

  // `strippedRequestHeaders`, not a bare clone: `x-sovereign-user-name`,
  // `-user-image`, and `-plugin-id` below are only *conditionally* re-set
  // (no name/image on the session, or a path outside any plugin prefix), so
  // an unconditional clone would let a caller-forged value for one of those
  // three survive whenever its condition is false.
  const headers = strippedRequestHeaders(request);
  applySurfaceHeaders(headers, request.headers.get('user-agent'));
  // Pass the nonce to the rendered request: Next reads it from the CSP request
  // header for its scripts; the layout reads `x-nonce` for the theme script.
  headers.set('x-nonce', nonce);
  headers.set('content-security-policy', csp);
  headers.set('x-sovereign-user-id', user.id);
  headers.set('x-sovereign-user-email', user.email);
  headers.set('x-sovereign-user-role', user.role);
  const platformCaps = capabilitiesForRole(user.role, user.verificationLevel);
  const allCaps =
    ALL_GRANTED_PLUGIN_CAPS.length > 0
      ? [...platformCaps, ...ALL_GRANTED_PLUGIN_CAPS]
      : platformCaps;
  headers.set('x-sovereign-user-capabilities', JSON.stringify(allCaps));
  headers.set('x-sovereign-session-expires-at', String(expiresAt));
  headers.set('x-sovereign-verification-level', String(user.verificationLevel));
  if (user.name != null) headers.set('x-sovereign-user-name', user.name);
  if (user.image != null) headers.set('x-sovereign-user-image', user.image);

  // Inject the current plugin ID so sdk.data.query() knows the consumer (RFC 0002).
  const currentPlugin = installedPlugins.find((plugin) =>
    underPrefix(pathname, plugin.routePrefix),
  );
  if (currentPlugin) headers.set('x-sovereign-plugin-id', currentPlugin.id);

  // Flag a per-plugin mobile chrome override (`shellConfig.mobileHeader` /
  // `shellConfig.mobileFooter`, RFC 0075) so `(platform)/layout.tsx` can skip
  // rendering the mobile header/footer for this route. Absent header = shown
  // (current behavior); '0' = hidden. Desktop sidebar is never affected.
  if (currentPlugin?.shellConfig?.mobileHeader === false) {
    headers.set('x-sovereign-mobile-header', '0');
  }
  if (currentPlugin?.shellConfig?.mobileFooter === false) {
    headers.set('x-sovereign-mobile-footer', '0');
  }

  // Flag a manifest-declared offline-enabled plugin's bare routePrefix (RFC
  // 0078) so `(platform)/layout.tsx` can render a user-neutral shell for it —
  // the platform shell chrome (name, avatar, personalized sidebar order) is
  // otherwise per-user SSR, and a service-worker-precached document for an
  // offline route bakes in whatever shell HTML was rendered alongside it.
  // Without this flag, a plugin's own offline route could correctly render
  // nothing per-user while still shipping inside a per-user-personalized
  // shell document.
  //
  // Deliberately an **exact** match, not `underPrefix()`'s broader "this
  // path or anything under it" — RFC 0078's single-entry-point model only
  // guarantees neutrality (and CI-scans) a plugin's bare routePrefix page
  // itself; a nested route like `/shopper/lists/abc` is an ordinary per-user
  // SSR page with no such guarantee. Broadly matching every sub-path here
  // would make the service worker precache-and-replay a per-user page as if
  // it were a safe neutral shell — exactly the leak this mechanism exists to
  // prevent.
  //
  // `/` IS included here (via `getOfflineRoutePrefixes()`) whenever Launcher
  // — the platform root by default — is itself offline-first, since this
  // rewrites `/` to Launcher's own route below and the two must get
  // identical neutral-shell treatment. This used to be argued unnecessary:
  // `/` was left to next-pwa's own default `NetworkFirst` "start-url" cache
  // on the premise that its risk was "no narrower than what's already
  // tolerated" for the per-user `pages` cache. That premise was wrong on two
  // counts, found via live testing rather than reasoning about it in the
  // abstract: "start-url" had *no* per-user cache key or session check at
  // all (weaker than `pages`, not equal to it), and `pages`' own
  // assertion-based session check was never actually wired up client-side,
  // so neither cache was ever safe to replay. See
  // `runtime/next.config.ts`'s comment above `runtimeCaching` for the full
  // story and the fix (`pages` no longer caches personalized content at
  // all; `/` now shares Launcher's already-neutral, already-tested cache
  // instead of getting its own unpartitioned one).
  if (getOfflineRoutePrefixes(installedPlugins).includes(pathname)) {
    headers.set('x-sovereign-offline-route', '1');
  }

  // Forward the dev-mode flag to Node runtime handlers (RFC 0020). The marker
  // header is safe to inject here — it was validated above; stripping the
  // incoming secret header prevents it from reaching plugin code.
  headers.delete(DEV_MODE_INCOMING_HEADER);
  if (devModeActive) headers.set(DEV_MODE_FORWARDED_HEADER, '1');

  // Serve the configured root plugin in place at `/` (PLT-14) — the URL stays
  // `/` while the plugin's route renders, and the plugin is still reachable at
  // its own routePrefix. The Node-runtime route already falls back to the
  // Launcher when the configured root is inaccessible to this user (disabled
  // or RFC 0065 policy-denied). Falls through to the placeholder home page
  // (which renders its own "No apps available" state) when neither resolves.
  // `(platform)/page.tsx` keeps a redirect as a belt-and-suspenders fallback
  // for the rare case this fetch fails.
  if (pathname === '/') {
    const rootPrefix = await fetchRootPluginPrefix(user.id, user.role);
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
  // offline fallback, the PWA assets (manifest, service worker, Workbox/fallback/
  // custom-worker bundles, icons — must load without a session), and Next static
  // assets.
  //
  // `plugin-icons/` (a per-plugin `icon.svg` plus, for `installable: true`
  // plugins, generated/author-supplied PNGs, RFC 0081) needs the same
  // exemption as `icons/` and for the same reason: an `installable` plugin's
  // own manifest (`/api/manifest/[pluginId]`) is itself session-exempt so a
  // browser can evaluate installability before login, and its `icons[].src`
  // entries all point here — a session-gated icon fetch 303-redirects
  // instead of returning an image, and browsers generally don't follow a
  // redirect when fetching a manifest icon for an installability check, so
  // the *whole install prompt* can silently fail to appear with no other
  // symptom. Confirmed live: `curl` against a running instance returned a
  // 303 to `/login` for a generated plugin icon before this was added.
  //
  // `api/instance` is deliberately NOT in this list, unlike the other
  // "must load pre-session" entries: it has privileged POST/DELETE endpoints
  // (`/api/instance/logo`, `/api/instance/favicon`) alongside their public
  // GET, and matcher exclusion is all-or-nothing per path — it would also
  // exempt those from the session gate, trust-header stripping, and CSP
  // (this was a real, shipped bug — see PUBLIC_INSTANCE_GET_PATHS above and
  // the fix that removed this exclusion). The path stays inside the matcher;
  // GET is served early as a public exception inside the middleware body,
  // POST/DELETE fall through to the normal authenticated flow.
  //
  // Every service-worker artifact must be listed here, not just `sw.js`:
  // `sw.js` pulls its siblings in with `importScripts()`, and a redirected
  // `importScripts()` is a spec-mandated hard failure that aborts the *whole*
  // SW install — so one un-allowlisted chunk means a logged-out visitor gets
  // no service worker at all (no precached login page, no offline fallback),
  // not merely a missing feature. The current set is `sw.js`, the Workbox
  // runtime (`workbox-<hash>.js`), the document fallback
  // (`fallback-<hash>.js`), and the custom worker chunk built from
  // `runtime/worker/index.ts` (`worker-<hash>.js` — @ducanh2912/next-pwa's
  // `customWorkerSrc` output, the Web Push handler from RFC 0016). If a build
  // starts emitting another `public/` service-worker chunk, add its prefix
  // here in the same change.
  matcher: [
    // Exclude: auth pages, privacy/tos pages, admin API (self-authenticated),
    // public liveness probe, dynamic manifest (browsers fetch it before login
    // for PWA install), offline fallback, PWA assets, plugin icons (RFC 0081,
    // see the comment above this array), Next.js static assets, and the two
    // signed-URL download routes — storage (RFC 0044) and backup archives
    // (RFC 0084) — both self-authenticated by an HMAC-signed token, not a
    // session; each must work for a plain `<img src>`/direct fetch with no
    // session cookie.
    //
    // `api/backup-jobs` has exactly one route underneath it
    // (`[jobId]/download/[token]/route.ts`), unlike `api/instance` above — no
    // other privileged endpoint shares this prefix, so excluding the whole
    // prefix carries none of that entry's risk. The download route's own doc
    // comment already claimed this exemption as "by design" before it was
    // actually added here: confirmed live via `curl` that a request bearing a
    // genuinely valid signed token still 303-redirected to `/login` (the
    // route's own token check never ran) until this line was added — a real,
    // shipped gap from epic task 8.16, affecting both the Account (8.18) and
    // Console (8.17) download buttons.
    '/((?!login|register|forgot-password|reset-password|privacy|tos|offline|api/auth|api/admin|api/health|api/manifest|api/storage|api/backup-jobs|manifest.json|sw.js|workbox-|worker-|fallback-|icons/|plugin-icons/|_next/static|_next/image|favicon.ico).*)',
  ],
};
