# CLAUDE.md

Guidance for Claude Code working in this repository.

## What this is

**Sovereign** — a modular, self-hostable workspace runtime. A shared platform
(auth, DB, email, UI) hosts installable **plugins** as first-class apps. The
plugin system _is_ the product, not an app extended with plugins. Open source,
privacy-first, single-tenant/multi-user in v1.

## Source of truth

Two documents define everything. Read the relevant sections before any task —
they are authoritative over assumptions:

- `docs/sovereign-proposal-plan-srs.md` — Concept, Plan, Architecture, SRS,
  manifest reference, decision log.
- `docs/roadmap.md` — The build plan: sequenced tasks grouped by release
  milestone (Pre-v1, v1); completed tasks marked ✅. Each task = one branch =
  one PR.

## Working conventions

- **One task at a time.** Implement a single task, verify its review checklist,
  then stop for human review. Do not start a task on an unmerged PR.
- **Tasks are sequenced** — each depends on the previous unless tagged
  `[parallel]`. Don't skip ahead.
- **Branch per task**, always cut from an **up-to-date `main`** — run
  `git switch main && git pull` first. Name by change type:
  - `feat/<slug>` — features
  - `fix/<slug>` — bug fixes
  - `docs/<slug>` — documentation
  - `chore/<slug>` — tooling, scaffolding, deps, maintenance

  e.g. `feat/shared-tsconfig`, `chore/scaffold-monorepo`.
  _(Post-v1.0.0 this changes: `main` becomes the production branch and `dev`
  the integration branch — branch from `dev` then. Until then, base off `main`.)_

- **Doc task numbers (e.g. `0.3.02`) are for local tracking only.** Never put
  them in branch names, commit messages, or PR titles/descriptions. Refer to the
  work by what it does, not its task number.
- **Commits** end with a `Co-Authored-By` trailer specific to the tool used:
  - If **Claude Code** is the coding agent; end with the trailer (model-agnostic — do not use a specific model name,
    as multiple models may contribute to one task): `Co-Authored-By: Claude Code <noreply@anthropic.com>`
- **PRs** target `main`; body ends with the Claude Code attribution line.
  Describe what changed and why, and cite relevant SRS sections — but no task numbers.
  🤖 Generated with [Claude Code](https://claude.com/claude-code) (if **Claude Code** is the coding agent)
- **Merge strategy: rebase and merge** (never squash, never create a merge
  commit). Keeps history linear — each task's commit lands on `main` verbatim.
- **Fix commit messages BEFORE merging the PR.** Once a squash-merge lands on
  `main`, correcting it means rewriting/force-pushing `main` — avoid that.
- **When a task is done, always update both `docs/roadmap.md` and `CLAUDE.md`
  in the same PR.** Mark the task ✅ in the roadmap, add a ✅ completion entry
  to the CLAUDE.md Status section, and add a `⏳ Next: Task X.X.XX — <title>`
  line at the end of the Status section so the next session knows immediately
  what to start without re-reading the roadmap. Never leave the Status section
  without a "⏳ Next" marker — if a PR completes the last task in a phase,
  point at the first task of the next phase.
- **Verify before claiming done.** Run the task's review-checklist commands and
  show the output.
- Never merge a PR automatically. Either wait for explicit instruction to merge,
  or ask for consent before doing so.
- **Flag Docker-config impact immediately.** While building features or fixing
  bugs, whenever a change requires updating the Docker setup (`Dockerfile`,
  `apps/auth/Dockerfile`, `docker-compose.yml`, `docker-compose.prod.yml`,
  `.dockerignore`) — e.g. a new/renamed env var, a new port, a new on-disk path
  (writable dir or served asset dir), a new native dep, or anything affecting
  `next build`/standalone output — call it out in the same turn and update the
  relevant config (or ask), rather than letting it drift behind the code.
- **Docs are part of the change.** Changing the manifest schema
  (`packages/manifest`), the SDK surface (`packages/sdk`), or env vars
  (`.env.example`) means updating the matching doc in the same PR —
  `docs/plugin-development.md` (manifest fields, permissions, SDK methods) and
  `docs/self-hosting.md` (env vars). The `runtime/src/docs-parity.test.ts` parity
  test enforces the enumerable parts (every field/permission/SDK key/env var must
  appear in its doc) and fails CI otherwise; review covers the prose.
  **The parity test is one-directional** (`.env.example` → `self-hosting.md`); it
  does not catch env vars consumed by the code but absent from `.env.example`.
  That direction is a human convention: every env var read from `process.env` in
  either app must be declared (or commented-out) in `.env.example`, even if it
  has a safe default, so operators know it exists.
- **Version bumps** are part of the PR — bump the relevant `package.json`(s)
  in the same branch, following semver tied to the change type:
  - `fix/` → **patch** (0.0.x)
  - `feat/` → **minor** (0.x.0)
  - Breaking change → **major** (x.0.0) — also requires a migration note in
    `docs/upgrade.md`
  - `chore/` / `docs/` → no version bump unless a public API changed

  The **SDK** (`packages/sdk`) and **UI** (`packages/ui`) are under an
  additional constraint per NFR-04: patch releases must never contain breaking
  changes; breaking changes require at minimum a minor bump and a migration
  note, regardless of branch type. Both packages are published to npm as
  `@sovereignfs/sdk` and `@sovereignfs/ui` — they are public contracts for
  plugin developers.

  The **platform version** in the root `package.json` tracks roadmap phase
  milestones — **minor bumps for completed phases, patch bumps for completed
  pre-release hardening tasks (1.0.xx), and a single jump to `1.0.0` at the
  public release.** The current version is **`0.9.3`** (phases 0.3–0.9 complete
  - three 1.0.xx hardening tasks). Do **not** bump the minor for individual tasks
    within a phase — minor bumps happen once per completed roadmap phase. The
    downgrade guard, plugin compatibility gates (RFC 0024), and `/api/admin/health`
    all read this value; see `docs/versioning.md` for the full version map and
    rectification plan.

  **Per-package versions are independent of the platform version.** Internal,
  private packages (`@sovereignfs/db`, `runtime`, `auth`, `manifest`, `mailer`,
  plugins) follow normal semver tied to the change type above and **may cross
  `1.0.0`** on a breaking change — their versions are internal, not the
  user-facing product version (e.g. `@sovereignfs/db` is `1.0.0`). The published
  packages **`@sovereignfs/sdk`** (already `1.x`, the stable contract) and
  **`@sovereignfs/ui`** follow their own public semver per NFR-04 and are
  **exempt** from the platform's "stay under v1" rule.

## Code quality

Established in Task 0.3.3. Every package and PR must comply — no exceptions.

### Tools

| Tool                       | Purpose                                                       |
| -------------------------- | ------------------------------------------------------------- |
| **Prettier**               | Formatting — single source of truth for style                 |
| **ESLint 9 (flat config)** | Linting — correctness, best practices, SDK boundary rule      |
| `typescript-eslint`        | TypeScript-specific ESLint rules (recommended + strict)       |
| `eslint-config-prettier`   | Disables ESLint formatting rules that conflict with Prettier  |
| `simple-git-hooks`         | Pre-commit hook runner (lighter than Husky, no shell scripts) |
| `lint-staged`              | Runs Prettier then ESLint only on staged files (fast)         |
| `.editorconfig`            | Editor-level baseline — indent, line endings, charset         |

### Formatting conventions (Prettier)

- Single quotes
- Semicolons
- Trailing commas (`all`)
- Print width: 100
- Tab width: 2 spaces

### Rules

- **Never disable ESLint rules inline** (`// eslint-disable`) without a comment
  explaining why, and never disable the SDK boundary rule.
- **Prefix intentionally-unused identifiers with `_`** (e.g. required-by-signature
  stub params, ignored destructured fields). `no-unused-vars` ignores `^_`; this
  is the only sanctioned way to keep an unused binding.
- **Never add per-package Prettier overrides.** One config, entire monorepo.
- `pnpm format:check` and `pnpm lint` must pass before every PR. The pre-commit
  hook enforces this locally; CI enforces it on every push.
- **No Biome.** ESLint is required for the custom `no-restricted-imports` SDK
  boundary rule. Running both would be redundant overhead.

### Commands

```bash
pnpm format          # write formatting fixes across the whole repo
pnpm format:check    # check formatting without writing (used in CI)
pnpm lint            # run ESLint
pnpm lint:fix        # run ESLint with auto-fix
```

## Hard architectural rules (enforced or load-bearing)

- **SDK is the only plugin↔platform contract.** Plugins MUST NOT import from
  `runtime/src`. ESLint enforces this (established in Task 0.3.3, verified in
  Task 0.3.8). Plugins use `packages/sdk` only.
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
  serves at `/console`. The composed segments are **copies** (in every
  environment — Next's dev route watcher does not follow symlinked route dirs)
  and are gitignored by a `.gitignore` inside each route group — never edit or
  commit them. Source of truth is always `plugins/[id]/app/`. `shell: minimal` (a
  chrome-free group) is not wired yet; the generate script fails loudly on it.
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
  — `account`, `admin`, `health`, `plugins` (`runtime/app/api/*`) — listed in
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

## Design system (`packages/ui`)

`packages/ui` is the **Sovereign Design System** — a public contract for plugin
developers, versioned with the same discipline as the SDK. Breaking a token name
or component API breaks every third-party plugin that uses it.

### Technology

- **Tokens:** CSS custom properties in plain `.css` files — universally
  consumable from any CSS, framework-agnostic, RSC-safe. No JS import required
  to use tokens.
- **Components:** React + CSS Modules — zero extra dependencies, built into
  Next.js, familiar, RSC-safe by default.
- **No Tailwind.** No runtime CSS-in-JS. No third-party component framework.

### Token architecture — two tiers

```
Primitive tokens     raw scale, no semantic meaning
  --sv-grey-50 … --sv-grey-950
  --sv-space-1 … --sv-space-16
  --sv-font-size-sm … --sv-font-size-2xl
  --sv-radius-sm / -md / -lg
        │
        ▼  mapped by semantic layer
Semantic tokens      contextual meaning, what plugin devs use
  --sv-color-surface
  --sv-color-text-primary
  --sv-shadow-card
  --sv-radius-md
```

Plugin developers reference **semantic colour tokens** — never primitive
colours directly. The semantic colour layer is the theming surface that tenant
theming (CON-08) and dark mode override at `:root` / `[data-theme]`; primitives
stay fixed. The scale tokens (`--sv-space-*`, `--sv-radius-*`,
`--sv-font-size-*`) have no separate semantic tier — they are theme-stable and
used directly. See `docs/design-system.md` for the full model. The v1 identity
is **monochrome** (accent = near-black on light, near-white on dark); a tenant
adds colour by overriding `--sv-color-accent`.

### Token prefix

All tokens use `--sv-*` — short, consistent with the `sv` CLI identity, and
unambiguous. **Never abbreviate after the prefix** — use full descriptive names:
`--sv-color-text-primary` not `--sv-ctp`.

### What plugin developers consume

```ts
// Components — typed React components
import { Button, Card, Input, Badge } from '@sovereignfs/ui';

// Tokens — already injected globally by the runtime shell.
// Reference directly in plugin CSS without any import:
// color: var(--sv-color-text-primary);
// background: var(--sv-color-surface);
```

### Scope rules

- The runtime shell and Console plugin use both tokens and components.
- Plugin developers may use any component or token.
- Components must never hardcode values — always reference `--sv-*` tokens.
- Dark mode and tenant theming work by swapping semantic token values at `:root`;
  no component changes required.

## Native mobile app (post-v1 plan)

Mobile is out of scope for v1 but the approach is decided — do not treat it as
an open question or suggest alternatives.

**Model:** Universal Capacitor shell app — one binary on the App Store / Play
Store. On first launch the user enters their self-hosted instance URL. The app
loads it in a WebView. All Sovereign functionality is served by the user's
instance and runs unchanged. Multiple instances supported. Same pattern as
Nextcloud, Bitwarden, Element (Matrix).

**Shell:** Capacitor (single TypeScript codebase for iOS + Android). Lives in a
separate `sovereign-mobile` repository, not this monorepo.

**Device API tiers — in priority order:**

1. **Web APIs** — `navigator.geolocation`, `getUserMedia` etc. Work natively in
   WebViews, also work in browser/PWA. Use these first.
2. **Capacitor plugins** — for what Web APIs can't cover: native photo picker,
   APNs/FCM push notifications, Face ID / fingerprint, haptics, background
   location.
3. **`sdk.device.*`** — the SDK abstraction plugin developers call. Detects
   environment, routes to the correct tier. Plugins never call Web APIs or
   Capacitor directly.

**Plugin developers use `sdk.device.*` only.** This keeps plugins portable
across browser, PWA, and native shell without changes.

See SRS §3.12 for the full specification.

## Tech stack

Next.js 15 (App Router) · TypeScript · Turborepo + pnpm workspaces ·
better-auth (`apps/auth`) · Drizzle ORM (SQLite/Postgres) · nodemailer SMTP
(`packages/mailer`) · CSS Modules + CSS custom properties (`packages/ui`) ·
`tsup` (package bundler, ESM only) · Vitest + Testing Library / jsdom (tests in per-dir `__tests__/`; root `__tests__/{integration,e2e,visual}/` scaffold for future tiers) ·
Zod (manifest
validation) · `citty` + `consola` (`bin/sv` CLI) · `@ducanh2912/next-pwa` ·
Docker Compose.

## Monorepo layout

```
apps/auth/          better-auth wrapper (the only separate Next.js app)
packages/
  tsconfig/         shared TS configs (base/nextjs/library) — extend these
  db/               Drizzle client factory + schema + migration runner
  manifest/         manifest schema, types, validation
  mailer/           SMTP abstraction (no-op when unconfigured)
  ui/               shared component library + design tokens
  sdk/              plugin↔platform contract (types + impls)
runtime/            Sovereign Core (Next.js shell, middleware, registry, SDK bridge)
  generated/        built from manifests — never hand-edit
plugins/console/    core admin plugin (platform type)
plugins/launcher/   home screen plugin (platform type)
plugins/account/    per-user profile plugin (platform type)
registry/           public plugin index (plugins.json) + submission process
scripts/            install-plugins.ts, generate-registry.ts, dev.ts
bin/sv              CLI (v0.5)
```

### Package naming and scope

One owned npm scope for everything: **`@sovereignfs/*`**. The `fs` denotes
_federated systems_ — reflecting the project's long-term federated direction
(federation itself is a post-v1 concern; see SRS §1.4 non-goals).

- `packages/sdk` → `@sovereignfs/sdk` — **published** (plugin contract).
- `packages/ui` → `@sovereignfs/ui` — **published** (design system).
- `packages/db` → `@sovereignfs/db` — internal, `"private": true`.
- `packages/manifest` → `@sovereignfs/manifest` — internal, `"private": true`.
- `packages/mailer` → `@sovereignfs/mailer` — internal, `"private": true`.
- `packages/tsconfig` → `@sovereignfs/tsconfig`. Not published and not imported
  in code; consumed only via TypeScript `extends`
  (`@sovereignfs/tsconfig/base.json` etc.), declared as a `workspace:*`
  devDependency by each consumer.

The "do not publish" signal is `"private": true` in the package's
`package.json` — **not** the scope. A single scope we own avoids the
dependency-confusion risk of aliasing a scope owned by someone else
(`@sovereign` is taken on npm; `@sovereignos`/`-stack`/`-core` collide with
existing products). Only `sdk` and `ui` ever reach npm.

## Commands

```bash
pnpm install            # install workspace deps
pnpm build              # turbo build — packages (tsup) → generate → apps (next build)
pnpm dev                # start dev servers; generate runs automatically on startup
pnpm format             # write Prettier formatting fixes across repo
pnpm format:check       # check formatting without writing (CI)
pnpm lint               # ESLint incl. SDK import-boundary rule
pnpm lint:fix           # ESLint with auto-fix
pnpm typecheck          # tsc --noEmit across packages
pnpm test               # run Vitest across the repo
pnpm test:watch         # Vitest in watch mode
pnpm test:unit          # unit/component tests with verbose output
pnpm test:integration   # cross-service integration tests (root __tests__/integration/)
pnpm test:e2e           # end-to-end tests (root __tests__/e2e/)
pnpm install:plugins    # clone sovereign/community plugins declared in sovereign.plugins.json
pnpm registry:validate  # fetch + validate registry/plugins.json entries, write content-hash provenance
pnpm registry:check     # verify-only (no write) — CI runs this on registry/ changes
```

## Dev DX notes

- **No manual rebuilds in dev.** `pnpm dev` starts everything. The runtime's
  dev script is `scripts/dev.ts`: it composes plugins once, then runs the
  generate watcher and the Next.js dev server together (and tears both down on
  exit). HMR handles all subsequent changes.
- **Package changes trigger HMR instantly.** All workspace packages are listed
  in `transpilePackages` in both `runtime/next.config.ts` and
  `apps/auth/next.config.ts`. Next.js compiles package TypeScript source
  directly — no `tsup --watch`, no intermediate `dist/`. Edit
  `packages/ui/src/Button.tsx` and the runtime hot-reloads immediately.
- **Plugin changes trigger HMR via re-copy.** Plugins compose as copies, not
  symlinks (Next's dev route watcher does not discover routes through symlinked
  directories — symlinked plugin routes 404 under `next dev`). `scripts/dev.ts`
  runs the generate script in `--watch` mode, so an edit under `plugins/[id]/app/`
  re-copies into the route group and Next hot-reloads. (This replaced the earlier
  symlink + `resolve.symlinks: false` approach.)
- **tsup is production-only.** tsup runs during `pnpm build` to emit `dist/`
  for Docker images and npm publishing. It is not part of the dev pipeline.
- **Email in dev goes to Mailpit.** The mailer speaks plain SMTP, so dev mail
  capture is config-only (no mock-mode in the package). Run Mailpit via the
  `docker-compose.yml` service or the native binary (both: SMTP `1025`, inbox
  `8025`), point `SMTP_HOST` at it, and read mail at `http://localhost:8025`.
  Email is off by default (SMTP_HOST unset → `send()` no-ops). See
  CONTRIBUTING — "Email in development".
- **Docker Compose runs the full stack locally.** `docker compose up --build`
  starts runtime (`:3000`), auth (internal-only, no host port), and Mailpit.
  The runtime container hardcodes `SOVEREIGN_AUTH_URL=http://auth:3001` (the
  internal service name) — do not set this var in `.env` for Docker use. For
  production use `docker-compose.prod.yml` (standalone file, runtime on `:4000`,
  no Mailpit). See `docs/self-hosting.md`. The `Dockerfile` (runtime) and
  `apps/auth/Dockerfile` are three-stage standalone production builds (Task
  0.5.02) — both compose files build from them (dev runs them as root with a
  `./data` bind mount; prod runs them non-root with a named volume).
- **Runtime dev = `scripts/dev.ts`.** The runtime's `dev` script runs the
  orchestrator, which composes plugins (writes the registry, copies plugin
  `app/` trees), then runs the generate watcher + `next dev` on `:3000`. Both
  apps load the single root `.env` via `loadEnvConfig`. The runtime middleware
  injects `x-sovereign-user-*` headers from the verified session.
- **Middleware verifies sessions locally, then falls back to `/api/verify`**
  (AUTH-05, Task 0.5.6). The auth server enables better-auth's **signed cookie
  cache** (`session.cookieCache`, `maxAge` 300s) — a `better-auth.session_data`
  cookie holding session+user, HMAC-signed with `AUTH_SECRET`. The middleware
  verifies it offline via `getCookieCache` from `better-auth/cookies` (Edge-safe;
  pure logic in `runtime/src/session-verify.ts`, `verifiedUserFromCache`), using
  `resolveAuthSecret()` = `SOVEREIGN_AUTH_SECRET ?? AUTH_SECRET` (must equal the
  auth signing secret; if neither is set, local verify is skipped — never a
  default). On a cache miss it falls back to `/api/verify` (`SOVEREIGN_AUTH_URL`,
  AUTH-06) and **forwards better-auth's `Set-Cookie`** so the cache self-refreshes.
  Trade-off: role/active changes are stale up to `maxAge` (then the cache cookie
  expires → fallback). `/api/verify` returns the same payload shape; the runtime
  service now needs `AUTH_SECRET` in every compose file.
- **Profile self-mutations must invalidate the `session_data` cache cookie.**
  The chrome and Account page render the user's name/avatar from the cached
  session snapshot (`x-sovereign-user-*` headers), so a self-change would
  otherwise not appear until `maxAge` elapses. Any path that updates the current
  user's session-visible fields clears both `better-auth.session_data` and
  `__Secure-better-auth.session_data` (`maxAge: 0`, the secure variant with
  `Secure`) so the next request re-verifies fresh via `/api/verify` — done in the
  avatar upload route (`runtime/app/api/account/avatar/route.ts`) and the
  display-name action (`plugins/account/app/actions.ts`). The session token is
  untouched (no logout). Admin-driven changes to _other_ users (role/deactivate)
  remain bounded by `maxAge`. **Clearing the cookie only takes effect on the
  _next_ request, so the same-cycle re-render after a self-edit still has the
  stale snapshot.** The Account profile page therefore reads the authoritative
  name/avatar straight from the auth server with
  `GET /api/auth/get-session?disableCookieCache=true` (the `disableCookieCache`
  flag is essential — plain `get-session` honours the same signed cookie cache
  and would return the stale value), falling back to the cached session if that
  fetch fails. Without it the dialog showed the old name until closed and
  reopened.

## Environment notes

- Node ≥20 (dev on 24.x), pnpm 11.5.2 (pinned via `packageManager`).
- pnpm 11 blocks dependency build scripts by default. `esbuild` (via `tsx`) and
  `better-sqlite3` are allowlisted in `pnpm-workspace.yaml` under `allowBuilds`
  — required for their native bindings. `simple-git-hooks` is set to `false`
  there (the root `prepare` script installs the hooks instead).
- **Shared dev tooling is pinned via the pnpm `catalog:`** in
  `pnpm-workspace.yaml` (`typescript`, `tsup`). Every package references them as
  `"typescript": "catalog:"` / `"tsup": "catalog:"` — never a literal version.
  This stops `pnpm add` from floating one package onto a different major (it
  once pulled TS 6 into a single package). When adding `typescript`/`tsup` to a
  new package, use `catalog:`; to bump the version, edit the catalog once.

## Status

- ✅ Task 0.3.01 — Monorepo scaffold (merged to `main`).
- ✅ Docs — Build, dev DX, deployment, and npm publishing strategy (merged to `main`).
- ✅ Task 0.3.02 — Shared TypeScript config (`packages/tsconfig`) (merged to `main`).
- ✅ Task 0.3.03 — Code quality tooling (ESLint + Prettier + hooks) (merged to `main`).
- ✅ Task 0.3.04 — `packages/db` (Drizzle client factory) (merged to `main`).
- ✅ Task 0.3.05 — `packages/manifest` (schema + validation) (merged to `main`).
- ✅ Chore — pnpm catalog for shared dev tooling (merged to `main`).
- ✅ Task 0.3.06 — `packages/mailer` (SMTP abstraction) (merged to `main`).
- ✅ Task 0.3.07 — `packages/ui` (Sovereign Design System scaffold) (merged to `main`).
- ✅ Task 0.3.08 — `packages/sdk` (interface definitions) (merged to `main`).
- ✅ Chore — manifest `icon` field + plugin specs (Console/Launcher/Account/Tasks/Splitify/Plainwrite) + shell sidebar architecture (merged to `main`).
- ✅ Task 0.3.09 — `apps/auth` (self-contained better-auth server) (merged to `main`).
- ✅ Tasks 0.3.10 + 0.3.11 — Runtime scaffold + generate script (combined) (merged to `main`).
- ✅ Task 0.3.12 — Docker Compose for local dev (merged to `main`).
- ✅ Task 0.4.01 — Console plugin scaffold (plugin route-composition model + middleware admin gating; platform → 0.4.0) (merged to `main`).
- ✅ Task 0.4.02 — Console: user management (user list with invited/active/deactivated status, invite flow, role change, deactivate/reactivate; `sdk.auth` + `sdk.mailer` wired) (merged to `main`).
- ✅ Task 0.4.03 — Console: plugin management (installed plugin list, enable/disable toggle, middleware 404 for disabled routes; platform DB singleton + `plugin_status` table) (merged to `main`).
- ✅ Task 0.4.04 — Console: tenant settings, system health, root plugin config (`platform_settings` + `tenants` seeded in platform DB; `sdk.platform.getConfig()` wired; invite-only toggle dual-written to auth server; `/` redirects to the configured root plugin) (merged to `main`).
- ✅ Task 0.4.05 — Launcher plugin (`plugins/launcher/` home grid; gated `/api/plugins` + `selectLauncherPlugins` helper; chrome plugins excluded from grid and sidebar middle section; `/` serves the root plugin in place via middleware rewrite — `/` and `/launcher` both render the Launcher) (merged to `main`).
- ✅ Task 0.4.06 — Account plugin (Profile + Preferences + Security): display name + avatar, IANA timezone + Light/Dark/System theme, password change, active-session list/revoke; `account_prefs` table; `sdk.auth` gained `changePassword`/`listSessions`/`revokeSession`; `freshAge: 0` so session listing isn't gated by session age. Completes the v0.4 chrome-plugin trio (Console, Launcher, Account) (merged to `main`).
- ✅ Task 0.5.00 — `scripts/install-plugins.ts` (platform → 0.5.0, enters v0.5): reads `sovereign.plugins.json`, shallow-clones declared plugins into `plugins/<id>/` (skips existing), then runs `pnpm generate`; cloned plugins gitignored (allowlist keeps the three committed platform plugins) (merged to `main`).
- ✅ Task 0.5.01 — PWA configuration (`runtime` → 0.5.0): `@ducanh2912/next-pwa` wraps `runtime/next.config.ts` (disabled in dev), `runtime/public/manifest.json` + generated PNG icons (192/512/maskable + apple-touch), manifest/theme-colour linked via root-layout metadata/viewport, `/offline` fallback page; service worker generated into `runtime/public/` at build (gitignored + eslint/prettier-ignored). SRS §3.11, PLT-09 (merged to `main`).
- ✅ Task 0.5.02 — Production Docker image: three-stage (`deps`/`builder`/`runner`) builds from Next.js standalone output (`output: 'standalone'` + `outputFileTracingRoot`); non-root `nextjs` runner, `HEALTHCHECK` against the public `runtime/app/api/health` route; `docker-compose.prod.yml` healthchecks, `depends_on: service_healthy`, and a **named volume** for prod data. ~264 MB image. SRS NFR-01, §3.1 (merged to `main`).
- ✅ Task 0.5.03 — Postgres validation (SQLite↔Postgres parity, NFR-03; delivered in 4 PRs). The platform data layer is **async** (Postgres has no sync query) and `sdk.platform.getConfig()` is now async; `packages/db` wires the pg driver + a dialect-tagged `PlatformDb` wrapper + `schema/postgres` (bigint timestamps) + dialect-aware bootstrap DDL; `apps/auth` runs better-auth on a pg `Pool` with dialect-agnostic query helpers (quoted `"user"`, boolean/date normalisation). Postgres opt-in via the **`docker-compose.postgres.yml` overlay** (adds a `postgres` service, wires both apps). Env-gated `*.pg.test.ts` parity tests (`TEST_DATABASE_URL`). **Live-validated** end-to-end on Postgres 16: register → admin role → authenticated request → plugin toggle, all on a fresh pg. `docs/self-hosting.md` documents the Postgres setup + switch procedure (merged to `main`).
- ✅ Task 0.5.04 — `sv` CLI core commands (platform → 0.6.0): `bin/sv.ts` (`citty` + `consola`, run via `tsx`; `pnpm sv <cmd>` or the `./bin/sv` shim). A **thin orchestrator** — commands delegate to the existing scripts and `pnpm`/`turbo` (one source of truth per operation): `install`/`generate`/`build`/`dev` shell out, `serve` orchestrates both `next start` processes with mutual teardown (Docker stays canonical for prod), `plugin add <repo>` shallow-clones into a temp dir under `plugins/`, derives the destination from the manifest `id` (`validateManifest`), then composes, and `plugin remove <id>` guards the built-in platform plugins (`account`/`console`/`launcher`) before deleting + re-composing. Pure logic in `bin/helpers.ts` (unit-tested). Vitest `include` extended to `bin/**`. SRS §2.2 (merged to `main`).
- ✅ Task 0.5.05 (SDK surface) — `sdk.db.getClient()` implemented (`@sovereignfs/sdk` → 0.7.0). Last v1 SDK stub is gone: `getClient()` now returns the live platform Drizzle instance from `getPlatformDb()` — **async** (`Promise<DrizzleClient>`, same dialect-agnostic reason as `getConfig()`); `DrizzleClient` stays opaque (`unknown`) so the published SDK takes no dialect dependency. `sdk.auth.getSession()` now populates `tenantId` with `DEFAULT_TENANT_ID` (v1 single-tenant). `sdk.platform`/`sdk.mailer` were already implemented directly in `packages/sdk` (the doc's "runtime injects impls / SDK re-exports" model is obsolete — `packages/sdk/src/*.ts` import `@sovereignfs/db`/`@sovereignfs/mailer` directly). Migration note in `docs/upgrade.md`. SRS §3.6 (merged to `main`).
- ✅ Task 0.5.05b — local session verification in middleware (AUTH-05; `runtime` → 0.6.0). Auth server enables better-auth's signed cookie cache (`session.cookieCache`, 300s); the runtime middleware verifies the `session_data` cookie offline via `getCookieCache` (`better-auth/cookies`, Edge-safe) + the pure `verifiedUserFromCache`/`resolveAuthSecret` in `runtime/src/session-verify.ts`, falling back to `/api/verify` (which now re-emits better-auth's `Set-Cookie`, forwarded by the middleware so the cache self-refreshes). Secret = `SOVEREIGN_AUTH_SECRET ?? AUTH_SECRET`; runtime services in all compose files get `AUTH_SECRET`. `better-auth` added as a runtime dep. SRS AUTH-05/06 (merged to `main`).
- ✅ Task 0.5.06 — Documentation: new `docs/plugin-development.md` (file structure, full manifest reference, SDK usage, local dev, DB conventions, registry) and `docs/architecture.md` (contributor summary of SRS §3); expanded `README.md` (features, quick start, monorepo layout, docs index); completeness passes on `docs/self-hosting.md` (every `.env.example` var documented) and `docs/upgrade.md` (platform v0.3→v0.4→v0.5 notes). **Anti-drift:** `runtime/src/docs-parity.test.ts` asserts every manifest field, permission, SDK surface, and env var is documented (manifest exposes `manifestFieldNames`); CLAUDE.md "docs are part of the change" convention. SRS NFR-10 (merged to `main`).
- ✅ Task 0.5.07 — CI pipeline: `.github/workflows/ci.yml` (PR-only — `pull_request` against `main` + `workflow_call`, **no push trigger**; every job skips while the PR is a draft and runs on `ready_for_review`/subsequent pushes via `if: github.event_name != 'pull_request' || github.event.pull_request.draft == false`) with six jobs — `format`/`lint`/`typecheck`/`generate-validate`/`build`/`test`. The `test` job wires a **Postgres 16 service** + `TEST_DATABASE_URL` so the env-gated `*.pg.test.ts` parity suites run (not skipped). Shared toolchain setup is a composite action (`.github/actions/setup`). `.github/workflows/publish.yml` publishes on per-package tags (`sdk-v*.*.*` → `@sovereignfs/sdk`, `ui-v*.*.*` → `@sovereignfs/ui`), gated by reusing `ci.yml` via `workflow_call`; needs the `NPM_TOKEN` repo secret. **`@sovereignfs/ui` npm packaging finalised** (deferred from 0.3.07): `package.json` `publishConfig` repoints `exports`/`types` to `dist/` on publish (workspace dev still uses `src`), and `tsup.config.ts`'s `onSuccess` copies CSS into `dist/` (CSS Modules flattened by basename to match esbuild's bundled imports — unique per `<Component>.module.css`, build fails on a basename collision; token CSS keeps its tree). **`@sovereignfs/sdk` became npm-publishable in Task 0.5.20** (types-first, zero runtime deps; `noExternal` bundle plan dropped). (merged to `main`).
- ✅ Task 0.5.08 — Public `/api` namespace delegation (PLT-16; `runtime` → 0.7.0, `@sovereignfs/manifest` → 0.5.0): manifest gains an optional `apiProvider` flag + a shared `findApiProvider(manifests)` resolver; the generate script fails the build if two plugins declare it. The runtime splits `/api/*` into reserved runtime segments (`account`/`admin`/`health`/`plugins`, in `RESERVED_API_SEGMENTS`, guarded by a dir-parity test) and the public namespace `/api/<slug>/*`, which the middleware handles **before** the session gate — rewriting to the provider's `<routePrefix>/serve/<slug>/<path>` (preserving query string) or returning 404 when no enabled provider is installed. Pure logic in `runtime/src/api-namespace.ts` (unit-tested). SRS PLT-16 (merged to `main`).
- ✅ Task 0.5.09 — Overlay shell mode (RFC 0001; `@sovereignfs/manifest` → 0.6.0, `@sovereignfs/ui` → 0.2.0, `runtime` → 0.8.0): `shell` enum gains `overlay`; new `@sovereignfs/ui` `Dialog` primitive (scrim + panel, sizes, Esc/scrim-click dismissal, focus trap, mobile full-screen sheet; `--sv-color-scrim` + `--sv-shadow-overlay` tokens). The runtime hosts a `@modal` parallel-route slot **inside `(plugins)`** (committed `(plugins)/layout.tsx` + `@modal/{default,layout}.tsx`); the generate script composes overlay plugins twice (full-page fallback + `@modal/(.)<routePrefix>` interception copy). Console + Account migrated to `shell: overlay`. Root-plugin eligibility (CON-11) now excludes overlay (`validateRootPlugin`). Live-verified: soft-nav opens the plugin as a dialog over the current page (which stays mounted), sub-routes stay in the dialog, Esc/scrim dismiss via `router.back()`, hard load renders the full page. **Post-merge fixes (`@sovereignfs/manifest` → 0.7.0, `@sovereignfs/ui` → 0.3.0):** intra-overlay tab links switched to `<Link replace>` so a single dismiss closes the dialog instead of stepping back through stacked tab-history entries (resolved RFC 0001 open question 4); plugin-declared dialog size via the optional manifest `shellConfig.overlaySize` (`sm`/`md`/`lg`, default `lg`; resolved in `runtime/src/overlay.ts`, RFC 0001 open question 2); and the `Dialog` now renders fixed-size boxes (width+height per size, content scrolls inside) so it no longer resizes as content changes between tabs. A later fix (`@sovereignfs/ui` → 0.4.0, `runtime` → 0.9.1) offsets the `Dialog` scrim's left edge by the `--sv-dialog-inset-left` CSS var — the shell feeds it the sidebar width (`--sv-shell-sidebar-width`, `0` on mobile) on `.shell` so overlay dialogs start at the sidebar's right edge and leave the rail visible/usable. SRS §3.8/§3.9, CON-11 (merged to `main`).
- ✅ Task 0.5.11 — Logout / self sign-out (AUTH-02/ACC-11; `@sovereignfs/sdk` → 0.9.0, `runtime` → 0.9.0): `sdk.auth.signOut()` posts to better-auth `/api/auth/sign-out` (with `Origin` + an empty JSON body so the request carries `Content-Type`). A runtime logout route (`POST /api/account/logout`) signs out, clears both `better-auth.session_data` cache-cookie variants (`maxAge 0`) so the next request re-verifies immediately (no stale window up to `cookieCache` `maxAge`), then 303-redirects to `/login?signedout=1`. Shell chrome gains a keyboard-accessible avatar popover menu (Account + Log out; `aria-expanded`, Esc, click-outside) in both the sidebar and mobile header, replacing the bare avatar link; the Account → Security current-session row gains Log out (Revoke stays for other sessions, ACC-06). Both logout controls are plain form POSTs (work without JS); `/login` shows a signed-out notice on `?signedout=1`. SRS AUTH-02/ACC-11 (merged to `main`).
- ✅ Task 0.5.15 — Security hardening, Tier 0 + Tier 1 (RFC 0008; `runtime` → 0.10.0, `@sovereignfs/db` → 0.7.0, `apps/auth` → 0.5.0): security response headers on both apps — static set (`X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, **HSTS prod-only**) via `next.config.ts`, plus a **strict nonce-based `Content-Security-Policy`** set per-request in middleware (runtime extends the session middleware; `apps/auth` gains a dedicated one). No `'unsafe-inline'` for scripts: Next's inline scripts use the per-request nonce; the runtime's fixed pre-paint theme script (extracted to `runtime/src/theme-script.ts`) is allowed by a **CSP hash** (drift-guarded), keeping the root layout static so the PWA `/offline` fallback still prerenders; `apps/auth` forces dynamic rendering so the nonce applies. Tier 1: Postgres connects over TLS from `sslmode` in the connection string (`pgSslMode`, CA via `PGSSLROOTCERT`); new `docs/security.md` (threat model + no-telemetry guarantee + hardening checklist) and TLS/HSTS + Postgres-SSL notes in `docs/self-hosting.md`. At-rest/field-level/E2EE (Tiers 2–4) remain deferred to Task 1.0.01. SRS §3.17, NFR-02/07/08 (merged to `main`).
- ✅ Task 0.5.16 — Test organization (RFC 0010): all 36 test files moved from flat co-location into per-directory `__tests__/` folders; root `__tests__/{integration,e2e,visual}/` scaffold added (README placeholders); `vitest.config.ts` `include` globs updated to `**/__tests__/**/*.test.{ts,tsx}` patterns (anchored to avoid generated plugin copies under `runtime/app/`); `test:unit`/`test:integration`/`test:e2e` scripts added; CLAUDE.md + CONTRIBUTING.md updated. `pnpm test` discovers all tests unchanged; `*.pg.test.ts` env-gating preserved (merged to `main`).
- ✅ Task 0.5.18 — Registry contribution process (`@sovereignfs/manifest` → 0.8.0): new `registry/plugins.json` (public discovery index — distinct from the internal `runtime/generated/registry.ts`; `{ registryVersion, plugins[] }`). **Each entry is a thin record `{ id, repository: { type: git|path, url }, name, description, tags? }` — a pointer to the source plus display metadata, NEVER a copy of the manifest. The manifest stays authoritative in the plugin's own repo and is fetched from the source at install time (consistent with `scripts/install-plugins.ts` + `sv plugin add`, which already reference plugins by `{ id, repository }` and derive the manifest from the clone). Never embed a manifest in the registry — it would drift.** The registry lists only third-party plugins (built-in platform plugins ship in-repo, have no standalone source, and are never registered); the array starts empty and grows by submission. Each entry carries `{ id, repository: { type: git|path, url, ref? }, name, description, author, license, homepage?, keywords?, provenance? }`. New `registryEntrySchema` + `validateRegistryEntry` in `@sovereignfs/manifest` (reused by `registry/__tests__`, the validation script, and future tooling — `generate-registry` filters, `sv plugin add <id>`). **Validation pipeline:** `scripts/validate-registry.ts` (`pnpm registry:validate` write mode / `pnpm registry:check` verify-only) clones each entry's source at the pinned ref, validates the source `manifest.json` (must be valid, `sovereign`/`community`, `id` matching) + a `LICENSE` file, computes a **sha256 content hash over the source tree**, and records `provenance: { commit, contentHash, validatedAt }` on the entry. Authors run `registry:validate` and commit the provenance; **CI re-verifies via a dedicated `.github/workflows/registry-validate.yml` job gated by `paths: ['registry/**']`** so it runs only on registry changes (`pnpm registry:check` fails on a missing/stale hash). Pure helpers (`hashTree`, `parseArgs`, `provenanceMatches`) unit-tested in `scripts/**tests**`; the git clone path is the side-effecting part. `registry/CONTRIBUTING.md`+ a directory-based`.github/PULL_REQUEST_TEMPLATE/registry-submission.md`(the single`PULL_REQUEST_TEMPLATE.md`stays the default; the registry one is`?template=registry-submission.md`) + `docs/plugin-development.md`"Submitting to the registry" document the flow;`registry/**tests**/registry.test.ts`structurally validates every entry (wired into`vitest.config.ts`) (merged to `main`).
- ✅ Task 0.5.19 — Stable SDK and semver commitment (`@sovereignfs/sdk` → 1.0.0; NFR-04): SDK API review — the v1 surface is `auth`/`db`/`mailer`/`platform` (stable, semver-guaranteed) vs `data`/`storage`/`notifications`/`events`/`activity` (experimental/reserved, throw `NotImplementedError`, **not** covered by the guarantee); `index.ts` JSDoc now delineates the two groups. New `docs/sdk-stability.md` (patch = no breaking, minor = additive, major = breaking + migration in `docs/upgrade.md`; same discipline for `@sovereignfs/ui`) linked from the README, and `packages/sdk/CHANGELOG.md` with the 1.0.0 entry. **npm distribution** (dependency-free typed contract; the private-`db`/`mailer` blocker) is deliberately deferred to the paired Task 0.5.20 (RFC 0023) — 0.5.19 declares the API stable, 0.5.20 makes it installable (merged to `main`).
- ✅ Task 0.5.20 — SDK distribution & plugin isolation boundary (RFC 0023; `@sovereignfs/sdk` → 1.1.0, `runtime` → 0.11.0). **Types-first contract — zero runtime dependencies**: `packages/sdk` no longer imports `@sovereignfs/db` or `@sovereignfs/mailer`; implementations are **host-provided** via `provideHost(host: SdkHost)` registered at startup. `runtime/instrumentation.ts` (new — Next.js startup hook) imports `runtime/src/sdk-host.ts` (new — real impls from `@sovereignfs/db`/`@sovereignfs/mailer`) under `NEXT_RUNTIME === 'nodejs'` guard. Outside the runtime, `sdk.db`/`sdk.platform`/`sdk.mailer` throw `"@sovereignfs/sdk: no runtime host is registered"`. `auth.ts` inlines `DEFAULT_TENANT_ID = 'default'` (no longer imported from db). `provideHost`/`SdkHost` exported from `index.ts` for the runtime; plugin code never calls it. SDK `package.json` drops the private-dep `dependencies`, gains matching `publishConfig.exports` (same pattern as `@sovereignfs/ui`). `noExternal`-bundle plan dropped (RFC 0023). `docs/plugin-development.md` gains a **Plugin isolation boundary** table (author/typecheck ✅, build/run ❌); `docs/sdk-stability.md` Distribution section updated; `packages/sdk/CHANGELOG.md` 1.1.0 entry. SRS RFC 0023 (merged to `main`).
- ✅ Task 0.5.21 — Plugin compatibility & versioning (RFC 0024; `@sovereignfs/manifest` → 0.9.0, `runtime` → 0.12.0). `schemaVersion` hard-gated to ≤ `CURRENT_MANIFEST_SCHEMA_VERSION` in the manifest schema; `compatibility` gains `semverString`-validated `minPlatformVersion` (hard) and optional `maxPlatformVersion` (advisory). Pure `checkCompatibility(manifest, platformVersion)` in `packages/manifest/src/compatibility.ts` (unit-tested). **Four enforcement tiers:** (1) build — `scripts/generate-registry.ts` exits 1 on hard failure, warns on advisory; (2) install — `sv plugin add` and `scripts/install-plugins.ts` (via `pnpm generate`) reject incompatible plugins; (3) boot — `runtime/src/boot-compat.ts` (called from `runtime/instrumentation.ts` `register()` under `NEXT_RUNTIME === 'nodejs'`) disables incompatible plugins via `setPluginEnabled(false)` and stores reasons in the in-memory `runtime/src/plugin-compat.ts` module; (4) registry advisory — `scripts/validate-registry.ts` logs advisory warnings for entries with `maxPlatformVersion` exceeded. `GET /api/admin/plugins` response gains `compatibilityError`/`compatibilityWarnings` per plugin; `GET /api/admin/health` gains `incompatiblePlugins[]`. Console Plugins page shows an "Incompatible" badge, tooltip with the reason, and locks the toggle for boot-disabled plugins. Registry validation logs advisory warnings. `semver` + `@types/semver` added to the pnpm catalog. `docs/plugin-development.md` gets a full `### compatibility (RFC 0024)` sub-section (sub-field table + enforcement tiers + example); `docs/self-hosting.md` gets a "Plugin compatibility" section. SRS RFC 0024 (merged to `main`).
- ✅ Task 0.5.10 — Cross-plugin data sharing (RFC 0002; `@sovereignfs/manifest` → 0.10.0, `@sovereignfs/db` → 0.8.0, `@sovereignfs/sdk` → 1.2.0, `runtime` → 0.13.0, account plugin → 0.3.0). Manifest gains optional `data.provides[]` / `data.consumes[]`; `data:provide` / `data:consume` promoted from reserved to active. DB gains `consent_grants` (soft-deleted user consents) + `data_access_log` (immutable audit trail) tables with 7 helper functions. SDK: `sdk.data.provide(contract, resolver)` stores an in-process resolver via the host; `sdk.data.query(ref, params)` reads consumer plugin ID from `x-sovereign-plugin-id` header (injected by middleware), checks consent in DB, calls resolver, logs access. Runtime: in-memory resolver registry in `sdk-host.ts`; middleware injects `x-sovereign-plugin-id` for plugin routes; `GET/POST /api/account/data-grants`, `DELETE /api/account/data-grants/[id]`, `GET /api/admin/data-grants`. Account plugin gains a **Data** tab listing active consents with per-grant revocation. `docs/plugin-development.md` documents the full provider/consumer pattern. PR #61 (pending merge).
- ✅ Task 0.5.12 — Activity log (RFC 0005; `@sovereignfs/db` → 0.9.0, `@sovereignfs/sdk` → 1.3.0, `runtime` → 0.14.0, account → 0.4.0, console → 0.5.0). `activity_log` table in both dialects with `recordActivity()`, `listUserActivity()`, `listAdminActivity()` helpers; bootstrap DDL with 3 indexes. `sdk.activity.log()` implemented via `SdkHost.activity`; runtime injects actor/plugin/tenant from request headers; action namespaced by plugin ID for plugin-sourced events. Capture points: Console user management (invite/role/deactivate), plugin enable/disable, settings changes, Account self-mutations (display name, password, session revoke, avatar). API routes: `GET /api/account/activity` (personal feed) and `GET /api/admin/activity` (platform-wide with filters). Account **Activity** tab + Console **Activity** section. `runtime/src/activity.ts` `logActivity()` — fire-and-forget wrapper for runtime routes. Login capture deferred (Edge runtime cannot write platform DB; RFC 0005 open question).
- ✅ Task 0.5.13 — Deployment & upgrade strategy (RFC 0006; `@sovereignfs/db` → 1.0.0, `runtime` → 0.15.0; platform version **held at 0.6.0** — see the frozen-platform-version policy above). Drizzle-kit migrations replace interim DDL bootstrap: `packages/db/migrations/{sqlite,postgres}/` + `drizzle.config.ts` / `drizzle.config.pg.ts` + `db:generate` script; `runMigrations(pdb)` now returns `MigrationResult`; `getLastMigrationResult()` exported for downgrade surfacing. `sv backup`/`sv restore` CLI commands (SQLite: tar of db files + avatars; Postgres: pg*dump/pg_restore + avatars). Published Docker images via `.github/workflows/publish-images.yml` (GHCR, `v*._._`tags; build-from-source fallback retained).`stop_grace_period: 30s`on both prod services. Downgrade guard:`platform_version`key in`platform_settings`compared on every startup;`GET /api/admin/health`surfaces`downgradeWarning`when running binary is older than stored DB version.`docs/upgrade.md` rewritten with step-by-step upgrade/rollback procedure. Also in this branch: Docker dev auth redirect fix (`AUTH_TRUSTED_ORIGINS`, `SOVEREIGN_AUTH_PUBLIC_URL`); prod auth port 4001; compose file comparison table in `docs/self-hosting.md`; migrations `COPY`-ed in `Dockerfile`runner stage. **Full dev / docker-dev / docker-prod verification pass fixed several bugs:** (1) migration SQL had a stray`--> statement-breakpoint`inside the leading comment → drizzle's "no statements" error (removed); (2) **both** standalone Dockerfiles now COPY`pnpm-workspace.yaml`so`findWorkspaceRoot()`resolves to`/app`after the standalone`process.chdir`— previously`auth.db`(and`sovereign.db`) landed at `/app/apps/auth/data`/`/app/runtime/data`, **outside the named volume**, so auth users/sessions did not persist across recreates and were absent from backups (pre-existing, now fixed + persistence verified); (3) `apps/auth/src/env.ts` `baseUrl`uses`||`not`??`(Compose interpolates unset`${AUTH_BASE_URL}` to `''`, which `??` ignored → empty baseURL → "Invalid origin" on prod login) and prod compose now defaults `AUTH_BASE_URL`/`SOVEREIGN_AUTH_PUBLIC_URL` to the host-reachable `localhost:${AUTH_PORT:-4001}` (`apps/auth`→ 0.5.2); (4)`sv backup` now archives the data dir with **relative paths** (`tar -C dataDir .`) capturing `-wal`/`-shm`sidecars — absolute paths broke cross-host/container restore and dropped WAL commits; (5) downgrade guard keeps the **high-water-mark** version (skips the version write on a detected downgrade) so the warning persists every startup until resolved; (6) prod named volume pinned`name: sovereign_data`so it isn't project-prefixed (docs reference it by that name). Verified end-to-end: login + session gating + CSRF enforcement (bad origin still 403), admin health, downgrade warning, backup/restore round-trip across all three modes. **A second round of testing fixed two login bugs:** (7) the middleware's unauthenticated redirect to`/login`now uses **303** (not the`NextResponse.redirect`default of 307) — a 307 preserved the method, so an unauthenticated POST to a gated route (logout form once the session lapsed, any plugin form) redirected as`POST /login` → 405; 303 forces a GET (`runtime`→ 0.15.1). The logout route also now redirects to`SOVEREIGN_AUTH_PUBLIC_URL`(browser-reachable) instead of the internal`SOVEREIGN_AUTH_URL`. (8) the auth login/register pages were `'use client'`and read`NEXT_PUBLIC_RUNTIME_URL`directly — Next inlines`NEXT_PUBLIC\*\*`at **build time**, and the Docker image builds without`.env`, so the post-login redirect was frozen to `localhost:3000` regardless of runtime env (broke prod, which runs on :4000). Fixed by resolving the runtime URL **server-side at request time** (`apps/auth/src/runtime-url.ts`reads via a computed key to dodge build-time inlining) and passing it as a prop to new client`LoginForm`/`RegisterForm` components (`apps/auth`→ 0.5.3). Prod compose now also defaults`NEXT_PUBLIC_RUNTIME_URL`to`localhost:${RUNTIME_PORT:-4000}`, and `.env.example`comments out`SOVEREIGN_AUTH_URL`/`NEXT_PUBLIC_RUNTIME_URL`so the per-environment Compose/code defaults apply (a hardcoded dev value in`.env` would otherwise leak into prod).
- ✅ Task 0.5.14 — User data portability (RFC 0007; `@sovereignfs/sdk` → 1.4.0, `@sovereignfs/manifest` → 0.11.0, `runtime` → 0.16.0, account → 0.5.0). Self-service data takeout: users download a versioned ZIP and can restore/migrate it. **Bundle format:** `manifest.json` (format version, provenance, per-section checksums) + `platform/account.json` (profile + prefs) + `platform/avatar.<ext>` + `plugins/<pluginId>/data.json` + `plugins/<pluginId>/blobs/<path>`. **ZIP layer:** `fflate` (pure-JS, no native build, zero Dockerfile change). **Plugin participation:** `sdk.portability.provideExport(resolver)` / `sdk.portability.provideImport(handler)` registered from plugin server-side code; runtime invokes only installed + enabled + permitted plugins (`data:export` / `data:import` manifest permissions). **ID remapping:** `createRemapper()` maps source IDs to fresh UUIDs for referential integrity on cross-instance import. **Import:** additive only — unknown/disabled/un-permitted sections skipped with a per-section warning in the returned JSON summary. **API routes:** `GET /api/account/export` (owner-gated, `application/zip` attachment) and `POST /api/account/import` (owner-gated, 50 MB cap). **Account Data tab:** Export button + Import file-upload + per-section result display. Activity log captures `account.data_exported` / `account.data_imported`. `docs/plugin-development.md` documents `sdk.portability` + `data:export`/`data:import` (docs-parity asserted); `docs/sdk-stability.md` updated (portability in the experimental-implemented group).
- ✅ Task 0.5.17 — Icon system (RFC 0011; `@sovereignfs/ui` → 0.5.0, `runtime` → 0.14.1). **Lucide as a curated, zero-runtime-dependency SVG set:** 26 icons generated from `lucide` (devDep only) by `scripts/generate-icons.ts` (driven by `scripts/icon-list.ts`; run via `pnpm generate:icons`); generated TSX files committed to `packages/ui/src/components/Icon/icons/`. `<Icon>` component (typed `IconName` union, `sm/md/lg` sizes via `--sv-icon-size-*` primitive tokens, `currentColor` coloring, enforced `aria-hidden`/`aria-label` a11y via discriminated union prop type, `role="img"` auto-applied for meaningful icons). `--sv-icon-size-sm/md/lg` tokens added to `primitives.css`. Chrome adoption: replaced `"S"` monogram and `"⚙"` emoji with `<Icon name="house">` / `<Icon name="settings">` in sidebar + mobile footer. Plugin-identity icons: `generate-registry.ts` copies each plugin's `icon.svg` to `runtime/public/plugin-icons/<id>.svg` (gitignored, pre-auth served); `LauncherPlugin` gains `iconUrl?`; `PluginTile` and sidebar middle section render plugin icons as `<img>` (never `dangerouslySetInnerHTML` — XSS guard per RFC 0008). Monogram fallback preserved for plugins without `icon.svg`. ISC attribution in `packages/ui/NOTICE`. Docs: `docs/design-system.md` Icon system section + icon size token row; `docs/plugin-development.md` icon usage + plugin-identity guidance.
- ✅ Task 0.5.27 — Plugin starter template & example plugins (RFC 0017; `@sovereignfs/create-plugin` → 0.1.0). **Frictionless plugin on-ramp — one canonical skeleton, three entry points:** (1) `sv plugin new <id>` scaffolds a plugin skeleton into `plugins/<id>/` (monorepo) or any `--out` dir; derived display-name, route prefix, and `workspace:*`/`catalog:` deps when inside the workspace; (2) `npm create @sovereignfs/plugin` interactive initializer in `packages/create-plugin/` — prompts for ID, name, description, route prefix, scaffolds into cwd with `latest` npm refs and a `tsconfig.json`; (3) GitHub template repo documented. **Two example plugins** committed to `plugins/` and composed automatically: `fs.sovereign.example-basic` (`/example-basic`, `shell: "default"`) demonstrates `sdk.auth.getSession()`, `@sovereignfs/ui` Button, and CSS design-token usage; `fs.sovereign.example-api` (`/example-api`) documents and implements the API provider serve-route pattern (`app/serve/[slug]/[...path]/route.ts` — activate with `apiProvider: true` in manifest). Both are `type: "platform"` (shipped in-monorepo), gitignore-allowlisted. 5 new `scaffoldPlugin` unit tests in `bin/__tests__/helpers.test.ts`. `docs/plugin-development.md` gains a "Getting started" section covering all three entry points and the example plugins. SRS RFC 0017.
- ✅ Task 0.5.23 — Test setup & seeding (RFC 0019). **In-code fixture factories** (`__tests__/fixtures/index.ts`): `makeUser()`/`makeTenant()`/`makePluginStatus()`/`makeConsentGrant()` return plain objects — no DB, no running instance required; override-friendly with `randomUUID`-based defaults. **`sv seed` command** (`scripts/seed.ts`): idempotent seed inserts two per-role test users (`admin@dev.local` / `admin-dev-password`, `user@dev.local` / `user-dev-password`) with hashed passwords via `better-auth/crypto`; works for both SQLite and Postgres (dialect-detected from `AUTH_DATABASE_URL`); **hard-blocked in production** (`NODE_ENV=production` + no `SOVEREIGN_SEED_ALLOW_PROD=true` override); calls `getPlatformDb()` to ensure platform tables are bootstrapped first. `bin/sv.ts` gains a `seed` sub-command that shells out to `scripts/seed.ts`. `CONTRIBUTING.md` documents the test users + `sv seed` usage. `SEED_USERS` exported from `scripts/seed.ts` for integration-test reuse.
- ✅ Task 0.5.22 — Plugin-scoped environment variables (RFC 0018; `@sovereignfs/manifest` → 0.12.0, `@sovereignfs/sdk` → 1.5.0, `runtime` → 0.17.0). Manifest gains an `env` field: `KEY → { description, required?, secret?, scope: 'build'|'runtime', default? }` (UPPER*CASE keys only). The platform auto-namespaces each key to `SV_PLUGIN*<SLUG>_<KEY>`(runtime) or`NEXT_PUBLIC_SV_PLUGIN_<SLUG>_<KEY>`(build; SLUG = plugin ID with`.`/`-`→`_`, uppercased). `sdk.env.get('KEY')`reads the calling plugin's namespaced var — scoped to the calling plugin via the`x-sovereign-plugin-id`request header, so a plugin cannot read another plugin's vars. Schema enforces: no`default`on`secret: true`vars (would commit the secret value to the manifest); no`secret: true`+`scope: 'build'`(NEXT_PUBLIC vars are bundled into client code). The generate script reads plugin`.env`files for dev defaults, fails on secrets in`.env`, detects namespace collisions across plugins, and emits `runtime/generated/plugin-env.ts`with`loadPluginEnv()`called at startup from`runtime/instrumentation.ts`. `toEnvSlug`/`toEnvVarName`exported from`@sovereignfs/manifest`. `docs/plugin-development.md`documents the`env`manifest field and`sdk.env` surface (docs-parity test passes). PR #70.
- ✅ Task 0.5.24 — Minimal shell mode (RFC 0014; `runtime` → 0.18.0). **`shell: "minimal"` plugins now compose and render chrome-free.** New `runtime/app/(minimal)/` route group (sibling of `(platform)`): committed `layout.tsx` (force-dynamic, `100dvh`, safe-area insets) + `minimal.module.css` + `.gitignore` (keeps layout + CSS, ignores generated segments). `generate-registry.ts`: `MINIMAL_DIR` + `MINIMAL_DIR_KEEP` constants; `composeTargets()` `shell: "minimal"` branch composes to `(minimal)/<routeSegment>` (multi-segment allowed, unlike overlay); `composePlugins()` clears stale minimal routes. `minimal` plugins remain eligible as root plugin (kiosk) — `validateRootPlugin` accepts them; explicit test confirms. Parity test asserts the three committed `(minimal)/` files are present. Nav convention documented: when minimal is root, the plugin must provide its own nav. `docs/plugin-development.md` + CLAUDE.md updated. PR #71.
- ✅ Task 0.5.25 — Mobile responsiveness & PWA hardening (RFC 0013; `@sovereignfs/ui` → 0.6.0, `runtime` → 0.19.0). **Shell mobile:** footer icon strip replaced by a single "Apps" button (Drawer) + `ActivePluginTitle` client component in the header (usePathname → longest-prefix registry match); Console added to header avatar menu for admins. **Dialog top-inset:** `--sv-dialog-inset-top` (mirrors `--sv-dialog-inset-left`) keeps the sticky header visible above the overlay sheet on mobile; shell sets it to `--sv-shell-header-height: 60px`. Dialog breakpoint unified 640px → 768px (eliminates the mismatch band). **Cross-cutting:** `100dvh` with `100vh` fallback on shell; `viewport-fit=cover` + `statusBarStyle: "black-translucent"` in root layout; mobile header `position: sticky; z-index: 101`; safe-area insets on header (top) and footer/Drawer (bottom); `--sv-touch-target-min: 44px` primitive token applied to avatar and Drawer items. **Manifest:** `display_override`, `orientation: "any"`, `categories: ["productivity"]`, `shortcuts` (Launcher + Account). **Design system:** new `Drawer` bottom-sheet primitive (focus trap, Esc+scrim dismiss, safe-area-aware, `80dvh` cap); first "Responsive & mobile" section in `docs/design-system.md`.
- ✅ Task 0.5.26 — Passkeys & TOTP MFA (RFC 0012; `better-auth` 1.6.16 `twoFactor` + `@better-auth/passkey` 1.6.19; `runtime` → 0.20.0, `@sovereignfs/auth` → 0.6.0, account plugin → 0.6.0). **TOTP:** `apps/auth/src/auth.ts` gains the `twoFactor` plugin (`issuer` from `webAuthnRpName`, `backupCodeOptions: { amount: 10 }`); enrollment calls `/two-factor/enable` (creates the TOTP secret + returns `{ totpURI, backupCodes }`) then `/two-factor/verify-totp` with the user-entered code (sets `twoFactorEnabled=true`, replaces session — the server action forwards the new session cookie via `forwardAuthCookies`). Login 2FA challenge at `apps/auth/app/login/2fa/` (TOTP + backup-code modes). **Passkeys:** `@better-auth/passkey` wired in auth.ts with `rpID`/`rpName`/`origin` from env (`AUTH_WEBAUTHN_RP_ID`, `AUTH_WEBAUTHN_RP_NAME`, `AUTH_WEBAUTHN_ORIGIN`; all default to `localhost` values for dev). Account plugin's `PasskeySection` uses `createAuthClient` with no `baseURL` (same-origin runtime call); `/api/auth/passkey/[...path]` proxy route in the runtime forwards browser requests to the auth server server-side — avoids the cross-origin `SameSite=Lax` cookie problem. `'auth'` added to `RESERVED_API_SEGMENTS` (and `runtime/app/api/auth/` dir) so the middleware doesn't mistake passkey routes for public API namespace delegation. Sign-in with passkey on the login page (`passkey.signIn` in `LoginForm`). **Admin:** Console Users page gains "Reset MFA" action (`PATCH` with `resetMfa: true`) that clears the `twoFactor` and `passkey` tables for a user. `sv user reset-mfa <email>` CLI break-glass command (`scripts/reset-mfa.ts`). **Session cookie forwarding convention:** `forwardAuthCookies(authRes)` in `plugins/account/app/actions.ts` parses the auth server's `Set-Cookie` headers and re-sets them via Next.js `cookies()` API, keeping the browser's session valid after better-auth replaces the session token during TOTP enrollment. **Docs:** `docs/self-hosting.md` WebAuthn env vars; `docs/security.md` threat model row; `docs/upgrade.md` v0.19→v0.20 notes. PR #73.
- ✅ Task 0.5.28 — Accessibility audit & a11y contract (RFC 0025; `@sovereignfs/ui` → 0.8.0). `eslint-plugin-jsx-a11y` (recommended ruleset) added to `eslint.config.ts` across all TSX; zero suppressions. **Fixes:** explicit `htmlFor`+`id` on all auth form labels (jsx-a11y can't trace through the custom `Input` wrapper); removed redundant `role="list"` from `MobileNav`; removed `autoFocus` from 2FA challenge input; Dialog + Drawer keyboard handling moved to document-level `useEffect` (removes `onKeyDown` from `role="dialog"` divs, which jsx-a11y flags as non-interactive); scrim click-dismiss switched from child `stopPropagation` to `e.target === e.currentTarget` check + `role="presentation"`. **New tokens:** `--sv-color-error-surface/text/border` (red) in light + dark, backed by `--sv-red-*` primitives. **`prefers-reduced-motion`:** OfflineBanner slide-in animation suppressed. **Docs:** `docs/design-system.md` gains error token table, WCAG AA contrast commitment, per-component a11y contract table, focus-visible and reduced-motion guidance; `docs/plugin-development.md` gains full "Accessibility" section (semantic HTML, labels, icon a11y, keyboard operability, colour independence, live regions, reduced motion, custom ARIA patterns). **SRS:** NFR-11 added (WCAG 2.1 AA for platform-owned UI).

- ✅ Task 0.5.29 — Non-Docker production deployment, Phase 1 — PM2 (RFC 0026; CLI-only change). **`sv serve` health-gate:** starts auth first, polls `GET /api/health` (derived from `SOVEREIGN_AUTH_URL`, default `http://127.0.0.1:3001`) for up to 30 s via injectable `pollUntilHealthy` before spawning the runtime; exits non-zero on timeout. **`sv setup pm2 [--dir] [--env-file] [--out]`:** generates a PM2 ecosystem config with two `apps[]` entries — `sovereign-auth` (loopback `127.0.0.1:3001`) and `sovereign-runtime` (`0.0.0.0:3000`) — pointing to the standalone `server.js` outputs; `renderPm2Config` in `bin/helpers.ts` (unit-tested). `docs/examples/pm2.example.config.js` is the canonical reference. `docs/self-hosting.md` gains a full "Non-Docker deployment (PM2)" section (build steps, static asset copy, startup, `pm2 startup`/`pm2 save`, env var differences table, data directory, upgrade procedure). SRS §3.1 updated; decision-log entry corrected (PM2 reinstated). 12 new unit tests.

- ✅ Task 0.6.01 — Platform roles & capabilities (RFC 0021; `@sovereignfs/sdk` → 1.6.0, `runtime` → 0.21.0, `apps/auth` → 0.7.0, `plugins/console` → 0.7.0). **Capability module:** `runtime/src/capabilities.ts` — 11 capabilities (`plugin:access`, `profile:manage`, `console:access`, `user:view`, `user:manage`, `plugin:manage`, `tenant:view`, `tenant:configure`, `health:view`, `activity:view`, `role:assign`), 4 role presets (`platform:owner` = all, `platform:admin` = all except `role:assign`, `platform:auditor` = read-only, `platform:user` = floor); `hasCapability(role, cap)`, `capabilitiesForRole(role)`, `requireCapabilityOrForbidden`, `CapabilityError` (14 unit tests). **Gate migration:** middleware now sets `x-sovereign-user-capabilities` header (JSON array); `route-guard.ts` uses `hasCapability(role, 'console:access')` instead of `role === 'platform:admin'`; `launcher-plugins.ts` idem; `runtime/app/(platform)/layout.tsx`, `launcher/page.tsx`, and `api/admin/data-grants/route.ts` all updated. **Auth server:** first user → `platform:owner` (was `platform:admin`); startup migration in `instrumentation.ts` promotes oldest `platform:admin` → `platform:owner` when no owner exists (upgrading pre-0.21 instances); owner PATCH-protected in `/api/admin/users/[id]/route.ts`. **SDK:** `SessionUser.capabilities: readonly string[]`; `sdk.auth.hasCapability(session, cap)` synchronous helper (stable surface). **Console:** 4 roles in Users page (`badgeOwner`/`badgeAuditor` styles), owner rows read-only ("Owner — protected"), role dropdown only shown to `role:assign` holders (owners), `user:manage` gates Invite/Deactivate/Reactivate. **Docs:** `plugin-development.md`, `sdk-stability.md`, CHANGELOG 1.6.0, `upgrade.md` v0.20→v0.21 notes.

- ✅ Task 0.6.02 — Plugin-declared capabilities (RFC 0022; `@sovereignfs/manifest` → 0.13.0). Manifest gains an optional `capabilities` field: a record of kebab-case local names → `{ description?, defaultGrant?: 'all'|'none' }`. New `pluginCapabilityName(pluginId, capName)` helper auto-namespaces to `<pluginId>:<capName>`. **Generate script** emits `runtime/generated/plugin-capabilities.ts` with `PLUGIN_CAPABILITIES` (all declarations) and `ALL_GRANTED_PLUGIN_CAPS` (pre-filtered to `defaultGrant: 'all'`). **Middleware** appends `ALL_GRANTED_PLUGIN_CAPS` to the `x-sovereign-user-capabilities` header so `sdk.auth.hasCapability(session, '<pluginId>:<capName>')` resolves auto-granted caps without a DB lookup. **v1 storage model:** `defaultGrant: 'all'` = injected by middleware; `'none'` = plugin manages grants via `sdk.db`. Enforcement is always inside the plugin — the platform route gate never checks plugin capabilities. `example-basic` demonstrates the pattern. `docs/plugin-development.md` gets a full `### capabilities (RFC 0022)` section + manifest table row.

- ✅ Task 0.7.01 — Notification Center (RFC 0015; `@sovereignfs/db` → 1.1.0, `@sovereignfs/sdk` → 1.7.0, `@sovereignfs/ui` → 0.9.0, `runtime` → 0.22.0, account → 0.7.0, console → 0.8.0). Per-user `notifications` table + `notification_prefs` table (drizzle-kit migrations for both dialects). `sdk.notifications.send(input, requestHeaders)` implemented — host-provided via `SdkHost.notifications`; runtime stamps `source`/`sourceType` from plugin ID. Bell icon + dropdown panel in chrome sidebar + mobile header (polling every 30s; toasts for new unread items); `ToastProvider`/`useToast`/`Toast` primitive added to `@sovereignfs/ui`. Account plugin gains a **Notifications** tab (mute categories, poll interval). Console plugin gains a **Broadcast** section (`POST /api/admin/broadcast`, rate-limited 60s, audience-scoped). SSE stream at `/api/account/notifications/stream`. `docs/plugin-development.md` gets `### notifications (RFC 0015)` section + `notifications:send` permission table row; `docs/sdk-stability.md` and `docs/upgrade.md` updated.

- ✅ Task 0.7.02 — Web Push notifications (RFC 0016; `@sovereignfs/db` → 1.2.0, `runtime` → 0.23.0, account → 0.8.0). `push_subscriptions` table + 6 DB helpers (drizzle-kit migrations for both dialects; bootstrap DDL parity). `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_CONTACT` env vars (optional no-default secrets — push silently disabled when absent). `runtime/src/push.ts`: `fanOutPushToUser` (respects per-user muted-category prefs, prunes 410 subscriptions) + `fanOutPushToUsers` (broadcast, bypasses prefs). `runtime/worker/index.ts`: custom SW push/`notificationclick` handler bundled via `@ducanh2912/next-pwa` `customWorkerSrc`. `GET/POST/DELETE /api/account/push-subscription` subscription management API (session-gated). Push fan-out wired into SDK host `notifications.send` and the broadcast route. Account Notifications tab gains a **Push notifications** section (browser permission request → subscribe → stored endpoint; unsubscribe; HTTPS / SW-support caveat). `docs/self-hosting.md` documents all three VAPID vars.

- ✅ Task 0.8.01 — Plugin monetization (RFC 0003; `@sovereignfs/manifest` → 0.14.0, `@sovereignfs/sdk` → 1.8.0, `@sovereignfs/db` → 1.3.0, `runtime` → 0.25.0, account → 0.9.0, console → 0.9.0). Manifest gains optional `monetization` field (`model`: `free`/`one_time`/`recurring`/`pay_what_you_want`; `interval`; `tiers[]`; `license.publicKey`); platform plugins cannot declare monetization (schema refine). Reserved `sdk.billing` stub (`getEntitlement`/`requireEntitlement`) + `EntitlementRequiredError` exported. `entitlements` table (drizzle-kit migrations for both dialects; bootstrap DDL parity) with 7 DB helpers. `runtime/src/license.ts`: offline Ed25519 token verification via Node `crypto` (JWK format, no new deps); token format `<base64url(payload)>.<base64url(sig)>`. Middleware gating mirrors disabled-plugin pattern: `fetchPaywalledPluginIds(userId)` fetches `GET /api/admin/entitlements?userId=` (admin-key-authed Node-runtime route); paywalled non-API routes → 303 to `/paywall/<pluginId>`, API routes → 402; `RouteDecision` gains `'paywall'`. Paywall page (`runtime/app/(platform)/paywall/[pluginId]/page.tsx`) shows plugin info, tier list with prices, and a license import form. `GET/POST/DELETE /api/account/entitlements` — list/import/cancel; POST accepts JSON or form data, verifies Ed25519 sig, saves entitlement, redirects on form success. `GET /api/admin/entitlements` returns all entitlements or (with `?userId=`) the paywalled plugin IDs. Account gains **Billing** tab (active entitlements, import form, past entitlements). Console gains **Entitlements** section (all-user admin view). `docs/plugin-development.md` `### monetization (RFC 0003)` section + manifest table row; `docs/sdk-stability.md` `sdk.billing` added to reserved surface; `docs/upgrade.md` v0.24→v0.25 entry. No Stripe/gateway in v1 — manual signed-token flow only.

- ✅ Console license generator + operator key management (RFC 0003 Phase 1 follow-up; `@sovereignfs/db` → 1.4.0, console → 0.11.0). `platform:owner` users generate Ed25519-signed license tokens inside the Console without any external tool. Three additions: (1) **In-browser keypair generation** via `crypto.subtle.generateKey({ name: 'Ed25519' })` — public key displayed for copying into the plugin manifest, private key auto-filled into the signing field. (2) **Server-side key storage** via `GET/POST/DELETE /api/admin/license-keys` (admin-key-authed), which stores the private `d` scalar in `platform_settings` under `license_private_key:<pluginId>`. The page loads stored keys at render time and pre-fills the field on any device or browser — no re-pasting. `deletePlatformSetting` added to `packages/db`. Priority chain on field restore: instance storage → `sessionStorage` (same-tab fallback) → empty. (3) **Field source indicators**: "Stored on instance" badge (accent-coloured) with a Remove button; "Saved for this session" note with a Clear button for the sessionStorage case; "Save to instance" button when the current key is not yet stored. The private key is never sent to the server as part of token generation — signing runs entirely in `crypto.subtle`.

- ✅ Fix: `generate-registry.ts` copy-first compose order — eliminates intermittent 404s for plugin routes in dev. The old clear-then-copy sequence (`rmSync` all route dirs then `cpSync`) left a window where Next.js's dev route scanner found routes absent and served 404. Node's `fs.watch` on macOS fires spurious FSEvents (no real file change), so this happened randomly during normal dev sessions. Fixed by copying active plugin routes first (overwriting existing content atomically), tracking the first-level segment each plugin occupies, then deleting only stale dirs belonging to removed plugins. Active routes are never absent at any point in the cycle.

- ✅ RFC 0003 Phase 2 docs — `docs/rfcs/0003-plugin-monetization.md` extended with a **Phase 2 — Automated payment collection** section (bank transfer + admin confirmation flow, Stripe/PayPal webhook pattern via the public API namespace, `sdk.billing.grantEntitlement()` server-side seam, `payment_requests` DB table spec, updated SDK surface table). `docs/roadmap.md` gains Task 1.0.09.

- ✅ License generator bug fixes + DB-first key resolution (RFC 0003 follow-up; `runtime` → 0.25.1, console → 0.12.0). **Three bugs fixed:** (1) Silent "Generate token" failure — `crypto.subtle.importKey` with mismatched JWK `d`/`x` throws a DOMException with empty `.message` in Chrome/Brave, so `setGenError('')` rendered nothing; fixed by using `generatedPubKey || selectedPlugin.publicKey` as `x` so the matching pair is always used, and adding a non-empty fallback error string. (2) "Signature verification failed" after generating a new keypair — the new `x` was not propagated to the verifier because `storedPublicKeys` wasn't threaded into the warning condition; fixed by adding `&& generatedPubKey !== storedPublicKeys[pluginId]` so the "stale manifest" warning clears once the instance already has the matching public key. (3) Public key inaccessible after keypair panel dismissed — panel content was only visible when `showKeygen = true`; now the key and a copy button appear inline in the warning when `showKeygen = false`. **DB-first public key resolution (`resolvePluginPublicKey` in `runtime/src/license.ts`):** both entitlement verify routes (`POST /api/account/entitlements`, `POST /api/admin/entitlements`) now resolve the verification key from `platform_settings` (`license_public_key:<pluginId>`) first, falling back to the manifest — so operators can rotate keys from the Console UI without rebuilding or redeploying Docker images. `GET/POST/DELETE /api/admin/license-keys` stores/returns both private and public keys; `saveLicenseKeyAction` and `loadStoredKeys()` updated accordingly. **Example-monetized plugin:** badge now queries the `entitlements` table via `sdk.db.getClient()` for the authenticated user's active tier (dialect-agnostic: SQLite BetterSQLite3 `db['all']` vs. Postgres `db['execute']`), replacing a hardcoded "Pro tier active" string; CSS token fixed from undefined `--sv-color-accent-foreground` → `--sv-color-text-on-accent`. **New `docs/troubleshooting.md`** — covers overlay plugin 404 on cold start (lazy compilation race, hard-reload workaround), intermittent dev 404s from spurious FSEvent recompiles (syncDir fix history), persistent 404 after removing a plugin (stale composed routes, `pnpm generate` fix), and a Docker/production reference. Linked from `README.md` docs index.

- ✅ Task 0.8.02 — Per-plugin database (RFC 0004; `@sovereignfs/db` → 1.5.0, `@sovereignfs/sdk` → 1.9.0, `runtime` → 0.26.0). `database: "isolated"` in the manifest gives a plugin its own dedicated store: SQLite → `data/plugins/<pluginId>.db`; Postgres → `plugin_<slug>` schema (`CREATE SCHEMA IF NOT EXISTS`, `search_path` on Pool connect). New `packages/db/src/plugin-client.ts`: `getPluginDb()` lazy client registry, `provisionPluginDb()` (idempotent), `dropPluginDb()` (deletes SQLite files or `DROP SCHEMA CASCADE`), `pluginMigrationsFolder()`. Migration runner gains `runPluginMigrations(pluginDb, folder)` routing each plugin's `migrations/{sqlite,postgres}/` to its dedicated store. `sdk.db.getClient()` reads `x-sovereign-plugin-id` from request headers and passes it to the host; the host consults the registry for `database: "isolated"` and returns the dedicated client (provisions on first call). Runtime `instrumentation.ts` runs per-plugin migrations at startup for all installed isolated plugins. `sv plugin remove` reads the manifest before deletion and drops the isolated store (with `--keep-data` opt-out). SRS §3.7/§4.6/§5 updated. `docs/plugin-development.md` gains a full `### Isolated database` section.

- ✅ Task 0.9.01 — E2E golden-path test suite (Playwright). Wires `@playwright/test` as the browser-automation layer. `playwright.config.ts` — dual `webServer` (auth `:3001`, runtime `:3000`), `globalSetup`, Chromium-only CI, `workers: 1` (serialised against shared SQLite), `retries: 1` (absorbs Next lazy-compilation 404s on overlay routes). `__tests__/e2e/global-setup.ts` — seeds test users via `pnpm sv seed`, saves multi-origin storage state for admin + user (single Playwright context captures both `:3001` session-token + `:3000` session_data cache cookies), generates Ed25519 keypair for paywall spec and stores the public key via admin API. `__tests__/e2e/fixtures.ts` — `adminPage`/`userPage` Playwright test fixtures. 20 golden-path tests in 6 spec files: `auth` (login/wrong-password/logout/redirect), `launcher` (grid/navigation/chrome exclusion), `account` (profile/display-name/theme), `console` (admin access/403/plugin-list/user-list), `navigation` (root rewrite/brand link/avatar menu), `paywall` (redirect/tier display/token import). `.github/workflows/e2e.yml` — CI job on `push: main` with `paths` filter (source code only). `docs/testing-e2e.md` — local run guide and coverage/deferred table. `test:e2e` script now runs `playwright test`; Vitest unchanged (`exclude: ['__tests__/e2e/**']` added defensively). `playwright.config.ts` and `__tests__/e2e/**` excluded from ESLint.

- ✅ Task 1.0.08 — Storybook for the design system (`@sovereignfs/ui`). Storybook 10 (`@storybook/react-vite`); Storybook versions pinned in the `storybook` pnpm named catalog; `.storybook/main.ts` + `.storybook/preview.ts` (token imports, themes + a11y + viewport addons, dark-mode via `withThemeByDataAttribute`). Stories: Token Gallery (all `--sv-*` tiers — colours, space, typography, radius, icon sizes, shadows, read live from `getComputedStyle`), Button (all variant × size, disabled, icon-leading, icon-only, AllVariants grid), Input (text/email/password, disabled, error state with `aria-invalid`), Icon (decorative vs meaningful, all sizes, AllIcons grid), Dialog (`sm`/`md`/`lg`/`full`, play function opens + asserts), Drawer (mobile viewport, play function). `build-storybook` task in `turbo.json` + root convenience scripts; `storybook-static/` gitignored + prettier-ignored + eslint-ignored; `storybook-build` CI job uploads static output as artifact. `docs/design-system.md` gains "Component stories (Storybook)" section.

- ✅ Task 1.0.02 — Production dev-mode & diagnostics (RFC 0020; `runtime` → 0.27.0). **Three independently useful pieces:** (1) **Per-request dev-mode switch**: `SOVEREIGN_DEV_MODE_ENABLED=true` + `X-Sovereign-Dev-Mode-Secret` header activates dev-mode for that request only; middleware validates the secret (against `SOVEREIGN_DEV_MODE_SECRET` ?? `SOVEREIGN_ADMIN_KEY`), forwards `x-sovereign-dev-mode: 1` to Node runtime, and stamps `x-sovereign-dev-mode: active` on the response (RFC 0020 "visibly flagged" requirement). `runtime/src/db.ts` rewritten from a bare re-export to a context-aware wrapper: reads the forwarded header via `next/headers()` and returns a lazily-initialized mock DB client (`SOVEREIGN_DEV_DATABASE_URL`, managed in `runtime/src/dev-db.ts`) instead of the real one — falls back to real DB outside request context (boot, tests). `sdk.db.getClient()` is transparent: sdk-host now imports `getPlatformDb` from `@/src/db` instead of `@sovereignfs/db` directly, so plugin DB calls also resolve to the mock DB in dev-mode. Activation logged to stdout (Edge middleware can't write DB). Auth sessions are not mocked (v1 data-only scope per RFC open question). (2) **Structured logger** (`runtime/src/logger.ts`): `LOG_LEVEL`-controlled (error/warn/info/debug; default `warn`), newline-delimited JSON to stdout/stderr — Node.js only, never Edge. No egress; `docs/security.md` documents the logging vs telemetry distinction. (3) **Richer `/api/admin/health`**: adds `database.migrationVersion`, `plugins.installed`/`adminOnly`, and `diagnostics.{logLevel, devModeEnabled}` to the report. New env vars: `LOG_LEVEL`, `SOVEREIGN_DEV_MODE_ENABLED`, `SOVEREIGN_DEV_MODE_SECRET`, `SOVEREIGN_DEV_DATABASE_URL` — all documented in `.env.example` and `docs/self-hosting.md`. SRS RFC 0020.

- ✅ Task 1.0.03 — White-labeling Phase 1 (RFC 0027; `@sovereignfs/db` → 1.6.0, `@sovereignfs/ui` → 0.10.0, `@sovereignfs/sdk` → 1.10.0, `runtime` → 0.28.0, `plugins/console` → 0.12.0). `tenant_branding` table (dialect-aware Drizzle schema + drizzle-kit migrations `0004_tenant_branding` for both dialects; `getTenantBranding` / `setTenantBranding` helpers with server-side hex validation as CSS injection guard; bootstrapped by `platformBootstrapStatements()`). `--sv-brand-logo` / `--sv-brand-logo-dark` / `--sv-brand-favicon` CSS custom properties in `packages/ui/src/tokens/semantic.css` (separate namespace from `--sv-color-*` — hold URLs, not colours; theme-stable). `BrandProvider` server component (`runtime/src/brand-provider.tsx`) reads `tenant_branding` (merged over `BRAND_*` env defaults), renders a `<style>` block injecting `--sv-brand-*` tokens and (if `brandPrimary` set) `--sv-color-accent` / `--sv-color-accent-hover` (HSL lightness delta, `ACCENT_HOVER_LIGHTNESS_DELTA = 8`, clamped); wired into `(platform)/layout.tsx` via render-prop, shell header shows brand logo image or initial monogram. Brand API routes: `GET/POST/DELETE /api/brand/logo[?dark=1]` + `GET/POST/DELETE /api/brand/favicon` (excluded from middleware session gate — must load on login page); `GET/PATCH /api/admin/tenant-branding` (admin-key-authed, used by Console PATCH and Phase 2 auth proxy). `RESERVED_API_SEGMENTS` gains `'brand'` (dir-parity test passes). `sdk.platform.getConfig()` returns `brandName` (falls back to `tenantName`) and `brandPrimaryColor?` (validated hex or undefined). Console Settings page gains a **Branding** section (brand name, primary colour, logo/favicon URL fields, logo/favicon file upload forms). Seven `BRAND_*` env vars added to `.env.example` and `docs/self-hosting.md`. `docs/design-system.md` Brand identity tokens section. `docs/plugin-development.md` `getConfig()` branding fields. `docs/upgrade.md` v0.27→v0.28 migration notes. `packages/sdk/CHANGELOG.md` 1.10.0 entry.

- ✅ Console plugin install/remove UX — replaced the copy-CLI-command pattern with a real two-step server-side flow. **"Add a plugin" panel:** user enters a Git repo URL → "Check" fetches `manifest.json` from the raw GitHub/GitLab/Gitea URL server-side, validates required fields, and shows a preview card (name, id, version, description, type); "Install" then calls `pnpm sv plugin add <url>` via `execSync` and `revalidatePath`. **"Remove" button:** opens a native `<dialog>` confirm (auto-sized, no fixed height) and calls `pnpm sv plugin remove <id>` server-side. Platform-plugin guard changed from a hardcoded `PLATFORM_PLUGIN_IDS` set to `plugin.type === 'platform'` so new platform plugins are automatically protected. Server actions live in `plugins/console/app/plugins/install-actions.ts`; `@sovereignfs/manifest`/`@sovereignfs/db` imports replaced with inlined helpers to satisfy the SDK boundary ESLint rule.

⏳ **Next: Task 0.9.0 — Instance identity rename (RFC 0032).** Branch from up-to-date `main`.

Keep this file current: update the Status section as tasks complete, and add any
new load-bearing convention that future sessions must not violate.
