# CLAUDE.md

Guidance for Claude Code working in this repository.

## What this is

**Sovereign** — a modular, self-hostable workspace runtime. A shared platform
(auth, DB, email, UI) hosts installable **plugins** as first-class apps. The
plugin system _is_ the product, not an app extended with plugins. Open source,
privacy-first, single-tenant/multi-user in v1.

## Source of truth

These shared docs define project state and workflow. Read the relevant sections before any task —
they are authoritative over assumptions:

- `docs/sovereign-proposal-plan-srs.md` — Concept, Plan, Architecture, SRS,
  manifest reference, decision log.
- `ROADMAP.md` — Chronological task index (version → epic task ID → status).
  Full task detail lives in `docs/epics/`. Each task = one branch = one PR.

**Task workflow** — how to start, implement, and complete a task (including the
`CURRENT_TASK.md` mechanism and epic task IDs): `docs/development-workflow.md`.

**Multi-agent model** — how Claude Code and Codex divide work, commit attribution,
and the decision log behind these conventions: `docs/multi-agent.md`.

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
  Always look up the live slot from `ROADMAP.md` rather than hard-coding it in
  docs; include slots only where shipping order matters (upgrade notes, version maps).
- **Commits** end with the Claude Code attribution trailer (model-agnostic — do not use a specific model name):
  `Co-Authored-By: Claude Code <noreply@anthropic.com>`
- **PRs** target `main` and are always created as GitHub drafts first with
  `gh pr create --draft`; mark ready for review only after explicit developer
  instruction. PR bodies end with:
  `🤖 Generated with [Claude Code](https://claude.com/claude-code)`
  Describe what changed and why, and cite relevant SRS sections — but no task numbers.
- **Multiple agents may work this repo** — see `docs/multi-agent.md` for the full model. Each agent uses its own clone. Commit trailers identify which agent authored the work.
- **Merge strategy: rebase and merge** (never squash, never create a merge
  commit). Keeps history linear — each task's commit lands on `main` verbatim.
- **Fix commit messages BEFORE merging the PR.** Once a commit lands on `main`, correcting it means rewriting/force-pushing `main` — avoid that.
- **When a task is done, update `ROADMAP.md` and the matching
  `docs/epics/<file>.md` task heading in the same PR.** Mark both ✅. Do not
  duplicate completion history in `CLAUDE.md`. The next task is assigned by the
  developer at session start, not inferred from a pointer in this file.
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
  to `1.0.0` marks the public release.** The current version is **`0.43.0`**
  (all pre-v1 roadmap tasks through slot `0.13.0` complete; subsequent minor
  bumps track post-slot tasks such as the admin-managed external provider config,
  the RFC 0065 plugin catalog/access-policy work, private plugin repositories
  via access token, RFC 0068's export completeness hardening, required
  email verification at registration/login (a scoped implementation of RFC
  0035's email-verification flow via better-auth's native support — see that
  RFC's "Current state" section), RFC 0042's public plugin page routes
  (`publicRoutes` manifest field), Console-managed SMTP settings for
  platform:owner (epic task 3.30, combining the admin-managed external
  provider config's encrypted-secret pattern with the invite-only toggle's
  dual-write-across-services pattern), and RFC 0062's plugin mailer permission
  enforcement and `sdk.email.sendToUser()` surface, and patch versions cover
  UI additions and production hotfixes — most recently the 2026-07-19 fix for
  plugin visibility/enable defaults, see RFC 0065's changelog). The
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

  **Version-bump commit subjects and release tags use the same identifier.**
  Root `package.json` releases use `vX.Y.Z`. Package releases use the package
  slug plus version: `ui-vX.Y.Z`, `docs-vX.Y.Z`, `sdk-vX.Y.Z`,
  `runtime-vX.Y.Z`, `auth-vX.Y.Z`, and the same `<slug>-vX.Y.Z` pattern for
  other package tags.

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
- **A quick-entry input that commits on Enter must also commit on blur**, via `useCommitOnEnterOrBlur` (`@sovereignfs/ui`). iOS's native keyboard-accessory Done/checkmark only fires a `blur`, never a keydown or form submit — an Enter-only handler silently drops typed input. Exception: a field inside a form with its own always-visible submit button (login, payment) should NOT commit on blur. See `docs/plugin-development.md`'s "Committing quick-entry input".
- **`touch-action`'s effective value is the intersection of an element's own value and every ancestor's**, not independently scoped. Declaring narrower values (e.g. `pan-y`) on nested perpendicular scroll containers (e.g. inside a `pan-x` carousel) can cancel both axes instead of routing between them — fix nested-scroller conflicts without touching `touch-action` on the nested pair.
- **Never make the service worker's `pages`/`pages-rsc`/`pages-rsc-prefetch` cache entries stale-serving** (`StaleWhileRevalidate`/`CacheFirst`) — Sovereign's pages are per-user SSR, so replaying a cached document risks showing a stale/different user's shell after logout/login. Keep them `NetworkFirst`; bound worst-case latency with `networkTimeoutSeconds` + `fallbacks.document` instead (`runtime/next.config.ts`). Full detail: `docs/architecture-rules.md`.

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
- **DS-first: plugins are consumers.** Reusable UI/UX capability — interaction
  hooks (long-press, double-tap, `useIsMobile`), overlay surfaces, secondary
  headers, motion, controls — is implemented in `packages/ui` (or the runtime
  shell for shell chrome) and consumed by plugins, never implemented
  plugin-locally "to be promoted later". React-coupled UI utilities belong in
  `@sovereignfs/ui`, not the SDK. Full statement: `docs/design-system.md`
  Design principles; rule detail: `docs/architecture-rules.md`.

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
apps/
  auth/             better-auth wrapper (the only separate Next.js app)
  docs/             VitePress documentation site (@sovereignfs/docs, private)
packages/
  tsconfig/         shared TS configs (base/nextjs/library) — extend these
  db/               Drizzle client factory + schema + migration runner
  manifest/         manifest schema, types, validation
  mailer/           SMTP abstraction (no-op when unconfigured)
  ui/               shared component library + design tokens
  sdk/              plugin↔platform contract (types + impls)
  create-plugin/    `npm create @sovereignfs/plugin` scaffolder — published
runtime/            Sovereign Core (Next.js shell, middleware, registry, SDK bridge)
  generated/        built from manifests — never hand-edit, gitignored (run `pnpm generate`)
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
- `packages/create-plugin` → `@sovereignfs/create-plugin` — **published**
  (`npm create @sovereignfs/plugin` scaffolder; ships a `create-plugin` bin).
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
existing products). Only `sdk`, `ui`, and `create-plugin` ever reach npm.

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
pnpm design:tokens:check # verify --sv-* token refs resolve + no hardcoded colour literals in packages/ui, runtime/app, plugins/*/app
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
  `pnpm-workspace.yaml` (`typescript`, `tsup`, `react`, `next`, `@types/node`,
  …). Every package references them as `"typescript": "catalog:"` /
  `"tsup": "catalog:"` — never a literal version. This stops `pnpm add` from
  floating one package onto a different major (it once pulled TS 6 into a
  single package, and separately let `@types/node` drift to a new major via
  an unpinned transitive peer range, cascading into a 2000+ line
  `pnpm-lock.yaml` diff for an unrelated change). When adding a dependency
  that's already in the catalog, reference it with `catalog:`; when adding a
  _new_ shared dep, add it to the catalog first rather than pinning a literal
  version in just one package.
- **Run `pnpm install --frozen-lockfile` for routine installs** (after a
  `git pull`, before running tests/build) — reserve a bare `pnpm install` for
  when you're intentionally adding, removing, or bumping a dependency. A
  non-frozen install re-resolves the whole dependency graph, and if any
  transitive package has a loose/unpinned peer range, it can silently pull
  in a newer major and rewrite `pnpm-lock.yaml` far beyond what your actual
  change touched — this is what caused the `@types/node` drift above. If
  `pnpm-lock.yaml` shows unexpected changes after a routine install, treat it
  as a signal something's unpinned that should be, not something to shrug
  off and commit anyway.
- **Exception: after cloning a `.local` plugin** (via `pnpm install:plugins`,
  `./setup.sh`, or a manual `git clone … plugins/<name>.local`), `--frozen-lockfile`
  will always fail — the plugin is a new workspace project (matched by the
  `packages:` glob in `pnpm-workspace.yaml`) with dependencies the committed
  lockfile has never seen, and it always will, because `.local` plugins are
  gitignored by design (`docs/plugin-development.md`) and never enter the
  committed lockfile. This is expected, not lockfile drift. Run a bare
  `pnpm install` once to resolve it locally, then don't commit the resulting
  `pnpm-lock.yaml` diff — check `git diff pnpm-lock.yaml` before committing
  anything else and make sure it's scoped to your intended change, not
  leftover `.local`-plugin entries.

## Status

Current platform version: **`0.43.0`**. All roadmap tasks through slot `0.13.0` are complete; later minor bumps track post-slot tasks and patch versions are hotfixes.

For the full task history and current roadmap position, see:

- `ROADMAP.md` — canonical task queue and completion record
- `docs/task-history.md` — detailed history for phases 0.3–0.7

**The next task is assigned by the developer at session start.** Read `ROADMAP.md` to find the next pending task, then ask the developer which one to pick up — do not assume.

Keep this file current: add any new load-bearing convention that future sessions must not violate. Do not add task completion entries here — that belongs in `ROADMAP.md`.
