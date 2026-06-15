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
- `docs/sovereign-implementation-tasks.md` — The build plan: ~22 sequenced
  tasks (v0.3 → v0.4 → v0.5 → v1.0). Each task = one branch = one PR.

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
- **Commits** end with the trailer (model-agnostic — do not use a specific
  model name, as multiple models may contribute to one task):
  `Co-Authored-By: Claude Code <noreply@anthropic.com>`
- **PRs** target `main`; body ends with the Claude Code attribution line.
  Describe what changed and why, and cite relevant SRS sections — but no task
  numbers.
- **Merge strategy: rebase and merge** (never squash, never create a merge
  commit). Keeps history linear — each task's commit lands on `main` verbatim.
- **Fix commit messages BEFORE merging the PR.** Once a squash-merge lands on
  `main`, correcting it means rewriting/force-pushing `main` — avoid that.
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

  The **platform version** in the root `package.json` tracks the roadmap
  milestones (v0.3.x → v0.4.x → v0.5.x → v1.0.x). Bump it when a phase
  milestone is reached.

## Code quality

Established in Task 0.3.03. Every package and PR must comply — no exceptions.

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
  `runtime/src`. ESLint enforces this (established in Task 0.3.03, verified in
  Task 0.3.08). Plugins use `packages/sdk` only.
- **Every package/app extends `packages/tsconfig`** (`base`/`nextjs`/`library`),
  established in Task 0.3.02. Easy to forget on new packages.
- **Manifests are validated at build time.** Invalid manifest = failed build.
- **Plugin tables are slug-prefixed** (`tasks_lists`, `splitify_groups`).
  Single shared schema, no per-plugin DBs in v1.
- **`tenant_id` everywhere** on user-scoped tables from day one (future
  multi-tenancy), even though no multi-tenant logic exists in v1.
- **DB is dialect-agnostic** (Drizzle): SQLite default, Postgres via env only.
  No SQLite-specific SQL in app code.
- **The platform data layer is async** (Task 0.5.03). Postgres (node-postgres)
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
  **`shell: overlay` (RFC 0001, Task 0.5.09) composes TWICE:** the full-page
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
  centred; on mobile every size is a full-screen sheet.
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
  via `selectLauncherPlugins`; `sdk.db` replaces this fetch in Task 0.5.05.
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
- **Production images build from Next.js standalone output** (Task 0.5.02).
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
  `./data` bind mount (runs as root). The relative SQLite path resolves against
  cwd (`/app`) because `findWorkspaceRoot()` falls back to cwd when no
  `pnpm-workspace.yaml` ancestor exists — the standalone case.

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
`tsup` (package bundler, ESM only) · Vitest + Testing Library / jsdom (tests) ·
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
pnpm test               # run Vitest across the repo (co-located *.test.ts)
pnpm test:watch         # Vitest in watch mode
pnpm install:plugins    # clone sovereign/community plugins declared in sovereign.plugins.json
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
  (AUTH-05, Task 0.5.05b). The auth server enables better-auth's **signed cookie
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
  remain bounded by `maxAge`.

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
- ✅ Task 0.5.07 — CI pipeline: `.github/workflows/ci.yml` (PR-only — `pull_request` against `main` + `workflow_call`, **no push trigger**; every job skips while the PR is a draft and runs on `ready_for_review`/subsequent pushes via `if: github.event_name != 'pull_request' || github.event.pull_request.draft == false`) with six jobs — `format`/`lint`/`typecheck`/`generate-validate`/`build`/`test`. The `test` job wires a **Postgres 16 service** + `TEST_DATABASE_URL` so the env-gated `*.pg.test.ts` parity suites run (not skipped). Shared toolchain setup is a composite action (`.github/actions/setup`). `.github/workflows/publish.yml` publishes on per-package tags (`sdk-v*.*.*` → `@sovereignfs/sdk`, `ui-v*.*.*` → `@sovereignfs/ui`), gated by reusing `ci.yml` via `workflow_call`; needs the `NPM_TOKEN` repo secret. **`@sovereignfs/ui` npm packaging finalised** (deferred from 0.3.07): `package.json` `publishConfig` repoints `exports`/`types` to `dist/` on publish (workspace dev still uses `src`), and `tsup.config.ts`'s `onSuccess` copies CSS into `dist/` (CSS Modules flattened by basename to match esbuild's bundled imports — unique per `<Component>.module.css`, build fails on a basename collision; token CSS keeps its tree). **Caveat:** `@sovereignfs/sdk` is not yet npm-installable — its `dist` imports the `private` `@sovereignfs/db`/`@sovereignfs/mailer`; making sdk publishable (bundle via `noExternal`, or publish those deps) is a separate follow-up before any `sdk-v*` tag (merged to `main`).
- ✅ Task 0.5.08 — Public `/api` namespace delegation (PLT-16; `runtime` → 0.7.0, `@sovereignfs/manifest` → 0.5.0): manifest gains an optional `apiProvider` flag + a shared `findApiProvider(manifests)` resolver; the generate script fails the build if two plugins declare it. The runtime splits `/api/*` into reserved runtime segments (`account`/`admin`/`health`/`plugins`, in `RESERVED_API_SEGMENTS`, guarded by a dir-parity test) and the public namespace `/api/<slug>/*`, which the middleware handles **before** the session gate — rewriting to the provider's `<routePrefix>/serve/<slug>/<path>` (preserving query string) or returning 404 when no enabled provider is installed. Pure logic in `runtime/src/api-namespace.ts` (unit-tested). SRS PLT-16 (merged to `main`).
- ✅ Task 0.5.09 — Overlay shell mode (RFC 0001; `@sovereignfs/manifest` → 0.6.0, `@sovereignfs/ui` → 0.2.0, `runtime` → 0.8.0): `shell` enum gains `overlay`; new `@sovereignfs/ui` `Dialog` primitive (scrim + panel, sizes, Esc/scrim-click dismissal, focus trap, mobile full-screen sheet; `--sv-color-scrim` + `--sv-shadow-overlay` tokens). The runtime hosts a `@modal` parallel-route slot **inside `(plugins)`** (committed `(plugins)/layout.tsx` + `@modal/{default,layout}.tsx`); the generate script composes overlay plugins twice (full-page fallback + `@modal/(.)<routePrefix>` interception copy). Console + Account migrated to `shell: overlay`. Root-plugin eligibility (CON-11) now excludes overlay (`validateRootPlugin`). Live-verified: soft-nav opens the plugin as a dialog over the current page (which stays mounted), sub-routes stay in the dialog, Esc/scrim dismiss via `router.back()`, hard load renders the full page. **Post-merge fixes (`@sovereignfs/manifest` → 0.7.0, `@sovereignfs/ui` → 0.3.0):** intra-overlay tab links switched to `<Link replace>` so a single dismiss closes the dialog instead of stepping back through stacked tab-history entries (resolved RFC 0001 open question 4); plugin-declared dialog size via the optional manifest `shellConfig.overlaySize` (`sm`/`md`/`lg`, default `lg`; resolved in `runtime/src/overlay.ts`, RFC 0001 open question 2); and the `Dialog` now renders fixed-size boxes (width+height per size, content scrolls inside) so it no longer resizes as content changes between tabs. SRS §3.8/§3.9, CON-11 (merged to `main`).
- ⏳ Next: Task 0.5.10 — Cross-plugin data sharing (consent-gated, RFC 0002; `[future]`). Branch from an up-to-date `main`.
- ⏳ Spec complete: Shell sidebar three-section architecture (PLT-11–PLT-15, SRS updated).
- ⏳ Spec complete: Plainwrite sovereign plugin (`docs/plugins/plainwrite.md`, v0.2 — provider + SSG adapters).
- ⏳ Spec complete: API Composer sovereign plugin (`docs/plugins/api-composer.md`) — GUI API builder, `/api` namespace (PLT-16, Task 0.5.08).
- ⏳ Spec complete: PaperTrail sovereign plugin (`docs/plugins/papertrail.md`) — legacy plugin adapted to the v3 native model (repo: `kasunben/PaperTrail`).

Keep this file current: update the Status section as tasks complete, and add any
new load-bearing convention that future sessions must not violate.
