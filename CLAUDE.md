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
- `docs/roadmap.md` — Chronological task index (version → epic task ID → status).
  Full task detail lives in `docs/epics/`. Each task = one branch = one PR.

**Task workflow** — how to start, implement, and complete a task (including the
`CURRENT_TASK.md` mechanism and epic task IDs): `docs/development-workflow.md`.

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
- **Epic task IDs (`<epic>.<seq>`, e.g. `9.9`) are permanent stable identifiers.**
  Use them in doc cross-references, RFC `incorporated_into_plan` fields, and task
  dependency lists. **Roadmap slot versions (e.g. `0.9.2`) are volatile** — they
  reflect current priority ordering and may shift when tasks are reprioritized.
  Always look up the live slot from `docs/roadmap.md` rather than hard-coding it in
  docs; include slots only where shipping order matters (upgrade notes, version maps).
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
  to the CLAUDE.md Status section, and add a `⏳ Next: <title> → epic task [X.Y](<path>)`
  line at the end of the Status section so the next session knows immediately
  what to start without re-reading the roadmap. **Do not include the roadmap slot
  in this line** — the slot is looked up live from `docs/roadmap.md` by `task-start`.
  Never leave the Status section without a "⏳ Next" marker — if a PR completes
  the last task in a phase, point at the first task of the next phase.
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

  The **platform version** in the root `package.json` tracks roadmap
  milestones — **each completed task bumps the minor version; patch versions
  are reserved for ad-hoc bug fixes and hotfixes between tasks; a single jump
  to `1.0.0` marks the public release.** The current version is **`0.9.4`**
  (phases 0.3–0.9 tasks complete, patch .4 from hotfixes). The
  downgrade guard, plugin compatibility gates (RFC 0024), and `/api/admin/health`
  all read this value; see `docs/upgrade.md` for the runtime version map and
  v1.0.0 release checklist.

  **Per-package versions are independent of the platform version.** Internal,
  private packages (`@sovereignfs/db`, `runtime`, `auth`, `manifest`, `mailer`,
  plugins) follow normal semver tied to the change type above and **may cross
  `1.0.0`** on a breaking change — their versions are internal, not the
  user-facing product version (e.g. `@sovereignfs/db` is `1.0.0`). The published
  packages **`@sovereignfs/sdk`** (already `1.x`, the stable contract) and
  **`@sovereignfs/ui`** follow their own public semver per NFR-04 and are
  **exempt** from the platform's "stay under v1" rule.

## Naming conventions

**"Plugin" is the architectural term; "app" is the presentational term.**

| Context                                                    | Term to use | Examples                                                               |
| ---------------------------------------------------------- | ----------- | ---------------------------------------------------------------------- |
| Code, types, APIs, DB schema, manifests, CLI               | **plugin**  | `PluginEntry`, `plugin.id`, `routePrefix`, `sv plugin add`             |
| User-facing UI strings, labels, placeholders, empty states | **app**     | "Search apps…", "No apps found", "App navigation", "Apps" drawer title |
| Documentation for plugin _developers_                      | **plugin**  | Plugin development guide, SDK docs, manifest reference                 |
| Documentation or UI visible to _end users_                 | **app**     | Launcher tiles, search overlay, mobile footer aria-labels              |

This split is intentional: internally "plugin" is the precise technical term for an installable module; externally "app" is what users understand. Never use "plugin" in a string the end user reads — it is a developer concept. This applies to all future shell chrome, Console user-facing copy, and any in-app help text.

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

## Hard architectural rules — critical violations

The most likely rules to be accidentally broken. Full reference with context: `docs/architecture-rules.md`.

- **SDK boundary (ESLint enforced):** plugins must not import from `runtime/src`; use `@sovereignfs/sdk` only.
- **SDK zero-deps:** `packages/sdk` must not import `@sovereignfs/db` or `@sovereignfs/mailer`. Implementations are host-provided via `provideHost()` in `runtime/instrumentation.ts` → `runtime/src/sdk-host.ts`.
- **Extend `packages/tsconfig`:** every new package/app must extend `base`/`nextjs`/`library`.
- **Platform data layer is always async:** always `await getPlatformDb()`, `await getConfig()`, and all `packages/db` helpers — even on SQLite.
- **No secrets with defaults:** `AUTH_SECRET`, `SOVEREIGN_AUTH_SECRET`, etc. must throw on startup if unset.
- **Never `NEXT_PUBLIC_*` for runtime-varying values:** Next.js inlines these at build time; Docker images build without `.env`, so the value is frozen to its fallback regardless of what's in the container's env.
- **Middleware `/login` redirect must be `303` not `307`:** 307 preserves the HTTP method — an unauthenticated POST redirects as `POST /login` → 405. Also target `SOVEREIGN_AUTH_PUBLIC_URL` (browser-reachable), never the internal `SOVEREIGN_AUTH_URL`.
- **Intra-overlay navigation must use `<Link replace>`:** dialog is dismissed with `router.back()` — push-based navigation stacks history and a single back only closes one tab, not the dialog.
- **Never `'unsafe-inline'` in `script-src`:** CSP is nonce-based; the pre-paint theme script uses a hash (`THEME_SCRIPT_CSP_HASH`). Run `applyCsp` on every middleware return path.
- **CSP `form-action` must include the auth origin:** the logout form POST 303-redirects cross-origin to `SOVEREIGN_AUTH_PUBLIC_URL`; `'self'` alone silently blocks it.
- **`'use client'` components: never read browser globals in `useState` initializer or render** — causes hydration mismatches. Initialise to a safe value, read in `useEffect`.
- **Never add `runtime/app/api/*` segment without updating `RESERVED_API_SEGMENTS`** in `runtime/src/api-namespace.ts` — the dir-parity test will fail CI.
- **Profile self-mutations must clear both `session_data` cookie variants** (`better-auth.session_data` and `__Secure-better-auth.session_data`, `maxAge: 0`) — otherwise the cached name/avatar stays stale for up to 300s.
- **Never drop `pnpm-workspace.yaml` COPY from Dockerfiles** — `findWorkspaceRoot()` uses it to resolve `/app`; without it, SQLite files land outside the named volume and data is lost on container recreate.
- **Plugin tables are slug-prefixed** (`tasks_lists`, `splitify_groups`); add `tenant_id` to every user-scoped table.
- **`session.freshAge: 0` in `apps/auth/src/auth.ts`** — don't re-enable without a re-auth flow (regression test asserts this).
- **Server-to-server calls to better-auth must send `Origin` header** equal to `SOVEREIGN_AUTH_URL` — CSRF check rejects originless POSTs with 403.

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
colours directly. The semantic colour layer is the theming surface that instance
theming (CON-08) and dark mode override at `:root` / `[data-theme]`; primitives
stay fixed. The scale tokens (`--sv-space-*`, `--sv-radius-*`,
`--sv-font-size-*`) have no separate semantic tier — they are theme-stable and
used directly. See `docs/design-system.md` for the full model. The v1 identity
is **monochrome** (accent = near-black on light, near-white on dark); an instance
admin adds colour by overriding `--sv-color-accent`.

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
- Dark mode and instance theming work by swapping semantic token values at `:root`;
  no component changes required.

### Storybook hygiene (enforced per-PR)

`packages/ui` is the public design system contract — Storybook is its living
documentation. Whenever a task touches anything under `packages/ui/src/`:

- **New component** → add a story file `packages/ui/src/stories/<Name>.stories.tsx`
  covering at least the default state and one variant; add the component to the
  **Component Gallery** section of `DesignSystemOverview.stories.tsx`.
- **New or renamed token** → add or update the token in `TokenGallery.stories.tsx`
  _and_ in the relevant color/scale section of `DesignSystemOverview.stories.tsx`.
- **Component API change** → update the matching story's args/controls to reflect
  the new props; update the import snippet in `DesignSystemOverview.stories.tsx`
  if the public API visible there changed.
- **After any of the above** → run `pnpm --filter @sovereignfs/ui typecheck` to
  verify the stories are type-correct. The CI `storybook-build` job enforces a
  clean build on every PR.

The rule is: the story must reflect reality, not the state the component was in
when the story was first written. Stale stories are silent lies in documentation
that plugin developers will trust.

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

## Desktop app (post-v1 plan)

Desktop is out of scope for v1 but the approach is decided — do not treat it as
an open question or suggest alternatives.

**Model:** Universal Tauri shell app — direct `.dmg`/`.exe` download. On first
launch the user enters their self-hosted instance URL. The app loads it in a
WebView. All Sovereign functionality is served by the user's instance and runs
unchanged. Multiple instances supported. Same model as the mobile shell and the
same pattern as Nextcloud, Bitwarden, and Element desktop clients.

**Shell:** Tauri 2.x (TypeScript shell logic; system WebView — WKWebView on macOS,
WebView2 on Windows, WebKitGTK on Linux; ~5 MB binary). Lives in a separate
`sovereign-desktop` repository. macOS ships first; Windows and Linux follow with
the same codebase.

**Distribution:** Direct download via GitHub Releases (`.dmg`, `.exe`/`.msi`,
`.AppImage`/`.deb`). Mac App Store deferred.

**Device API tiers — same three-tier model as mobile:**

1. **Web APIs** — work natively in the system WebView. Use these first.
2. **Tauri plugins** — for native capabilities beyond Web APIs: system tray,
   OS notifications, keychain, deep links, auto-updater. Added post-v1 as needed.
3. **`sdk.device.*`** — the SDK abstraction plugin developers call. Detects
   environment (`"desktop"`), routes to the correct tier.

**Plugin developers use `sdk.device.*` only.** No plugin changes required when
the desktop shell launches.

See RFC 0038 and SRS §3.19 for the full specification.

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
pnpm test:all           # unit → integration → e2e in sequence (local full-suite run)
pnpm kill-port          # kill any process listening on port 3000 or 3001 (frees dev ports)
pnpm install:plugins    # clone sovereign/community plugins declared in sovereign.plugins.json
pnpm registry:validate  # fetch + validate registry/plugins.json entries, write content-hash provenance
pnpm registry:check     # verify-only (no write) — CI runs this on registry/ changes
```

## Dev DX notes

- **No manual rebuilds in dev.** `pnpm dev` runs `scripts/dev.ts`: composes plugins, starts the generate watcher, and runs `next dev` on `:3000`. HMR handles all subsequent changes.
- **Package changes → instant HMR.** All workspace packages are in `transpilePackages` in both `next.config.ts` files. Next.js compiles source directly — no `tsup --watch`.
- **Plugin changes → HMR via re-copy.** `scripts/dev.ts` runs generate in `--watch` mode; an edit under `plugins/[id]/app/` re-copies into the route group and Next hot-reloads. Plugins are copies, not symlinks — Next's dev watcher does not follow symlinks.
- **tsup is production-only** — not part of the dev pipeline. It runs during `pnpm build` to emit `dist/` for Docker/npm.
- **Profile self-mutations must clear both `session_data` cookie variants** (`better-auth.session_data` + `__Secure-better-auth.session_data`, `maxAge: 0`). The session cache is 300s; without clearing it, the chrome still shows the old name/avatar until it expires. Done in `runtime/app/api/account/avatar/route.ts` and `plugins/account/app/actions.ts`.
- **Middleware verifies sessions offline** via better-auth's signed cookie cache (`session.cookieCache`, 300s, HMAC key = `SOVEREIGN_AUTH_SECRET ?? AUTH_SECRET`), then falls back to `GET /api/verify`. Forward better-auth's `Set-Cookie` on cache miss so the cache self-refreshes. The runtime service needs `AUTH_SECRET` in every compose file.
- **Account profile page reads authoritative session** with `GET /api/auth/get-session?disableCookieCache=true` — plain `get-session` honours the cache and returns a stale value after a self-edit.

> For local dev setup, email (Mailpit), and Docker Compose details: see `CONTRIBUTING.md`.

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

✅ **Phases 0.3–0.9 complete** — monorepo scaffold · shared packages (db, manifest, mailer, ui, sdk) · auth server · runtime · Docker (dev + prod) · console/launcher/account plugins · `sv` CLI · PWA · Postgres validation · SDK stability + distribution · overlay/minimal shell modes · security headers + nonce CSP · CI pipeline · registry + contribution process · versioning · session verification · cross-plugin data sharing · activity log · Drizzle-kit migrations + backup/restore · user data portability · icon system · plugin templates · test seeding · plugin-scoped env vars · mobile responsiveness · MFA (TOTP + passkeys) · accessibility audit · PM2 deployment · platform roles + capabilities · plugin-declared capabilities · notification center · web push · plugin monetization (Ed25519 tokens, entitlements, license generator) · per-plugin database · E2E golden-path suite · Storybook · production dev-mode + diagnostics · white-labeling Phase 1.

✅ **Recent completions:**

- Task 0.8.02 — Per-plugin database (RFC 0004; `@sovereignfs/db` → 1.5.0, `@sovereignfs/sdk` → 1.9.0, `runtime` → 0.26.0). `database: "isolated"` manifest field gives a plugin its own SQLite file or Postgres schema; `sdk.db.getClient()` provisions and returns the dedicated client; migrations run per-plugin at boot; `sv plugin remove` drops the store unless `--keep-data` is passed.
- Task 0.9.01 — E2E golden-path test suite (Playwright; 20 tests in 6 spec files: auth, launcher, account, console, navigation, paywall). `playwright.config.ts` with dual `webServer`, global setup seeds users + keypair, `adminPage`/`userPage` fixtures. `.github/workflows/e2e.yml` CI job.
- Task 1.0.08 — Storybook for the design system (`@sovereignfs/ui`). Storybook 10 (`@storybook/react-vite`); stories for Token Gallery, Button, Input, Icon, Dialog, Drawer. `storybook-build` CI job.
- Task 1.0.02 — Production dev-mode & diagnostics (RFC 0020; `runtime` → 0.27.0). Per-request dev-mode switch via `SOVEREIGN_DEV_MODE_ENABLED` + header secret; context-aware `runtime/src/db.ts` routes to mock DB in dev-mode; structured `LOG_LEVEL` logger; richer `/api/admin/health` response.
- Task 1.0.03 — White-labeling Phase 1 (RFC 0027; `runtime` → 0.28.0). `instance_config` table (was `tenant_branding`) + `InstanceProvider` server component; `--sv-instance-logo/dark/favicon` tokens + `--sv-color-accent` override from hex; instance API routes (`/api/instance/*`); Console Instance identity section; `sdk.platform.getConfig()` returns `instanceName`/`instancePrimaryColor`.
- Console plugin install/remove UX — real two-step server-side flow (fetch manifest preview → confirm install via `sv plugin add`; confirm remove via `sv plugin remove`). Platform-plugin guard uses `plugin.type === 'platform'`.
- Task 0.9.0 — Instance identity rename (RFC 0032; `@sovereignfs/ui` → 0.11.0, `@sovereignfs/sdk` → 1.11.0, `@sovereignfs/db` → 1.7.0, `runtime` → 0.29.0). Pure rename: `BRAND_*` env vars → `INSTANCE_*`, `--sv-brand-*` tokens → `--sv-instance-*`, `brandName`/`brandPrimaryColor` → `instanceName`/`instancePrimaryColor`, `tenant_branding` table → `instance_config`, `BrandProvider` → `InstanceProvider`, `/api/brand/` routes → `/api/instance/`.
- Task 0.9.1 — User data deletion (RFC 0033; `@sovereignfs/sdk` → 1.12.0, `@sovereignfs/db` → 1.7.1, `runtime` → 0.30.0, `plugins/account` → 0.10.0, `plugins/console` → 0.12.2). `sdk.portability.provideDelete()` stable surface; `deleteUserData()` DB helper; `runtime/src/user-deletion.ts` cascade (plugins parallel + 30 s timeout → platform rows → avatar → better-auth user removal); `DELETE /api/account` (password re-verification, sole-owner 409); `DELETE /api/admin/users/[id]?deleteData=true`; Account → Data delete section with dialog; Console → Users Delete… button; `?accountDeleted=1` login notice.
- Task 4.3 — Notification Center pluggable pub/sub transport (RFC 0034; runtime → 0.31.0). NOTIFICATION_TRANSPORT env var (polling/sse/redis); NotificationBroker interface + InProcessBroker (EventEmitter) + RedisBroker (ioredis optional dep); SSE stream route rewired to subscribe to broker; notifications GET response gains transport field; NotificationBell switches to EventSource in sse mode with 3-error fallback to polling; GET /api/admin/health gains notifications.{transport,brokerConnected}; docker-compose.prod.yml gets commented Redis service block; docs/self-hosting.md gets Notification transport section.
- Task 2.13 — Sidebar customization — plugin ordering and visibility (`@sovereignfs/db` → 1.7.2, `runtime` → 0.32.0, `plugins/account` → 0.11.0). `sidebar_plugins` JSON column in `account_prefs` (SQLite + Postgres, migration 0006); `GET /api/account/sidebar-plugins` returns available plugins + current saved order; `PATCH /api/account/prefs` extended to accept `sidebar_plugins`; `(platform)/layout.tsx` applies user's saved order and visibility server-side before rendering sidebar and `MobileNav`; `SidebarControl` client component in Account → Preferences (HTML5 DnD reorder, show/hide toggle, reset).
- Task 1.10 — Email-bound invite flow (`apps/auth` → 0.9.0, `plugins/console` → 0.13.0). `invited_by_id`/`invited_by_name` columns added to `invites` table; invite creation embeds `?token=<uuid>` in the registration URL; register page server component looks up the token and passes `invitedEmail`/`invitedBy` to `RegisterForm`; email field is pre-filled and read-only when token present; "invited by" banner shown; invalid/consumed tokens show a clear error page.
- RFC 0039 — Instance identity: `instanceId` + terminology cleanup (`@sovereignfs/db` → 1.7.3, `@sovereignfs/sdk` → 1.13.0, `runtime` → 0.33.0, `plugins/console` → 0.14.1). Stable UUID seeded in `platform_settings` at bootstrap, exposed via `sdk.platform.getConfig().instanceId`. Capability strings renamed: `tenant:view` → `instance:view`, `tenant:configure` → `instance:configure`. Activity event renamed: `settings.tenant_name_changed` → `settings.instance_name_changed`. Console "Tenant name" label → "Instance name". Storybook + docs "tenant theming" → "instance theming" where it refers to instance-level overrides.

> Full task history (phases 0.3–0.7): `docs/task-history.md`

⏳ **Next: Test-user flag on seeded accounts → epic task [1.11](epics/users-auth.md#111--test-user-flag-on-seeded-accounts).** Branch from up-to-date `main`.

Keep this file current: update the Status section as tasks complete, and add any
new load-bearing convention that future sessions must not violate.
