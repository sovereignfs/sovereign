# CLAUDE.md

Guidance for Claude Code working in this repository.

## What this is

**Sovereign** — a modular, self-hostable workspace runtime. A shared platform
(auth, DB, email, UI) hosts installable **plugins** as first-class apps. The
plugin system _is_ the product, not an app extended with plugins. Open source,
privacy-first, single-tenant/multi-user in v1.

## Source of truth

Read the relevant sections before any task — they are authoritative over assumptions:

- `docs/sovereign-proposal-plan-srs.md` — concept, plan, architecture, SRS,
  manifest reference, decision log.
- `ROADMAP.md` — chronological task index (version → epic task ID → status).
  Full task detail lives in `docs/epics/`. Each task = one branch = one PR.
- `docs/development-workflow.md` — how to start, implement, and complete a task
  (`CURRENT_TASK.md`, epic task IDs).
- `docs/multi-agent.md` — how Claude Code and Codex divide work, commit attribution.
- `docs/architecture-rules.md` — full detail behind every hard rule listed below.

**Research precedes RFCs.** An open-ended architectural or strategic question
with no concrete design gets a research doc in `docs/research/` (findings,
options, recommendation) before an RFC. A documented "not now" is a valid
outcome. See `docs/research/README.md` and `docs/documentation-structure.md`.

## Working conventions

- **One task at a time.** Implement a single task, verify its review checklist,
  then stop for human review. Do not start a task on an unmerged PR.
  _Workstream legs_ (`docs/workstreams/`) are the exception: one leg = one
  branch = one PR = one review gate; run every task in the leg uninterrupted,
  verify, open a draft PR, stop. One version bump per leg.
- **Tasks are sequenced** — each depends on the previous unless tagged `[parallel]`.
- **Branch per task, cut from an up-to-date `main`** (`git switch main && git pull`).
  Name by change type: `feat/<slug>`, `fix/<slug>`, `docs/<slug>`, `chore/<slug>`.
  _(Post-v1.0.0, `main` becomes production and `dev` the integration branch.)_
- **Doc task numbers (e.g. `0.3.02`) are local tracking only** — never in branch
  names, commit messages, or PR titles/bodies. **Epic task IDs (`9.9`) are
  permanent** — use them in doc cross-references and dependency lists.
  **Roadmap slot versions (`0.9.2`) are volatile** — look them up in `ROADMAP.md`,
  never hard-code them in docs.
- **Commits** end with `Co-Authored-By: Claude Code <noreply@anthropic.com>`
  (model-agnostic — never a specific model name).
- **PRs** target `main`, are created with `gh pr create --draft`, and are marked
  ready only on explicit instruction. Bodies describe what changed and why, cite
  SRS sections, carry no task numbers, and end with
  `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- **Merge strategy: rebase and merge** — never squash, never a merge commit.
  **Fix commit messages before merging**; never rewrite `main`.
  **Never merge automatically** — wait for instruction or ask.
- **On task completion, update `ROADMAP.md` and the task heading in
  `docs/epics/<file>.md` in the same PR** (both ✅). If the task advances an
  RFC, update that RFC's `Status:` line and its row in `docs/rfcs/README.md`
  too — these don't update automatically (nine RFCs were once found stale,
  one for a feature already shipped _and retired_). Use `Implemented` once
  every incorporated task is ✅, `Partially implemented (reason)` otherwise,
  `Retired`/`Superseded` with a pointer if removed or replaced.
- **Per-task narrative goes in the PR body and the task's `docs/epics/` note,
  not in this file.** This file gains a new bullet only when a task surfaces a
  genuinely new, reusable rule. Historical release narrative is archived in
  `docs/task-history.md`.
- **Verify before claiming done.** Run the review-checklist commands and show
  the output. `pnpm typecheck` never compiles composed plugin route files
  (`runtime/tsconfig.json` excludes them, and plugins have no `typecheck`
  script) — any change under a plugin's `app/` also needs
  `pnpm --filter runtime build`. A regression test is only trusted after it
  has been seen to fail against the pre-fix code.
- **Flag Docker-config impact immediately.** A new/renamed env var, port,
  on-disk path, native dep, or anything affecting `next build`/standalone
  output means updating `Dockerfile`, `apps/auth/Dockerfile`,
  `docker-compose*.yml`, `.dockerignore` in the same turn.
- **Docs are part of the change.** Manifest schema (`packages/manifest`), SDK
  surface (`packages/sdk`), or env var (`.env.example`) changes update
  `docs/plugin-development.md` / `docs/self-hosting.md` in the same PR.
  `runtime/src/__tests__/docs-parity.test.ts` enforces the enumerable parts
  one-directionally (`.env.example` → docs); every `process.env` read in either
  app must also be declared (or commented out) in `.env.example` — that
  direction is convention, not tested.
- **Version bumps are part of the PR**, semver by change type: `fix/` → patch,
  `feat/` → minor, breaking → major plus a `docs/upgrade.md` note, `chore/` /
  `docs/` → none unless a public API changed.
  - **Root `package.json`** is the platform version: each completed task bumps
    minor; patches are hotfixes between tasks; a single jump to `1.0.0` marks
    public release.
  - **Internal packages** (`db`, `runtime`, `auth`, `manifest`, `mailer`) follow
    normal semver independently and may cross `1.0.0`.
  - **`@sovereignfs/sdk` and `@sovereignfs/ui`** are published contracts (NFR-04):
    a patch never contains a breaking change; breaking needs at least a minor
    bump plus a migration note. Adding a required member to `SdkHost` counts as
    breaking (minor, not patch).
  - **Plugins version only their `manifest.json`.** `package.json` stays pinned
    at `0.0.0` forever — for platform plugins, example plugins, and everything
    the scaffolds produce.
  - Tags/commit subjects: root `vX.Y.Z`; packages `<slug>-vX.Y.Z`
    (`ui-`, `sdk-`, `runtime-`, `auth-`). The public docs site is built from
    the separate `sovereignfs/sovereignfs` repo (`docs/repositories.md`).

## Naming conventions

**"Plugin" is the architectural term; "app" is the presentational term.**

| Context                                                    | Term       |
| ---------------------------------------------------------- | ---------- |
| Code, types, APIs, DB schema, manifests, CLI               | **plugin** |
| User-facing UI strings, labels, placeholders, empty states | **app**    |
| Documentation for plugin _developers_                      | **plugin** |
| Documentation or UI visible to _end users_                 | **app**    |

Never use "plugin" in a string an end user reads.

## Code quality

Prettier (single quotes, semicolons, trailing commas `all`, width 100, 2-space)
is the single formatting authority; ESLint 9 flat config + `typescript-eslint`
(recommended + strict) + `eslint-config-prettier` for linting; `simple-git-hooks`

- `lint-staged` pre-commit; `.editorconfig` baseline.

* **Never disable ESLint rules inline** without an explanatory comment; never
  disable the SDK boundary rule.
* **Prefix intentionally-unused identifiers with `_`** — the only sanctioned
  way to keep an unused binding.
* **Never add per-package Prettier overrides.** One config for the monorepo.
* **No Biome.** ESLint is required for the custom SDK-boundary rule.
* `pnpm format:check` and `pnpm lint` must pass before every PR (hook + CI).

```bash
pnpm format          # write formatting fixes
pnpm format:check    # CI check
pnpm lint            # ESLint
pnpm lint:fix        # ESLint with auto-fix
```

## Hard architectural rules — critical violations

The rules most likely to be broken by accident. Full context and history for
each: `docs/architecture-rules.md`.

### Boundaries and contracts

- **SDK boundary (ESLint):** plugins never import `runtime/src` or `@/*`; use
  `@sovereignfs/sdk`. `plugins/console` is the one documented exception for
  `runtime/src` only — it still may not import `@sovereignfs/db`/`manifest`/`mailer`.
- **SDK zero-deps:** `packages/sdk` never imports `@sovereignfs/db` or
  `@sovereignfs/mailer`; implementations arrive via `provideHost()` in
  `runtime/instrumentation.ts` → `runtime/src/sdk-host.ts`. A new `SdkHost`
  member also needs stubs in the five hand-rolled mock hosts under
  `packages/sdk/src/__tests__/`.
- **`packages/ui` components are framework-agnostic** — never import
  `next/navigation`/`next/link`; active state and links come from the consumer
  (`item.active`, `renderLink`).
- **Extend `packages/tsconfig`** (`base`/`nextjs`/`library`) in every package/app.
- **Plugin tables are slug-prefixed** (`tasks_lists`); every user-scoped table
  has `tenant_id`.
- **A plugin declaring `data:import` must register `sdk.portability.provideImport()`**
  (and `data:export` ↔ `provideExport()`); a missing handler is silently skipped
  on restore, not an error.
- **SDK permission checks reject a missing plugin id** — never fall back to a
  placeholder like `'unknown'` that launders it through.
- **`sdk.device.getSurface()` / `x-sovereign-surface` is a presentation hint**,
  never a security boundary — gate authorization by session/capability/permission.
- **A `schedules`/`jobs`/`events` handler is imported from its real source file**
  (`plugins/<dir>/app/...`), never its composed symlink copy — module
  resolution from the symlink silently breaks any dep not redeclared in
  `runtime/package.json`.
- **Never commit a third-party plugin's deps to `runtime/package.json` or
  `plugin-deps.json`.** Hoisting (RFC 0057) runs per checkout via
  `sv plugin add`, `scripts/install-plugins.ts`, and `pnpm dev`'s `.local` sync.
- **`bin/backup-restore.ts` / `bin/sv-backup-cli.ts` never import `runtime/src`**
  — they bundle dependency-free into `runtime/dist-cli/` for the `runner` image
  (`bin/tsup.config.ts` `noExternal`, pure-JS deps only).
- **Composed route pruning is recursive and consistency-checked** — check the
  active-entry set _before_ the `page.tsx` heuristic, or a plugin's own route
  groups false-positive as orphans.
- **Never add a `runtime/app/api/*` segment without updating
  `RESERVED_API_SEGMENTS`** (`runtime/src/api-namespace.ts`).

### Data layer

- **Platform data layer is always async:** `await getPlatformDb()`,
  `await getConfig()`, every `packages/db` helper — even on SQLite.
- **Relative SQLite paths resolve against the workspace root** (nearest
  `pnpm-workspace.yaml`), duplicated deliberately in `packages/db` and
  `apps/auth/src/db.ts`.
- **`apps/auth` reads the same `DB_DIALECT`/`POSTGRES_DB_URL` as the platform**
  (no separate auth URL) and gets its own `sovereign_auth` schema/namespace; it
  duplicates dialect resolution rather than importing `@sovereignfs/db`.
- **Every isolated-mode Postgres plugin needs its own `migrationsTable`**
  (`pluginMigrationsTableName(id)`) — drizzle's tracker lives in a fixed
  `drizzle` schema regardless of `search_path`. Never apply this to SQLite plugins.
- **A shared/isolated plugin needs a separate `pgTable` schema file** using
  plain `integer` for booleans/timestamps, never native `boolean`/`bigint`.
- **Session-scoped Postgres primitives (advisory locks, GUCs, temp tables) run
  on one pinned client** (`pdb.db.$client.connect()`), never independent calls
  on the pool — a leaked `pg_advisory_lock` hung every restart in production.
  In `.pg.test.ts` never `DROP SCHEMA "drizzle" CASCADE`; scope cleanup to the
  tables the file created, and keep identifiers under 63 bytes.
- **node-postgres returns `bigint` and `COUNT(*)` as strings** from raw
  queries — coerce with `Number()` before comparing.
- **`packages/db/src/bootstrap.ts` is a second hand-written schema** for
  `instance_config`/`backup_jobs` — a new column is three edits (both dialect
  schemas, migration, bootstrap), or CI's bare-Postgres run fails.
- **drizzle-kit can't `generate` a rename non-interactively** — hand-author both
  dialects' migration + snapshot, then verify with `drizzle-kit check` and a
  no-op `drizzle-kit generate`.
- **A storage object with `ownerUserId` set is unreadable from job/schedule
  handlers** (their `userId` is always `null`) — omit `ownerUserId` for objects a
  background handler reads, accepting it's then invisible to the
  account-deletion sweep.
- **At-rest encryption (RFC 0071) was retired**; nothing in the live server
  path reads `SOVEREIGN_DB_ENCRYPTION_KEY`. Only `sv db migrate-to-postgres`
  keeps the primitives, to read a legacy encrypted source.

### Auth, security, middleware

- **No secrets with defaults:** `AUTH_SECRET`, `SOVEREIGN_AUTH_SECRET`, etc.
  throw on startup if unset.
- **Middleware `/login` redirect is `303`, never `307`** (307 turns a POST into
  `POST /login` → 405), targeting `SOVEREIGN_AUTH_PUBLIC_URL`, never the
  internal `SOVEREIGN_AUTH_URL`. Run `applyCsp` on every middleware return path.
- **`runtime/middleware.ts` runs on the Edge runtime** — no Node built-ins, no
  `ioredis`, no DB writes.
- **Never `'unsafe-inline'` in `script-src`** (nonce-based CSP; the pre-paint
  theme script uses `THEME_SCRIPT_CSP_HASH`). **`form-action` must include the
  auth origin** or the cross-origin logout POST is silently blocked.
- **Server actions authorize inside the action**: `await sdk.auth.requireSession()`
  plus an explicit `hasCapability()` for every mutation — a `'use server'`
  function is a public POST endpoint regardless of the page's `adminOnly` gate.
  A read-only action a lesser role's page legitimately renders must not demand
  a mutation capability (it crashes the page for that role).
- **`/api/admin/*` authenticates with `checkAdminKey()` only** — middleware
  skips this path, so `x-sovereign-user-*` headers there are caller-supplied;
  never read them. `checkAdminKey()` uses `timingSafeEqual` on length-checked
  buffers, backed by a per-IP failed-attempt limiter (`admin-rate-limit.ts`).
- **A signed-download route's token lives in its own `[token]` path segment**,
  and its middleware exemption must actually be in the `matcher` array — a doc
  comment claiming one is not proof (both bugs shipped in the backup route).
- **Server-to-server calls to better-auth send `Origin` = `SOVEREIGN_AUTH_URL`**
  or the CSRF check returns 403.
- **`session.freshAge: 0`** in `apps/auth/src/auth.ts` — don't re-enable without
  a re-auth flow (regression test asserts this).
- **Profile self-mutations clear both `session_data` cookie variants**
  (`better-auth.session_data`, `__Secure-better-auth.session_data`, `maxAge: 0`).
- **Invite-only is dual-written; the auth-server copy is authoritative.**
  Registration never reads the platform DB.
- **Never interpolate a request-derived value into a shell command** — use
  `execFileSync` with an argv array; resolve against a server-side allowlist.
  Git credentials for spawned `git` go through env (`GIT_ASKPASS`,
  `GIT_SSH_COMMAND` with a `0600` temp identity, removed in `finally`), never argv.
- **Service-to-service trust reuses `apps/relay`'s signed HMAC-SHA256 token**
  pattern — never invent a new mechanism per service pair.
- **An anchored quantifier before `$`/`^` is quadratic even alone** (`/-+$/`) —
  use a manual index scan.
- **`bypassPluginVisibilityInDev()` checks `NODE_ENV === 'development'` exactly**,
  never `!== 'production'` — widening it disables gating under test.
- **Never make the service worker's `pages*` cache entries stale-serving** —
  pages are per-user SSR; keep `NetworkFirst` with `networkTimeoutSeconds`.

### Runtime, boot, Docker

- **Never `NEXT_PUBLIC_*` for runtime-varying values** — inlined at build time;
  Docker images build without `.env`.
- **Never drop the `pnpm-workspace.yaml` COPY from Dockerfiles** —
  `findWorkspaceRoot()` needs it or SQLite files land outside the volume.
- **The runtime Dockerfile ships every plugin's `manifest.json` and `migrations/`**
  into `/app/.deploy/plugins`; a missing one is skipped silently and surfaces
  as a production 500.
- **Background workers run inside the runtime process** — the portability
  registry is populated request-scoped as plugin pages load, so a headless
  worker process always sees it empty. The `runner` image has `git` and
  `postgresql16-client` for this; SQLite/sqld instance backup is unimplemented.
- **Every outbound `fetch` in a server render path has a timeout**, and a route
  that blocks on network gets a `loading.tsx`.
- **Import-time faults in generated handler modules must not abort boot** —
  `instrumentation.ts` wraps the scheduler/jobs imports; keep it that way.

### UI and client behavior

- **`'use client'` components never read browser globals in a `useState`
  initializer or render** — initialise safely, read in `useEffect`.
- **Never fork a navigation decision (redirect/push) by viewport** —
  `useIsMobile()` is `false` on first paint and corrects in an effect that runs
  after children's effects. Fork rendered content only.
- **Intra-overlay navigation uses `<Link replace>`** — the dialog closes with
  `router.back()`, so a push stacks history.
- **`router.push()` to the current URL doesn't refetch server data — use
  `router.refresh()`.** Callbacks passed as effect deps must be memoized.
- **An RSC element stored into client state loses its `key`** (it crosses as
  an opaque Flight reference) — thread a string key prop and apply it
  client-side on a `Fragment`.
- **A quick-entry input that commits on Enter also commits on blur** via
  `useCommitOnEnterOrBlur` — iOS's Done key only fires `blur`. Exception: a
  form with its own always-visible submit button.
- **`touch-action` is the intersection of an element's value and every
  ancestor's** — never route nested perpendicular scrollers by narrowing it.
- **Page padding comes from `PageContainer`, never local padding** — the shell
  applies no gutter; `Dialog` sets `--sv-page-gutter: 0` so overlays need no
  special handling.
- **Sticky elements inside touch-scrollable content get `transform: translateZ(0)`**
  (iOS Safari re-tiling quirk); skip it on pointer-only sticky elements.
- **A self-rendered `MobileHeader`/`MobileFooter` publishes its own height**
  automatically — don't hand-roll it, and don't use `ResizeObserver` (unreliable
  here; prefer `getBoundingClientRect()` in `useLayoutEffect` + `resize`).
- **Overriding a DS component's own module class needs higher specificity**
  (`svg.cls`, not `.cls`) — per-route CSS bundle order isn't guaranteed.
- **Composer-style surfaces keep a stable tree across state changes** — swap a
  modifier class, never remount the subtree (an unmounted toggle loses state).

## Design system (`packages/ui`)

`packages/ui` is the **Sovereign Design System** — a public contract versioned
like the SDK. Full model: `docs/design-system.md`.

- **Tokens** are CSS custom properties in plain `.css`, prefixed `--sv-*`, never
  abbreviated after the prefix. Two tiers: primitives (`--sv-grey-50`,
  `--sv-space-4`, `--sv-radius-md`) mapped to semantic tokens
  (`--sv-color-surface`, `--sv-color-text-primary`). Plugins reference
  **semantic colour tokens only**; the scale tokens (`--sv-space-*`,
  `--sv-radius-*`, `--sv-font-size-*`) have no semantic tier and are used
  directly. Dark mode and instance theming swap semantic values at `:root` /
  `[data-theme]`; v1 identity is monochrome, an admin adds colour via
  `--sv-color-accent`.
- **Components** are React + CSS Modules, RSC-safe. **No Tailwind, no runtime
  CSS-in-JS, no third-party component framework.** Components never hardcode
  values — always `--sv-*` tokens. Tokens are injected globally by the shell;
  plugins import components from `@sovereignfs/ui` and reference tokens in CSS
  with no import.
- **DS-first: plugins are consumers.** Reusable UI/UX capability (interaction
  hooks, overlay surfaces, secondary headers, motion, controls) is built in
  `packages/ui` (or the runtime shell for chrome) and adopted by plugins —
  never implemented plugin-locally "to be promoted later". React-coupled UI
  utilities belong in `@sovereignfs/ui`, not the SDK.
- **Storybook hygiene (per PR):** a new component gets
  `packages/ui/src/stories/<Name>.stories.tsx` (default + one variant) and a
  Component Gallery entry in `DesignSystemOverview.stories.tsx`; a new/renamed
  token updates `TokenGallery.stories.tsx` and the overview; an API change
  updates the story's args. Then `pnpm --filter @sovereignfs/ui typecheck`.
  New curated icons go through `scripts/icon-list.ts` + `pnpm generate:icons`
  (no `@sovereignfs/ui` version bump needed for an icon alone).

## Native mobile and desktop apps (post-v1, decided)

Both are decided — do not treat as open questions or suggest alternatives.
**Mobile:** a universal Capacitor shell app (separate `sovereign-mobile` repo);
**Desktop:** a universal Tauri 2.x shell app (separate `sovereign-desktop` repo,
macOS first, GitHub Releases). Each loads the user's self-hosted instance URL in
a WebView; all functionality is served by the instance unchanged; multiple
instances supported (Nextcloud/Bitwarden/Element pattern). Device API tiers, in
order: Web APIs → Capacitor/Tauri plugins → `sdk.device.*`, and **plugin
developers call `sdk.device.*` only**. Specs: SRS §3.12 (mobile), RFC 0038 +
SRS §3.19 (desktop). `packages/bridge` (RFC 0083) is the shared device bridge.

## Tech stack

Next.js 15 (App Router) · TypeScript · Turborepo + pnpm workspaces ·
better-auth (`apps/auth`) · Drizzle ORM (SQLite/Postgres) · nodemailer SMTP
(`packages/mailer`) · CSS Modules + CSS custom properties (`packages/ui`) ·
`tsup` (ESM only) · Vitest + Testing Library / jsdom (tests in per-dir
`__tests__/`; root `__tests__/{integration,e2e,visual}/` for later tiers) ·
Zod (manifest validation) · `citty` + `consola` (`bin/sv` CLI) ·
`@ducanh2912/next-pwa` · Docker Compose.

## Monorepo layout

```
apps/auth/          better-auth wrapper (the only separate Next.js app)
packages/
  tsconfig/         shared TS configs — extend these
  db/               Drizzle client factory + schema + migration runner
  manifest/         manifest schema, types, validation
  mailer/           SMTP abstraction (no-op when unconfigured)
  ui/               design system — published
  sdk/              plugin↔platform contract — published
  bridge/           device bridge (RFC 0083) — published
  create-plugin/    `npm create @sovereignfs/plugin` scaffolder — published
runtime/            Sovereign Core (Next.js shell, middleware, registry, SDK host)
  generated/        built from manifests — never hand-edit, gitignored
plugins/{console,launcher,account}/   platform plugins
example-plugins/    reference plugins, composed only when SOVEREIGN_EXAMPLES_ENABLED
registry/           public plugin index + submission process
scripts/            install-plugins.ts, generate-registry.ts, dev.ts
bin/sv              CLI
```

**Scope:** everything is `@sovereignfs/*` (one owned scope; `fs` = federated
systems). Published: `sdk`, `ui`, `create-plugin`, `bridge`. Internal packages
carry `"private": true` — that flag, not the scope, is the do-not-publish
signal. `@sovereignfs/tsconfig` is consumed only via `extends`.

## Commands

```bash
pnpm install --frozen-lockfile   # routine install (see Environment notes)
pnpm build              # turbo: packages (tsup) → generate → apps (next build)
pnpm dev                # dev servers; generate runs automatically (needs Docker for sqld)
pnpm format / format:check / lint / lint:fix
pnpm typecheck          # tsc --noEmit across packages (NOT composed plugin routes)
pnpm design:tokens:check # --sv-* refs resolve, no hardcoded colours in ui/runtime/plugins
pnpm test / test:watch / test:unit / test:integration / test:e2e / test:all
pnpm docs:check-links   # markdown link check
pnpm kill-port          # free :3000 / :3001
pnpm install:plugins    # clone plugins declared in sovereign.plugins.json
pnpm registry:validate / registry:check
pnpm sv <cmd>           # CLI (seed, backup, restore, plugin add/remove, …)
```

## Dev DX notes

- **No manual rebuilds in dev.** `scripts/dev.ts` composes plugins, runs the
  generate watcher, starts `next dev` on `:3000`; workspace packages are in
  `transpilePackages`, so package and plugin edits HMR. Plugins are copied,
  not symlinked, in dev. `tsup` is production-only.
- **`pnpm dev` needs Docker running** — `scripts/ensure-sqld.ts` starts a
  persistent `sovereign-sqld-dev` container, deliberately separate from
  `docker-compose.yml`'s `sovereign-sqld`.
- **Middleware verifies sessions offline** via better-auth's signed cookie cache
  (300s, key = `SOVEREIGN_AUTH_SECRET ?? AUTH_SECRET`), falling back to
  `GET /api/verify`; forward its `Set-Cookie` on a miss. The runtime service
  needs `AUTH_SECRET` in every compose file.
- **The account profile page reads `get-session?disableCookieCache=true`** —
  plain `get-session` returns a stale value after a self-edit.
- **Local ports may be overridden** via `AUTH_PORT`/`RUNTIME_PORT` in `.env`;
  resolve them through `scripts/dev-ports.mjs`, never hardcode 3000/3001 in
  tooling or e2e specs.
- **Warden and `sdk.secrets` need `SOVEREIGN_VAULT_KEY` in `.env`**
  (`openssl rand -base64 32`). A row encrypted under a lost key throws
  `Unsupported state or unable to authenticate data` on every page load.
- Local setup, Mailpit, Compose details: `CONTRIBUTING.md`.

## Environment notes

- Node ≥20 (dev on 24.x), pnpm 11.5.2 (`packageManager`). pnpm 11 blocks
  dependency build scripts; `esbuild` and `better-sqlite3` are allowlisted in
  `pnpm-workspace.yaml` `allowBuilds`; `simple-git-hooks` is `false` there (the
  root `prepare` script installs hooks).
- **Shared dev tooling is pinned via the pnpm `catalog:`** — reference it as
  `"typescript": "catalog:"`, never a literal version; add new shared deps to
  the catalog first.
- **Use `pnpm install --frozen-lockfile` for routine installs**; a bare
  `pnpm install` re-resolves the graph and can silently bump a transitive major.
  Unexpected `pnpm-lock.yaml` churn means something is unpinned.
  **Exception:** after cloning a `.local` plugin, `--frozen-lockfile` always
  fails (gitignored workspace member) — run a bare install once and don't
  commit the lockfile diff. When you _do_ need to regenerate the lockfile,
  move `.local` plugins out of `plugins/` first, or their entries pollute it.
- **A `pnpm-workspace.yaml` `overrides` entry for an advisory is capped to the
  consumer's declared range** (`'>=3.1.6 <4.0.0'`), never open-ended.
- **`git ls-files 'plugins/*/app'` returns nothing** — a mid-path wildcard
  doesn't recurse; use a trailing `/*`.
- **citty `defineCommand` args have no repeatable type** — read `rawArgs` for a
  flag that may repeat.
- **Tests:** await every async operation a test starts (an un-awaited jsdom
  `FileReader` lands as an unhandled error after the test ends); scope a long
  timeout to the one slow test, not globally; a `.pg.test.ts` using an
  isolated schema must mock modules that resolve the real `getPlatformDb()`
  internally (`sendPlatformEmail`, `fanOutPushToUser`).

## Status

Current platform version: **`0.130.2`**. `ROADMAP.md` is the canonical task
queue and completion record; per-release narrative through `0.130.2` is
archived in `docs/task-history.md`.

**The next task is assigned by the developer at session start.** Read
`ROADMAP.md` to find the next pending task, then ask which one to pick up — do
not assume.

Keep this file current with load-bearing conventions only. Do not add task
completion entries or release narrative here — that belongs in `ROADMAP.md`,
the PR body, and `docs/epics/`.
