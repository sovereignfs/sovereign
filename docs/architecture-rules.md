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
