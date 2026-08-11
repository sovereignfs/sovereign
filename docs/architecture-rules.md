---
docSection: contributors
docType: policy
audiences:
  - contributor
---

# Hard Architectural Rules

Full reference for load-bearing constraints enforced by ESLint, CI, or runtime behaviour. CLAUDE.md carries a critical-violations summary; this document has the full detail.

---

- **SDK is the only plugin↔platform contract.** Plugins MUST NOT import from
  `runtime/src`. ESLint enforces this (established in Task 0.3.3, verified in
  Task 0.3.8). Plugins use `packages/sdk` only.
- **Reusable UI/UX capability ships from the design system, not from plugins.**
  Interaction hooks, overlay surfaces, secondary headers, motion, and controls
  belong in `packages/ui` (or the runtime shell when they are shell chrome);
  plugins — including first-party ones like Sovereign Tasks — only consume
  them. A fix discovered inside a plugin is designed as a `packages/ui`
  addition plus a thin adoption change in the plugin, never as a plugin-local
  implementation "to be promoted later". React-coupled UI utilities live in
  `@sovereignfs/ui`, not `@sovereignfs/sdk` (the SDK stays a framework-lean
  capability contract). See "Design principles" in `docs/design-system.md`.
- **`@sovereignfs/sdk` is a types-first contract with zero runtime dependencies**
  (RFC 0023, Task 0.5.21). `packages/sdk` does not import `@sovereignfs/db` or
  `@sovereignfs/mailer`. Implementations are registered by the runtime at startup
  via `provideHost()` in `runtime/instrumentation.ts` → `runtime/src/sdk-host.ts`.
  Never add `@sovereignfs/db`/`@sovereignfs/mailer` back as dependencies of the
  SDK — the `noExternal`-bundle plan is explicitly dropped. Platform internals
  belong in `runtime/src/sdk-host.ts`, not in `packages/sdk`.
- **Every package/app extends `packages/tsconfig`** (`base`/`nextjs`/`library`),
  established in Task 0.3.2. Easy to forget on new packages.
- **Manifests are validated at build time.** Invalid manifest = failed build.
- **Plugin tables are slug-prefixed** (`tasks_lists`, `splitify_groups`).
  Single shared schema, no per-plugin DBs in v1.
- **`tenant_id` everywhere** on user-scoped tables from day one (future
  multi-tenancy), even though no multi-tenant logic exists in v1.
- **DB is dialect-agnostic** (Drizzle): SQLite default, Postgres via env only.
  No SQLite-specific SQL in app code.
- **The platform data layer is async** (Task 0.5.3). Postgres (node-postgres)
  has no synchronous query, so `getPlatformDb()` and every `packages/db` platform
  helper (`getPlatformSetting`, `setAccountPrefs`, …) and `sdk.platform.getConfig()`
  return promises — always `await` them. (On SQLite the underlying better-sqlite3
  calls still run synchronously; the async signature is the dialect-agnostic
  contract.) Never reintroduce a synchronous platform-DB read.
- **Relative SQLite paths resolve against the workspace root** (nearest
  ancestor with `pnpm-workspace.yaml`), not the process cwd — all SQLite files
  land in the single root-level `data/` directory regardless of which app
  opens them. Implemented in both `packages/db` and `apps/auth/src/db.ts`
  (duplicated deliberately; auth does not depend on `packages/db`).
- **No secrets with defaults.** `AUTH_SECRET` / `SOVEREIGN_AUTH_SECRET` etc.
  must throw on startup if unset.
- **Plugins compose at their `routePrefix` under a `shell`-selected route
  group.** The generate script injects `plugins/[id]/app/` into
  `runtime/app/(platform)/(plugins)/<routePrefix>/` for `shell: default` plugins
  (they inherit the platform sidebar via App Router layout nesting — no
  rewrites). The route segment is the manifest `routePrefix`, not the source
  directory name, so `routePrefix` is the single source of truth for a plugin's
  URL; the `(plugins)` route group is URL-transparent, so `routePrefix: /console`
  serves at `/console`. The composed segments are **copies in dev, symlinks in
  production** (`NODE_ENV`) — dev must copy because Next's dev route watcher
  does not follow symlinked route dirs (a symlinked plugin 404s under `next
dev`); production uses a real symlink instead so a plugin's imports resolve
  through _its own_ `node_modules` rather than requiring every dependency it
  uses to also be declared in `runtime/package.json`. Composed segments are
  gitignored by a `.gitignore` inside each route group — never edit or commit
  them. Source of truth is always `plugins/[id]/app/`. Because production's
  symlink isn't followed by TypeScript's own module resolution either,
  `runtime/tsconfig.json` excludes composed plugin directories (`(plugins)`
  and `(minimal)`) from its type scope — each plugin already typechecks
  itself in its own repo/CI.
  **`shell: overlay` (RFC 0001, Task 0.5.10) composes TWICE:** the full-page
  fallback under `(plugins)/<routePrefix>/` (same as default) **and** an
  interception copy under `(plugins)/@modal/(.)<routePrefix>/`. The `@modal`
  parallel-route slot lives **inside** `(plugins)` (hosted by a committed
  `(plugins)/layout.tsx` that renders `{children}{modal}`) so the interceptor and
  the fallback are folder-siblings in the same route group — interception across
  the group boundary from `(platform)` fails at runtime with `initialTree is not
iterable`. The slot's hand-written `@modal/default.tsx` (empty fallback) and
  `@modal/layout.tsx` (the `Dialog` chrome; renders the Dialog only when
  `useSelectedLayoutSegment()` is an intercepted segment, never null, so no empty
  scrim on ordinary pages) are **committed**; the `@modal/(.)*` copies are
  generated and gitignored (the `(plugins)/.gitignore` keeps `layout.tsx` +
  `@modal/{default,layout}.tsx`, ignores the rest). Overlay `routePrefix` must be
  a single segment, and overlay plugins are ineligible as the root plugin
  (CON-11) — `validateRootPlugin` rejects `shell: 'overlay'`.
  **Intra-overlay navigation MUST use `replace`, not push.** The dialog is
  dismissed with `router.back()`, which unwinds exactly one history entry; if a
  plugin's in-dialog tab/section links push (the `<Link>` default), each one
  stacks on history and a single dismiss only steps back one tab instead of
  closing — stale dialog states pile up behind it. Console and Account tab links
  use `<Link replace>`; this is documented as a convention for third-party
  overlay plugins in `docs/plugin-development.md`. Never reintroduce push-based
  intra-overlay navigation. **Dialog size is plugin-declared** via the optional
  manifest `shellConfig.overlaySize` (`sm` | `md` | `lg`, default `lg`); the
  `@modal/layout.tsx` resolves it from the selected interception segment
  (`overlaySizeForSegment` in `runtime/src/overlay.ts`). The `@sovereignfs/ui`
  `Dialog` renders **fixed-size boxes** (each size sets width AND height, content
  scrolls inside) so the dialog never resizes as its content changes between
  tabs — `lg` fills the viewport minus a fixed margin, `md`/`sm` are fixed and
  centred; on mobile every size is a full-screen sheet. The `Dialog` scrim is
  full-viewport by default but offsets its left edge by the
  `--sv-dialog-inset-left` CSS var (default `0`); the shell sets it to the
  sidebar width (`--sv-shell-sidebar-width`, reset to `0` on mobile) on `.shell`
  so overlay dialogs start at the sidebar's right edge and leave the rail
  visible/usable — never hardcode the sidebar width into the `Dialog`.
- **`shell: minimal` (RFC 0014, Task 0.5.25) composes into `runtime/app/(minimal)/`** — a
  chrome-free, full-bleed route group (no sidebar, header, or footer). The committed
  `(minimal)/layout.tsx` applies `100dvh` and safe-area insets; generated composed routes
  land alongside it (gitignored by `(minimal)/.gitignore` which keeps `layout.tsx` and
  `minimal.module.css`). The session gate still applies — the middleware enforces auth
  before the plugin renders. Multi-segment `routePrefix` is allowed (unlike overlay, which
  must be single-segment). **`minimal` plugins ARE eligible as the root plugin** (kiosk use
  case — `validateRootPlugin` accepts `shell: 'minimal'`); when used as root there is no
  platform nav, so the plugin must provide its own navigation back to `/launcher` or other
  routes if needed. Never reintroduce `process.exit(1)` for the minimal case in
  `generate-registry.ts` — it is wired.
- **`shell: default` plugins can independently hide the mobile header and/or
  footer via `shellConfig.mobileHeader`/`shellConfig.mobileFooter` (RFC 0075,
  both boolean, default `true`) — this is a per-request runtime branch inside
  `(platform)/layout.tsx`, not build-time route-group composition** (unlike
  `overlay`/`minimal` above). It has to be: the desktop sidebar must render
  identically regardless of the toggle, and there's no route-group split that
  varies just the two mobile-only elements without duplicating the sidebar
  markup across every combination. `getMobileChromeConfig()`
  (`runtime/src/registry.ts`) resolves the per-plugin override; the middleware
  sets `x-sovereign-mobile-header`/`x-sovereign-mobile-footer` (mirroring the
  offline-route flag below) only when a value deviates from the default;
  `(platform)/layout.tsx` omits the `<header data-mobile-header>` block and/or
  `<MobileNav>` **server-side** (not CSS-hidden) based on those headers.
  **Load-bearing details, easy to regress:**
  (1) `shell.module.css`'s mobile grid (`grid-template-rows: auto 1fr auto`)
  relied on implicit DOM-order placement before this — `.mobileHeader`,
  `.content`, and `MobileNav.module.css`'s `.footer` now each declare an
  explicit `grid-row` so omitting a sibling can't renumber the others (a
  stretched footer over the content row is the failure mode if this is ever
  removed). (2) `--sv-shell-header-height`/`--sv-shell-footer-height` collapse
  to `0px` via `.shell[data-mobile-header-hidden]`/`[data-mobile-footer-hidden]`
  attribute selectors (higher specificity than the base `.shell` rule, same
  element) — every downstream consumer (`.content`'s footer-clearance padding,
  `--sv-dialog-inset-top`, `MobileSearch`'s top/bottom clearance,
  `NotificationBell`'s popover offset) inherits the fix through the CSS
  custom-property cascade; don't re-derive per-consumer overrides. (3)
  `ClientShell`'s offline-route refresh-diffing (see below) is generalized —
  not duplicated — to also force `router.refresh()` when a client-side
  navigation crosses a mobile-chrome visibility boundary, using the shared
  `mobileHeaderVisible`/`mobileFooterVisible` helpers in
  `runtime/src/mobile-chrome.ts`; without it a soft nav into/out of a
  reduced-chrome plugin would keep rendering the previous route's header/
  footer state. That same effect also directly sets/clears the
  `--sv-dialog-inset-top` inline style on transition, since
  `syncViewport()`'s `[data-mobile-header]` measurement only runs on mount and
  specific resize/visibility events — never on a plain pathname change — so it
  can't be relied on to correct a stale inline value across navigations.
- **`adminOnly` routes are gated in the runtime middleware.** A request under an
  admin-only plugin's `routePrefix` from a non-`platform:admin` user returns 403
  (SRS §3.4, PLT-03).
- **Invite-only is dual-written, and the auth-server copy is authoritative.**
  The Console toggle (CON-10) writes `invite_only` to both the platform DB
  (`platform_settings`, read by `sdk.platform.getConfig()`) and the auth
  server's own `auth_settings` table (via the runtime PATCH proxying to
  `apps/auth`). Registration enforcement reads only the auth copy — the auth
  server owns identity and does not read the platform DB. A stored value
  overrides the `AUTH_INVITE_ONLY` env default; absent a stored value, the env
  default applies. Never make registration read the platform DB instead.
- **`root_plugin_id` lives in `platform_settings`, seeded on first run** to
  `fs.sovereign.launcher` (PLT-14/PLT-15). The eligible set is installed +
  enabled + non-`adminOnly` (validated in `runtime/src/root-plugin.ts`). `/`
  **serves the root plugin in place** — the middleware rewrites `/` to the
  configured plugin's `routePrefix` (URL stays `/`; the plugin remains reachable
  at its own prefix too), resolving the prefix at request time via
  `GET /api/admin/root-plugin` (Edge middleware can't read the DB, same fetch
  pattern as `/api/admin/plugins/disabled`). `(platform)/page.tsx` keeps a
  `redirect()` as a fallback for when that resolution fetch fails. Platform
  tables (`tenants`, `plugin_status`, `platform_settings`) are bootstrapped with
  **dialect-aware** CREATE-TABLE-IF-NOT-EXISTS + seed rows in `packages/db`'s
  `getPlatformDb()` (`packages/db/src/bootstrap.ts`, `INTEGER`/`BIGINT` +
  `INTEGER`/`BOOLEAN` per dialect); the DDL must stay in sync with the Drizzle
  schemas (`schema/sqlite` + `schema/postgres`, guarded by a parity test).
  drizzle-kit migrations replace this later (0.5.05+).
- **A row-less plugin (no `plugin_status` row) defaults to disabled and
  access-restricted — except automatically in local dev.** `getDisabledPluginIds`
  and `canUserOpenPlugin`/`getRestrictedPluginIds` (`runtime/src/plugin-status.ts`,
  `runtime/src/plugin-access-server.ts`) both short-circuit to "fully visible,
  open to everyone" whenever `bypassPluginVisibilityInDev()` is true, which is
  an equality check on `NODE_ENV === 'development'` (never `!== 'production'`,
  since Vitest sets `NODE_ENV=test` and must keep exercising the real gating
  logic). This exists because a freshly scaffolded plugin used to stay hidden
  from its own author until an admin visited Console > Plugins — a DX
  regression, not intended production behavior. Never applies outside
  `next dev`; a production or staging deployment still defaults new plugins
  closed.
- **Chrome plugins** (`fs.sovereign.launcher`, `fs.sovereign.account`,
  `fs.sovereign.console`) are reached through the sidebar chrome (home `/`,
  Console ⚙, Account avatar), never via the Launcher grid or the sidebar's
  middle plugin-icon section (LCH-04, PLT-12). The canonical ID set is
  `CHROME_PLUGIN_IDS` in `runtime/src/launcher-plugins.ts` — reuse it, never
  re-hardcode the list.
- **Plugins that need the installed-plugin list fetch the gated `/api/plugins`**
  (forwarding the session cookie), not import the registry — the SDK boundary
  rule forbids plugins importing `runtime/src` or internal packages. The route
  is session-gated (middleware injects `x-sovereign-user-role`) and role-filters
  via `selectLauncherPlugins`; `sdk.db` replaces this fetch in Task 0.5.5.
- **The `/api/*` namespace is split: reserved runtime segments vs. the public
  provider namespace (PLT-16).** The runtime serves its own first-level segments
  — `account`, `admin`, `auth`, `health`, `instance`, `manifest`, `plugins`
  (`runtime/app/api/*`) — listed in
  `RESERVED_API_SEGMENTS` (`runtime/src/api-namespace.ts`); a parity test asserts
  the set matches the on-disk dirs, so a new runtime API route can't silently
  become delegatable. Every other `/api/<slug>/*` is the **public** namespace:
  the middleware handles it **before** the session gate (it is unauthenticated —
  the provider owns auth, e.g. API keys), rewriting to the single registered
  provider's serve route `<routePrefix>/serve/<slug>/<path>`, or 404 when no
  enabled provider is installed. The provider is the one plugin with
  `apiProvider: true` in its manifest; **exactly one per instance** — the
  generate script fails the build on a second one (`findApiProvider` in
  `@sovereignfs/manifest` is the shared resolver). Never add a new
  `runtime/app/api/*` segment without adding it to `RESERVED_API_SEGMENTS`.
- **Server-to-server calls to better-auth (`/api/auth/*`) must send an `Origin`
  header** equal to the auth base URL (`SOVEREIGN_AUTH_URL`) — better-auth
  enforces a CSRF origin check and rejects originless POSTs with
  `MISSING_OR_NULL_ORIGIN` (403). Applies to `update-user` (Account profile)
  and `change-password`. The session cookie is host-scoped, so forwarding it
  across the runtime↔auth origins works.
- **The middleware's unauthenticated `/login` redirect MUST be `303`, not the
  `NextResponse.redirect` default of `307`.** 307 preserves the request method,
  so an unauthenticated **POST** to a gated route (the logout form once the
  session has lapsed, any plugin form submit, a server action) redirects as
  `POST /login` — and `runtime/app/login/route.ts` only handles `GET`, returning 405. 303 (See Other) forces the browser to GET. Any browser-facing redirect to
  `/login` (middleware, logout route) must target the **public** auth URL
  (`SOVEREIGN_AUTH_PUBLIC_URL`), never the internal `SOVEREIGN_AUTH_URL`
  (`auth:3001`), which the browser cannot resolve in Docker.
- **`'use client'` components must never read browser APIs (`navigator`, `window`,
  `localStorage`, etc.) inside a `useState` initializer or during render.** The
  server renders without those globals, producing different HTML than the client
  and triggering a React hydration error. The pattern: always initialise state to
  a server-safe value (e.g. `useState('online')`), then read the browser API
  inside `useEffect` and call the setter if needed. The one-frame delay before
  the UI reflects the real browser state is imperceptible. `OfflineBanner` is the
  canonical example — it initialises to `'online'` and checks `navigator.onLine`
  in `useEffect` (`runtime/app/(platform)/_components/OfflineBanner.tsx`).
- **Never read `NEXT_PUBLIC_*` env vars for a value that must vary per deployment
  at run time.** Next.js inlines `process.env.NEXT_PUBLIC_*` literals at **build
  time** into every bundle (client and server); the Docker images build without
  an `.env`, so such a read freezes to its fallback and ignores the env injected
  at container start. The post-login redirect target (`NEXT_PUBLIC_RUNTIME_URL`)
  is therefore resolved **server-side at request time** via
  `apps/auth/src/runtime-url.ts` (which reads through a computed key so the
  inliner can't match it) and passed as a prop to the client `LoginForm`/
  `RegisterForm`. The auth login/register `page.tsx` are server components for
  this reason. `.env.example` leaves `NEXT_PUBLIC_RUNTIME_URL` /
  `SOVEREIGN_AUTH_URL` commented so the per-environment Compose/code defaults
  apply (dev → :3000/:3001, prod → :4000/:4001); a hardcoded dev value in `.env`
  leaks into the prod stack via interpolation.
- **better-auth's fresh-session gate is disabled (`session.freshAge: 0`** in
  `apps/auth/src/auth.ts`). By default `freshSessionMiddleware` (guarding
  `GET /list-sessions`, used by `sdk.auth.listSessions`) returns
  `403 SESSION_NOT_FRESH` once a session is older than `freshAge` (1 day) — so
  the Account Security tab broke for day-old sessions. Self-hosted users stay
  signed in for weeks, so freshness re-auth is off. Don't re-enable it without
  a re-auth flow. (A regression test asserts `freshAge === 0`.)
- **Profile self-mutations must clear both `session_data` cookie variants**
  (`better-auth.session_data` and `__Secure-better-auth.session_data`, each
  with `maxAge: 0`) — better-auth's signed session cache lives for 300s, so a
  self-edit that only clears one variant (or neither) leaves the chrome
  showing the stale name/avatar for up to 5 minutes even though the
  underlying record already changed. Done in
  `runtime/app/api/account/avatar/route.ts` and
  `plugins/account/app/actions.ts`.
- **Theme is applied before first paint by an inline script in
  `runtime/app/layout.tsx`** reading the `sv-theme` cookie (`light`/`dark`
  applied directly; `system`/unset follows `prefers-color-scheme`). The Account
  plugin writes the choice to `account_prefs` (authoritative) and mirrors it to
  the `sv-theme` cookie on PATCH. Avatars live on disk at
  `data/avatars/<user_id>.<ext>` (served by `/api/account/avatar/[userId]`); the
  user record's `image` field holds the servable URL.
- **Security headers are split: static via `next.config.ts`, CSP via middleware**
  (RFC 0008 Tier 0, Task 0.5.16). Both apps' `next.config.ts` emit the static
  headers (`X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`,
  `Referrer-Policy`, `Permissions-Policy`, and **HSTS production-only**). The
  **Content-Security-Policy is strict and nonce-based**, set per-request in
  middleware (`runtime/middleware.ts` extends the session middleware;
  `apps/auth/middleware.ts` is dedicated) — every middleware return path must run
  through `applyCsp`, and the rendered-path request headers carry the nonce so
  Next nonces its own inline scripts. CSP builders live in `runtime/src/security.ts`
  and the duplicated `apps/auth/src/security.ts` (the apps share no code). The
  runtime's pre-paint theme script is a **fixed string** (`runtime/src/theme-script.ts`)
  allowed by a **CSP hash** (`THEME_SCRIPT_CSP_HASH`, guarded by a drift test) — not
  a nonce — so the root layout stays statically renderable (the PWA `/offline`
  fallback needs it). The nonce only applies on **dynamically-rendered** pages;
  the runtime's gated pages are dynamic via the `(platform)` layout's `headers()`,
  and `apps/auth` forces dynamic (`export const dynamic` in its root layout).
  Never add `'unsafe-inline'` to `script-src`. **The runtime CSP's `form-action`
  must include the browser-facing auth origin, not just `'self'`.** The logout
  form lives on the runtime origin but its POST 303-redirects to the auth login
  page on a different origin (`SOVEREIGN_AUTH_PUBLIC_URL`, e.g. `:3001`/`:4001`);
  browsers check `form-action` against the whole redirect chain, so `'self'`
  alone silently blocks it (the page just flickers, no navigation). The
  middleware feeds the parsed auth origin (`authPublicOrigin()`) to
  `buildContentSecurityPolicy` (`authFormActionOrigin`). Postgres connects over
  TLS when the connection string sets `sslmode` (`pgSslMode` in
  `packages/db/src/client.ts`; CA via `PGSSLROOTCERT`). At-rest encryption
  (Tiers 2–4) is deferred to Task 1.0.01.
- **A quick-entry input that commits on Enter must also commit on blur**, via
  `useCommitOnEnterOrBlur` (`@sovereignfs/ui`). iOS Safari's native
  "Previous / Next / Done" keyboard-accessory toolbar — added automatically
  whenever a Sheet/form has more than one focusable field, with no supported
  way to suppress it — only ever fires a `blur` when its Done/checkmark is
  tapped, never a keydown and never a form submit. An `onKeyDown`-only Enter
  handler silently discards whatever was typed the moment a user dismisses
  the keyboard that way instead of pressing the on-screen Return key. Found
  and fixed across `sovereign-tasks` and `sovereign-shopper`'s quick-add
  rows (add task/subtask/list, mobile rename Sheet); see
  `docs/plugin-development.md`'s "Committing quick-entry input" for the
  pattern and its one exception (a field inside a form with its own
  always-visible submit button — e.g. login, payment — should NOT commit on
  blur; that's the correct, safer default there).
- **The `touch-action` CSS property's effective value at any point is the
  _intersection_ of that element's own value and every ancestor's value, not
  independently scoped per element.** Declaring `pan-y` on a vertically
  scrolling child nested inside an ancestor declaring `pan-x` (e.g. a native
  horizontal swipe-between-lists carousel) does not "hand off" the horizontal
  axis to the ancestor — the intersection of `{pan-y}` and `{pan-x}` is empty,
  so neither axis is handled natively anywhere in that subtree, breaking both
  gestures at once. Fix nested-scroller touch/scroll conflicts with
  behavioural CSS that doesn't touch `touch-action` (e.g. `overflow-anchor`)
  or JS-level gesture arbitration, not by declaring narrower `touch-action`
  values on nested perpendicular scroll containers. `@sovereignfs/ui`'s
  `SwipableMobileCarousel`/`SwipableMobileCarouselSlideBody` already account
  for this (see that component's CSS) — a new vertically-scrolling slide body
  should not need to touch `touch-action` at all.
- **The runtime is an installable PWA** (`@ducanh2912/next-pwa`, PLT-09). The
  web manifest (`runtime/public/manifest.json`) and PNG icons
  (`runtime/public/icons/`) are committed **source**; the service worker
  (`sw.js`, `workbox-*.js`, `fallback-*.js`) is **generated into
  `runtime/public/` at build** and is gitignored + ignored by ESLint and
  Prettier — never commit or lint it. The SW is **disabled in dev** (so it
  never interferes with HMR), so installability/Lighthouse only apply to a
  production build (`next build`). The PWA assets and the `/offline` fallback
  are excluded from the middleware session gate (they must load without a
  session).
- **A cached authenticated document must never be served to a different user.**
  Sovereign's pages are per-user SSR (nav, plugin list, account state), so
  replaying a cached rendered shell for the wrong account — after logout/login
  on a shared device, or on a device several people use — discloses one user's
  content to another. This is the guarantee; the mechanism below is how it is
  currently met, and may change as long as the guarantee does not.

  **How it is met today:** the `pages` entry in `runtime/next.config.ts`
  (real per-user SSR — Console, Account, any plugin without an `offline` tier)
  is `NetworkOnly`, not caching at all — try the network, and on any failure
  fall straight to the generic `/offline` page. There is no cached document to
  ever replay to the wrong user, because none exists. Manifest-declared
  offline routes (`offline: 'offline-first' | 'device-only'`, research 0012)
  are the one exception, cached via the separate `offline-shells` entry — safe
  because that document is required to be a **user-neutral shell** (enforced
  by `runtime/src/__tests__/offline-route-neutrality.test.ts`: no per-user SSR
  content at all, personalization hydrates client-side), not because of any
  per-request identity check. `/` shares this treatment whenever Launcher
  (the default root) is itself offline-first — see
  `runtime/src/registry.ts`'s `getOfflineRoutePrefixes()`.

  **A signed, per-user offline session assertion previously partitioned the
  `pages` cache instead** (research 0012, epic tasks 1.21/2.31/2.32) — every
  entry keyed by a signature-verified user id, so a request whose user
  couldn't be established got an anonymous key rather than colliding with a
  real one. Removed after live testing (sign a user out, take the device
  offline, reload) found two compounding problems: the client-side half that
  populated the assertion was never actually wired into the app, so the
  partition key was always the anonymous fallback in practice; and separately,
  next-pwa's own default caching of bare `/` (the "start-url" cache) had no
  partitioning or session check of any kind and was never routed through this
  mechanism at all, so a signed-out user's last-cached `/` replayed
  indefinitely regardless. Both findings point the same direction: a
  never-exercised, per-request signature-verification path is a much larger
  attack surface to keep correct than simply not caching what cannot be
  proven safe to replay. If per-user offline access to non-neutral pages is
  ever revisited, budget for the same live, adversarial verification this
  fix relied on — the failure here shipped past `pnpm test` and code review
  and was only caught by actually signing out and going offline against a
  real build.

  **This rule previously read "never switch these entries to a stale-serving
  strategy, keep them `NetworkFirst`."** That was rewritten once
  (research 0012) to state the requirement rather than the mechanism, on the
  premise that offline-first needs to serve _some_ cached document with no
  network. That premise still holds for manifest-declared offline routes
  (met via neutrality, above) but not for arbitrary per-user pages — `pages`
  is back to never stale-serving, which happens to again read like the
  original mechanism, this time for a verified rather than assumed reason.

  Separately, the safe lever for the iOS "white flash on standalone launch" (a
  real, largely irreducible WebKit launch-image-to-first-paint gap for
  non-native-wrapped PWAs) remains bounding the worst case with
  `networkTimeoutSeconds` + `fallbacks.document`, not loosening the above. See
  `docs/research/0011-ios-pwa-inspection-findings.md` #5.

- **Production images build from Next.js standalone output** (Task 0.5.2).
  Both `next.config.ts` set `output: 'standalone'` **and**
  `outputFileTracingRoot` to the monorepo root — required in a pnpm monorepo or
  the trace misses workspace package files. The standalone tree mirrors the repo
  layout, so the runner runs `node runtime/server.js` / `node apps/auth/server.js`
  (not `next start`). The standalone server reads `PORT`/`HOSTNAME` env (the old
  `next start --port` flag is gone): the runner sets `PORT` + `HOSTNAME=0.0.0.0`
  (runtime 3000, auth 3001). `runtime/.next/static` and `runtime/public` (which
  holds the generated PWA assets) must be **copied explicitly** into the runner —
  standalone does not include them. Healthchecks use **`127.0.0.1`, not
  `localhost`** (busybox `localhost`→`::1`, but the server binds IPv4
  `0.0.0.0` → connection refused on `localhost`). The runtime's `HEALTHCHECK`
  hits the public `/api/health` liveness route (excluded from the middleware
  gate); the admin-key-gated `/api/admin/health` stays the richer report.
  **`docker-compose.prod.yml` uses a named volume (`sovereign_data`), not a host
  bind mount**, for `/app/data`: the images run **non-root**, and a named volume
  inherits the image's `/app/data` ownership so SQLite/avatar writes work with
  zero host `chown` (a bind mount keeps host ownership and breaks non-root writes
  on Linux — macOS VirtioFS hides this). Dev (`docker-compose.yml`) keeps the
  `./data` bind mount (runs as root). The named volume is **pinned with an
  explicit `name: sovereign_data`** so Compose doesn't prefix it with the project
  (checkout-dir) name — the documented backup/restore commands reference it by
  that exact name.
- **Both standalone images COPY `pnpm-workspace.yaml` into `/app`** (runtime and
  `apps/auth` Dockerfiles). Next.js standalone `server.js` calls
  `process.chdir(__dirname)` at boot, moving cwd to `/app/runtime` (or
  `/app/apps/auth`). `findWorkspaceRoot()` walks up from cwd and stops at the
  `pnpm-workspace.yaml` marker, returning `/app` — so **relative SQLite paths**
  (`sovereign.db`, `auth.db`) and the **drizzle migrations folder**
  (`packages/db/migrations/`, runtime only) resolve against `/app`, i.e. the
  mounted `/app/data` volume. **Without the marker** `findWorkspaceRoot()` falls
  back to the post-`chdir` cwd and the DBs land at `/app/runtime/data` /
  `/app/apps/auth/data` — OUTSIDE the volume: data does not persist across
  container recreates and is missing from backups, and the runtime fails to boot
  (`Can't find meta/_journal.json`). Never drop the `pnpm-workspace.yaml` COPY
  from either Dockerfile.
- **The runtime Dockerfile must ship every plugin's `manifest.json` and
  `migrations/` folder into the runner image**, staged into a curated
  `/app/.deploy/plugins` directory in the builder stage (not the full
  `plugins/*/` tree — that would drag each plugin's `app/` source and
  `node_modules` into the production image for no benefit, since routes are
  already compiled into the standalone build). `runAllPluginMigrations()`
  (`runtime/src/plugin-migrations.ts`) and `buildIdToDirMap()` resolve these
  paths at server startup relative to the workspace root; if absent, a
  missing-migrations plugin is **silently skipped** (`existsSync` guard, no
  error logged) rather than failing loudly — this was the case for every
  shared/isolated-mode plugin until Sovereign Tasks (bundled with the
  platform by default) was the first to actually need it, surfacing as a
  production 500
  (`relation "..." does not exist`) with nothing in the logs pointing at the
  cause.
- **A shared or isolated-mode plugin whose application code queries through
  one dialect's schema (typically `sqlite-core`) needs a genuinely separate
  `pgTable`-based schema file to generate Postgres migrations from** —
  `drizzle-kit generate --dialect postgresql` cannot read a `sqliteTable()`
  schema; it silently reports zero tables. That Postgres schema file must
  use plain `integer` for booleans/timestamps, never native Postgres
  `boolean`/`bigint` — Drizzle's query-builder dialect is bound to the
  client connection, not to the table object's origin, so the existing
  SQLite-typed query code keeps working against a Postgres-backed client
  only if the physical columns serialize identically to what the SQLite
  column mappers already produce. See `docs/plugin-database.md` for the
  full pattern (`packages/db/src/schema/{sqlite,postgres}/platform.ts` is a
  different case — the platform's own query code is dialect-aware via
  `packages/db/src/exec.ts`, so its Postgres schema uses native types).
- **`sdk.device.getSurface()` / `x-sovereign-surface` (RFC 0080), and
  `x-sovereign-focus-plugin` (RFC 0082), are presentation hints only, never
  a security boundary.** Both derive from the shell's own User-Agent — a
  client-controlled value any caller can set to anything — so neither must
  ever be an input to authorization, entitlement, paywall, or data-access
  decisions. Anything that must not be reachable is gated by session,
  capability, or plugin permission, never by surface or focus. RFC 0082's
  route lock (`runtime/src/route-lock.ts`'s `decideFocusRoute()`, wired into
  `runtime/middleware.ts`) is a UX and product-scoping mechanism on top of
  the focus signal, not a security boundary: an out-of-focus path redirects
  to the focused plugin's root rather than being denied, and a forged focus
  target (or an edited User-Agent) reaches exactly the routes the caller's
  session/capability/plugin-permission gates already allow — those gates
  run entirely independently of the lock, before and after it.
  `runtime/middleware.ts` strips any inbound `x-sovereign-surface` /
  `x-sovereign-shell-version` / `x-sovereign-focus-plugin` header before
  injecting its own (all parsed from the shell's single
  `Sovereign-Shell/<mobile|desktop>-<platform> <version> (focus=<pluginId>)`
  User-Agent token via `runtime/src/surface.ts` — RFC 0082 deliberately
  extends RFC 0080's existing token rather than inventing a second one),
  the same discipline already applied to the `x-sovereign-user-*` family —
  but the stripping only protects against a spoofed _header_; it does
  nothing about a spoofed _User-Agent_, which is the actual trust boundary
  this rule exists to name.
- **`apps/auth` reads the exact same `DB_DIALECT`/`POSTGRES_DB_URL` the
  platform does — no separate auth-specific database variable.** This
  replaced an earlier design where auth resolved its own dialect
  independently from a separate `AUTH_DATABASE_URL`, which was a real
  production gap: an instance whose platform core had already been migrated
  to Postgres (`DB_DIALECT=postgres`) could leave `AUTH_DATABASE_URL` unset,
  silently stranding auth on its SQLite default while everything else moved,
  invisible because nothing compared the two. Removing the second variable
  removes the disagreement entirely, rather than detecting it after the
  fact. Auth still gets its own dedicated store — a Postgres schema
  (`sovereign_auth`, pinned via the connection's `search_path` startup
  option, same technique isolated plugins use) or an sqld namespace of the
  same name — so better-auth's tables can never collide with the platform's
  own. `apps/auth` still deliberately doesn't import `@sovereignfs/db`
  (service-boundary independence: own Dockerfile, own deploy) — it
  duplicates the small amount of dialect/sqld resolution logic it needs
  (`apps/auth/src/db.ts`) rather than sharing code, but reads the same env
  var _names_ the platform does.
- **Every isolated-mode Postgres plugin needs its own `migrationsTable`
  (`pluginMigrationsTableName(id)`), passed explicitly to
  `runPluginMigrations()` — the untouched default collides across plugins.**
  drizzle-orm's node-postgres migrator tracks applied migrations in a table
  that lives in a **fixed `drizzle` schema**, regardless of the connecting
  pool's `search_path` — so two isolated plugins left on the default table
  name (`__drizzle_migrations`) silently share ONE tracking table between
  them, even though their actual data tables correctly land in separate
  `plugin_<slug>` schemas via `search_path`. The second plugin's migrator
  compares its own migration timestamps against whatever the first plugin's
  migrations left as the newest row in that shared table and concludes
  "already applied" — skipping every `CREATE TABLE` statement with **no
  error, no warning**: the schema exists, empty, indistinguishable from a
  successful no-op migration. `pluginMigrationsTableName()` already existed
  to prevent this exact hazard for **shared**-mode plugins (writing into the
  platform DB) — it was never extended to isolated-mode Postgres because,
  until a real production migration (workstream: legacy SQLite → Postgres,
  task 8.25's follow-up) added a second one, only one isolated Postgres
  plugin (`com.mooniak.tritext`) had ever existed, so the collision was
  latent, not yet possible. **Never apply this to isolated SQLite plugins**
  — a genuinely separate file per plugin has no collision risk, and every
  existing SQLite-isolated plugin already has real migration history under
  the untouched default name; passing a different table name there would
  orphan it, not fix anything. Scope the fix by `pluginDb.dialect ===
'postgres'`, exactly as `runtime/src/plugin-migrations.ts` and both
  `bin/sv.ts` isolated-Postgres call sites do.
