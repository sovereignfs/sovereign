# Research 0014 — Serving plugins on subdomains

**Status:** Exploratory\
**Date:** August 2026\
**Author:** Claude Code\
**Scope:** `runtime/middleware.ts`, `packages/manifest`, `packages/sdk`, `packages/ui`, `plugins/console`, `apps/auth` config, `docs/self-hosting.md`, Docker/reverse-proxy docs\
**Related:** research [0006](0006-standalone-plugin-apps.md) (standalone plugin apps); RFC [0080](../rfcs/0080-plugin-surface-model.md) (surfaces), [0081](../rfcs/0081-per-plugin-installable-pwa.md) (installable per-plugin PWA), [0082](../rfcs/0082-focused-plugin-app-shell.md) (focus route lock), [0042](../rfcs/0042-public-plugin-routes.md) (publicRoutes), [0089](../rfcs/0089-fully-public-plugins.md) (fully public plugins)

---

## Question

Every plugin today is served under a first-level path namespace on the
instance origin — `example.com/tasks`, `example.com/shopper`. Can a plugin
opt in (via its manifest, activated per-plugin in Console) to being served on
its own subdomain instead — `tasks.example.com` — and what would that cost?

This is the natural continuation of the standalone-plugin-app direction
(research 0006 → RFCs 0080–0083): a plugin that is installable as its own
PWA and focusable as its own app shell is one step away from having its own
origin.

## Findings

### Everything funnels through one middleware, and its decisions are path-pure

The runtime is a single Next.js app; every gated request passes through
`runtime/middleware.ts`. All routing/authorization decisions downstream of it
are pure functions of `pathname` plus registry data — session gate, disabled/
paywall/access-policy/adminOnly gates (`decidePluginRoute`,
`runtime/src/route-guard.ts:55`), public-route matching, trust-header
injection, and the `x-sovereign-plugin-id` header. The prefix match itself is
one function, `underPrefix()` (`runtime/src/route-guard.ts:27`). Nothing
reads the request host to make a decision today.

This is the enabling property: if an early middleware step normalizes a
subdomain request's path back to its canonical `/<routePrefix>/...` form,
every existing decision runs unchanged.

### `routePrefix` is the single source of truth for a plugin's URL identity

`scripts/generate-registry.ts` composes each plugin's `app/` into the runtime
route tree at its manifest `routePrefix` — "the route segment is the manifest
`routePrefix` (not the source directory name), so `routePrefix` is the single
source of truth for a plugin's URL" (`scripts/generate-registry.ts:40`). A
subdomain slug should therefore derive from `routePrefix` (first segment),
not introduce a second name.

### Cross-subdomain auth already exists, unused by the runtime

`apps/auth` already supports domain-wide cookies:
`AUTH_COOKIE_DOMAIN=.example.com` (`apps/auth/src/env.ts:114`,
`.env.example:37`) enables better-auth's
`crossSubDomainCookies` (`apps/auth/src/auth.ts:37-39`), and
`AUTH_TRUSTED_ORIGINS` (`apps/auth/src/env.ts:110`) covers the CSRF origin
check (better-auth accepts wildcard entries like `https://*.example.com`).
This covers both the session cookie and the signed `session_data` cookie
cache the middleware verifies locally (`verifyFromCookieCache`,
`runtime/middleware.ts:199`) — a subdomain request would carry the same
cookies and verify identically.

### Auth pages are matcher-excluded, so they already render on any host

`/login`, `/register`, etc. are excluded from the middleware matcher
(`runtime/middleware.ts:745`), so an unauthenticated hit on
`tasks.example.com/anything` can 303 to `tasks.example.com/login`, which
renders as-is. With domain-wide cookies, the existing `returnUrl` flow
returns the user into the subdomain after login.

### CSP is origin-relative

`buildContentSecurityPolicy` (`runtime/src/security.ts`) uses `'self'` for
every fetch directive. After a host-based rewrite, all assets (`_next/*`),
API calls, and workers are same-origin _on the subdomain_, so the policy
holds unchanged. The only cross-origin allowance is `form-action` for the
logout POST to the auth origin, already parameterized
(`authFormActionOrigin`, `runtime/middleware.ts:98`).

### The runtime does not know its own public origin

There is no "runtime public URL" env var — the runtime never needs its
browser-facing origin today (self-fetches use `SELF_URL` = localhost,
`runtime/middleware.ts:91`; redirects use `request.url`). Subdomain serving
introduces that requirement for the first time: shell chrome rendered on a
plugin subdomain must link _other_ plugins back to the root origin (or their
own subdomains), which relative hrefs cannot express.

### Plugin code hardcodes its own prefix — the main migration cost

Plugin pages author absolute paths embedding their own `routePrefix`:
`<Link href="/tasks/lists/1">`, `fetch('/tasks/api/...')`. On
`tasks.example.com`, those resolve against the subdomain origin and — after
the naive host rewrite prepends the prefix — become `/tasks/tasks/lists/1`
internally. There is no basePath-aware URL helper in `@sovereignfs/sdk` or
`@sovereignfs/ui` today. This, not routing or auth, is the genuinely hard
part.

### Per-origin browser machinery mostly helps

Service workers, caches, and storage are per-origin. A subdomain plugin gets
its own SW registration and cache partition for free — a cleaner fit for the
per-plugin installable PWA model (RFC 0081) than the shared-origin scoping it
uses today, and it narrows the blast radius the `pages`-cache incidents (see
`docs/architecture-rules.md`, "cached authenticated document") came from. The
per-plugin manifest route (`/api/manifest/<id>`) would need to emit the
subdomain origin in `start_url`/`scope` when the toggle is on.

### Security posture: subdomains are a step toward isolation, not away from it

Sharing the session cookie via `domain=.example.com` sounds like a widening,
but today every plugin already shares one origin — path-based isolation is
zero. Per-plugin origins add real isolation (storage, SW, CSP) with the
parent-domain session cookie as the one deliberate shared surface. The
`SOVEREIGN_TRUST_HEADERS` stripping model (`runtime/middleware.ts:43`)
carries over unchanged because every request still transits the same
middleware. The new attack surface is the host header itself — see open
questions.

## Options considered

### A. Host-based rewrite in the runtime middleware (recommended)

The standard Next.js multi-tenant pattern. First step in `middleware()`:
resolve the effective host (via `x-forwarded-host`, validated); if it is
`<slug>.<SOVEREIGN_ROOT_DOMAIN>` for a subdomain-enabled installed plugin,
rewrite the internal pathname from `/foo` to `/<routePrefix>/foo` and mark
the request as subdomain-scoped. All existing gates then run on the
normalized path. On a plugin subdomain, any path outside that plugin's
prefix (and the shared exclusions: `/login`, `_next/*`, PWA assets) 404s —
a subdomain must not be a second door to the whole instance. Optionally, a
canonical 308 from `example.com/<prefix>/*` to the subdomain when active.

- **For:** one deployment, one build, one middleware; every plugin gate,
  header, and CSP mechanism reused verbatim; no per-plugin infrastructure.
- **Against:** the prefix-hardcoding problem lands here (mitigations below);
  the middleware takes on host-header parsing it never had.

### B. Separate deployment per subdomain plugin

Run another runtime instance (or a filtered build) per subdomain.

- **Against:** collapses immediately — plugins are composed into one route
  tree at build time (`scripts/generate-registry.ts`), share one DB, one
  registry, one scheduler. Per-plugin deployments mean per-plugin builds,
  env, upgrades, and resource cost, multiplying the operator burden this
  project deliberately minimizes (single-tenant, one Compose stack).
  Rejected.

### C. Reverse-proxy path rewriting (proxy maps `tasks.example.com/*` → `example.com/tasks/*`)

Do the mapping in Caddy/nginx config instead of the middleware.

- **For:** zero runtime code for the happy path.
- **Against:** the platform can't enforce it per-plugin from the manifest or
  Console — enforcement moves into operator-authored proxy config, exactly
  what the request rules out ("enforced by plugin manifest/console"). The
  runtime would still need most of Option A's work anyway (origin-aware
  shell links, redirects that preserve the subdomain, PWA scope, canonical
  URLs), because rendered HTML and `Location` headers are the runtime's
  output, not the proxy's. Rejected as the mechanism; the proxy still
  matters as the TLS/wildcard-routing layer _in front of_ Option A.

### D. Not now

Defer until the standalone-app track (RFCs 0080–0083, workstream 0003)
ships further. Viable — nothing is blocked without subdomains — but the
per-plugin installable PWA (RFC 0081) is already straining against shared-
origin scoping, and the migration cost (URL-helper adoption in plugin code)
only grows as the plugin ecosystem does.

## Recommendation

Option A, phased. Sketch (a recommendation, not a committed design):

1. **Config surface.** `SOVEREIGN_ROOT_DOMAIN` (operator, with wildcard DNS
   - wildcard TLS at the proxy, documented in `docs/self-hosting.md`); a new
     manifest field, e.g. `subdomain: true` (slug derived from `routePrefix`'s
     first segment — no second name); a Console per-plugin activation toggle
     layered on top, same declare-then-activate split as enable/disable.
     Constraints to validate at manifest time: single-segment `routePrefix`,
     probably incompatible with `shell: "overlay"` (an interception route has
     no meaning on a foreign origin).
2. **Host normalization in middleware.** Validated host → prefix rewrite;
   subdomain-scoped 404 for foreign paths; canonical redirects both ways.
   A tolerance branch — on a plugin's own subdomain, 308
   `/<routePrefix>/*` → `/*` — makes existing plugins with hardcoded
   prefixed links work unmodified, at one redirect hop per legacy link.
3. **Origin-aware link generation.** The first-time introduction of a
   runtime public-origin concept: shell chrome (sidebar, drawer, Launcher
   tiles, post-login redirect) emits absolute URLs across origins; a
   prefix-aware href/fetch helper lands in `@sovereignfs/sdk`/`@sovereignfs/ui`
   (DS-first rule) so plugins migrate off hardcoded prefixes over time.
4. **PWA/manifest interplay.** `/api/manifest/<id>` emits subdomain
   `start_url`/`scope` when active; verify SW registration, precache, and
   the offline rules per origin (`docs/architecture-rules.md`).

Complexity: the core (1–2) is modest — days, low architectural risk. The
shippable whole (3–4 plus Console UI, proxy/Compose docs, e2e) is a
medium workstream, realistically 3–4 legs.

## Open questions

- **Host-header trust.** The middleware would make routing decisions from
  `x-forwarded-host` for the first time. Needs a strict validation rule
  (exact `SOVEREIGN_ROOT_DOMAIN` suffix + known slug set, never echoed into
  redirects unvalidated) and a documented proxy contract. What happens when
  `SOVEREIGN_ROOT_DOMAIN` is unset but a subdomain-enabled plugin exists —
  fail loud at boot, or silently inert?
- **Legacy-link tolerance vs. discipline.** Ship the 308 tolerance branch
  permanently, or as a deprecation bridge until the SDK URL helper is the
  documented rule? RSC prefetches through a 308 add a hop per navigation.
- **Which shell modes qualify.** `minimal` and `default` seem workable;
  `overlay` almost certainly not. Does `default`'s cross-plugin sidebar even
  make sense on a foreign origin, or should subdomain serving imply the
  focused chrome from RFC 0082?
- **Auth origin on subdomains.** Login renders on the subdomain via matcher
  exclusion, but email verification / password-reset links are minted with
  the auth server's notion of its public URL — do they return the user to
  the subdomain or the root? Needs a trace through `apps/auth`.
- **Dev DX.** `tasks.localhost:3000` resolves in modern browsers without DNS
  setup — verify the full flow (cookies on `.localhost` are a known browser
  quirk: `domain=.localhost` is rejected by some engines).
- **Rate limiting and the focus lock.** `checkGlobalRateLimit` keys per IP
  (host-agnostic — fine); `decideFocusRoute` (RFC 0082) compares paths —
  confirm it behaves on normalized paths for a focused native shell pointed
  at a subdomain.

## Next steps

Graduates to one RFC covering the manifest field, host-normalization
middleware, and Console activation (phases 1–2 above), with the origin-aware
URL helper (phase 3) either in the same RFC or split into a companion
SDK/UI RFC — the helper is a public-contract change for plugin developers
and needs its own migration note per NFR-04. Phase 4 rides whichever RFC
touches RFC 0081's manifest route. No prototype needed before the RFC; the
one spike worth doing first is the auth-origin trace and `.localhost` cookie
check above, which could change the recommended dev-DX story.
