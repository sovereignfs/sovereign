# Epic: Infrastructure

> Monorepo scaffold, shared packages, Docker (dev + prod), CI pipeline, testing infrastructure, and non-Docker deployment paths.

## Status

⏳ In Progress

## Overview

Infrastructure covers the foundation that everything else runs on: the Turborepo + pnpm monorepo, shared TypeScript configs, the database package, Docker Compose for dev and production, the GitHub Actions CI pipeline, the E2E test suite, and non-Docker deployment (PM2 in v0.5, systemd planned). The only pending item is epic task 0.13 (systemd), which adds a zero-extra-dependency Linux production path alongside PM2.

## Tasks

#### ✅ 0.1 — Monorepo scaffold

**Goal:** Bare monorepo structure with pnpm workspaces and Turborepo configured. No application code.

**Deliverables:**

- Root `package.json` with pnpm workspace config
- `pnpm-workspace.yaml` declaring `apps/*`, `packages/*`, `plugins/*`, `runtime`
- `turbo.json` with basic pipeline: `build`, `dev`, `lint`, `typecheck`
- Empty directories: `apps/`, `packages/`, `plugins/`, `runtime/`, `scripts/`, `bin/`, `docs/`, `data/`
- `scripts/install-plugins.ts` — stub only: reads a `sovereign.plugins.json` config file at repo root, logs "not yet implemented". Full implementation in Task 0.5.00.
- Root `.gitignore` covering `node_modules`, `dist`, `.next`, `data/*.db`, `runtime/app/plugins/`
- Root `README.md` — one paragraph, links to SRS doc

**SRS reference:** 2.3 Monorepo Structure, 2.2 Tech Stack

**Review checklist:**

- `pnpm install` runs without errors
- `turbo build` runs without errors (no-ops since no packages exist yet)
- Directory structure matches SRS 2.3 exactly

---

#### ✅ 0.2 — Shared TypeScript config

**Goal:** Centralised TypeScript configuration inherited by all packages and apps.

**Deliverables:**

- `packages/tsconfig/` package with:
  - `base.json` — strict mode, path aliases, target ES2022
  - `nextjs.json` — extends base, Next.js specific settings
  - `library.json` — extends base, for non-Next packages
- Each future package/app will extend one of these

**SRS reference:** 2.2 Tech Stack

**Review checklist:**

- `packages/tsconfig/package.json` correctly exports all three configs
- Configs are strict — `strict: true`, `noUncheckedIndexedAccess: true`

---

#### ✅ 0.3 — Code quality tooling

**Goal:** Establish consistent code formatting and linting across the entire
monorepo before any application code is written. All subsequent tasks inherit
this baseline — nothing is merged without passing it.

**Deliverables:**

- `.editorconfig` at repo root — indent style (spaces, 2), line endings (LF),
  charset (UTF-8), trailing newline, trim trailing whitespace
- `prettier.config.ts` at repo root — single quotes, semicolons, trailing
  commas (`all`), print width 100, tab width 2
- `eslint.config.ts` at repo root — ESLint 9 flat config:
  - `typescript-eslint` recommended + strict rules
  - `eslint-config-prettier` to disable formatting rules that conflict with
    Prettier
  - `no-restricted-imports` rule scoped to `plugins/**` — blocks any import
    matching `*/runtime/src/*`. This is the SDK boundary rule (NFR-06); wiring
    it here means it is active from the first line of plugin code, not
    retroactively added in the SDK task
- `package.json` additions:
  - `simple-git-hooks` — pre-commit hook running lint-staged
  - `lint-staged` — runs `prettier --write` then `eslint --fix` on staged
    `.ts`/`.tsx`/`.css`/`.json` files
  - Scripts: `"format": "prettier --write ."`, `"format:check": "prettier
--check ."`, `"lint:fix": "eslint --fix ."`
- `turbo.json` — confirm `lint` task is correctly wired across packages
- Run `pnpm format` on all existing files (`.gitignore`, `README.md`,
  `package.json`, `pnpm-workspace.yaml`, `turbo.json`,
  `scripts/install-plugins.ts`) and commit formatted output as part of this PR

**Technology:** ESLint 9 (flat config) + `typescript-eslint` + Prettier +
`eslint-config-prettier` + `simple-git-hooks` + `lint-staged`. See CLAUDE.md —
Code quality section. No Biome — ESLint is required for the custom
`no-restricted-imports` SDK boundary rule; running both would be redundant.

**SRS reference:** NFR-06, PLT-10, SRS §2.2 Tech Stack

**Review checklist:**

- `pnpm format:check` passes on all files in the repo
- `pnpm lint` passes with zero errors or warnings
- Attempting to commit a file with formatting errors is blocked by the
  pre-commit hook
- A test import of `runtime/src/anything` inside `plugins/` causes ESLint to
  error — boundary rule is live

---

#### ✅ 0.4 — `packages/db` — Drizzle client factory

**Goal:** Shared database package providing a Drizzle client factory that supports both SQLite and PostgreSQL via a dialect flag.

**Deliverables:**

- `packages/db/` with:
  - `src/client.ts` — exports `createClient(config)` returning a Drizzle instance
  - `src/dialect.ts` — reads `DATABASE_URL` and `DB_DIALECT` env vars, returns correct dialect
  - `src/migrate.ts` — migration runner stub (accepts migration file paths, runs in order)
  - `src/schema/platform.ts` — platform tables: `tenants`, `users`, `sessions` with `tenant_id` on users
  - `src/index.ts` — barrel export
- `packages/db/package.json` with correct dependencies: `drizzle-orm`, `better-sqlite3`, `pg`
- `tsup.config.ts` — `entry: ['src/index.ts']`, `format: ['esm']`, `dts: true`, `clean: true`
- `package.json`:
  - `build` script: `tsup`
  - No `dev` script — `transpilePackages` in the consuming Next.js apps compiles
    this package's TypeScript source directly during dev; no watch build needed
  - `exports` field points to TypeScript source for workspace consumption:
    `{ ".": "./src/index.ts" }`. tsup overwrites this with `dist/` paths at
    build time for production/npm.

**SRS reference:** 3.7 Database Layer, 3.1 Deployment Model (tenant_id)

**Review checklist:**

- `createClient()` returns a working Drizzle instance for SQLite when `DB_DIALECT=sqlite`
- `tenant_id` present on `users` table
- Migration runner accepts an array of migration paths and runs them in order
- No direct database calls — only the factory and schema definitions

---

#### ✅ 0.5 — `packages/mailer` — SMTP abstraction

**Goal:** Thin mailer package wrapping nodemailer with a simple `send()` interface.

**Deliverables:**

- `packages/mailer/` with:
  - `src/mailer.ts` — `createMailer(config)` factory, `send(options: MailOptions)` method
  - `src/types.ts` — `MailOptions`, `MailerConfig` interfaces
  - `src/index.ts` — barrel export
- Config reads from env: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`
- Graceful no-op when SMTP is not configured (logs warning, does not throw)
- `tsup.config.ts` — `entry: ['src/index.ts']`, `format: ['esm']`, `dts: true`, `clean: true`
- `package.json`:
  - `build` script: `tsup`
  - No `dev` script — compiled by consuming apps via `transpilePackages`
  - `exports`: `{ ".": "./src/index.ts" }` for workspace; overwritten at publish
- **Dev email capture (Mailpit):** ships alongside the package so email flows are
  testable from day one (SRS decision log, June 2026):
  - `docker-compose.yml` — a `mailpit` service (SMTP `1025`, web inbox `8025`)
    for Docker-based dev. Task 0.3.12 adds the `runtime`/`auth` services to this
    same file once they exist.
  - `.env.example` — DB + SMTP vars with Mailpit-aware comments (Docker host
    `mailpit`, native host `localhost`, or unset to disable email).
  - `CONTRIBUTING.md` — an "Email in development" section covering the Docker
    service, the native `mailpit` binary, and the Ethereal no-install fallback.

**SRS reference:** NFR-02 (email optional), SDK surface `sdk.mailer.send()`, decision log (dev email capture)

**Review checklist:**

- `send()` accepts `to`, `subject`, `html`, `text`
- No-op behaviour when SMTP unconfigured — does not crash the runtime
- No hardcoded credentials anywhere

---

#### ✅ 0.6 — Docker Compose for local dev

**Goal:** Docker Compose setup orchestrating runtime and auth server for local development.

**Deliverables:**

- `docker-compose.yml` — extend the existing dev file (which already carries the
  `mailpit` service from Task 0.3.06) with two app services on the shared network:
  - `runtime` — host-mapped `${RUNTIME_PORT:-3000}:3000`
  - `auth` — internal only; `expose: ["3001"]`, no host `ports` mapping. The
    runtime reaches it at `http://auth:3001` via `SOVEREIGN_AUTH_URL`.
- `docker-compose.prod.yml` — production overrides: runtime host port defaults
  to `${RUNTIME_PORT:-4000}:3000`; auth remains internal-only; both services
  get `restart: unless-stopped`. (Mailpit is dev-only — not in the prod file.)
- `.env.example` — extend the existing file (DB + SMTP from Task 0.3.06) with the
  remaining required vars: `RUNTIME_PORT`, `AUTH_PORT`, `SOVEREIGN_AUTH_URL`,
  `AUTH_SECRET`, `SOVEREIGN_AUTH_SECRET`, etc.
- `docs/self-hosting.md` — getting started guide: clone, configure env, `docker compose up`

**SRS reference:** NFR-01, 2.4 Phased Roadmap v0.3, 3.1 Deployment Model (topology, ports)

**Review checklist:**

- `docker compose up` starts both services without errors
- Runtime is reachable at `localhost:3000` (dev)
- Auth server is **not** reachable from the host — only from the runtime
  container on the internal network
- `.env.example` covers every env var used across all packages

---

#### ✅ 0.7 — Production Docker image

**Goal:** Separate production Docker images for runtime and auth, each built
from Next.js standalone output.

**Deliverables:**

- `Dockerfile` (runtime) — three-stage:
  - `deps` — `node:<pinned>-alpine` + corepack pnpm; install with
    `--frozen-lockfile`
  - `builder` — copy source; `NODE_ENV=production`; run `pnpm generate`
    (copies plugins, not symlinks) then `pnpm build` (tsup packages → next
    build, producing `.next/standalone`)
  - `runner` — minimal image, non-root user, `NODE_ENV=production`; copy only
    `.next/standalone` + `.next/static` + `public`; `EXPOSE 3000`;
    `HEALTHCHECK` hitting the runtime health endpoint; `CMD ["node", "server.js"]`
- `apps/auth/Dockerfile` — same three-stage pattern for the auth server;
  `EXPOSE 3001`; auth-specific healthcheck
- Both apps set `output: 'standalone'` in their `next.config.ts` (prerequisite)
- `docker-compose.prod.yml` updated to build/use these images; runtime
  host-mapped (default 4000), auth internal-only, both `restart: unless-stopped`
- No secrets baked into images — all config injected at runtime via env

**SRS reference:** NFR-01, 2.4 Phased Roadmap v0.5, 3.1 Deployment Model

**Review checklist:**

- Images build without errors
- Each image is reasonably small (standalone output keeps them lean; target
  < 250MB per image)
- Login → session cookie → authenticated request works end-to-end across the
  two production containers (runtime → auth over the internal network)
- Auth container is not reachable from the host
- No dev dependencies and no secrets in the production images

---

#### ✅ 0.8 — Postgres validation

**Goal:** Confirm full parity between SQLite and Postgres deployments.

**Deliverables:**

- `docker-compose.prod.yml` updated with a Postgres service variant
- All migrations run cleanly against Postgres
- End-to-end smoke test: login, console access, plugin enable/disable — all working on Postgres
- `docs/self-hosting.md` updated with Postgres configuration section

**SRS reference:** NFR-03, 3.7 Database Layer

**Review checklist:**

- Switching `DB_DIALECT=postgres` and `DATABASE_URL` is the only change required
- No SQLite-specific queries anywhere in application code
- Migrations apply cleanly to a fresh Postgres instance

---

#### ✅ 0.9 — CI pipeline

**Goal:** GitHub Actions pipelines for continuous validation and npm publishing.

**Deliverables:**

- `.github/workflows/ci.yml` — validation, triggers on push to `main` and all
  pull requests:
  - `format` — runs `prettier --check .` across the repo; fails on any
    unformatted file
  - `lint` — runs ESLint across all packages including the SDK import boundary
    rule (NFR-06)
  - `typecheck` — runs `tsc --noEmit` across all packages
  - `generate-validate` — runs `pnpm generate --mode=prod` and verifies
    `runtime/generated/registry.ts` is valid TypeScript
  - `build` — runs `turbo build` in production mode
  - All jobs use pnpm cache for speed
- `.github/workflows/publish.yml` — npm publishing, **separate workflow**
  triggered on per-package version tags (the two packages have independent
  release cycles):
  - Tag pattern `sdk-v*.*.*` → builds and publishes `@sovereignfs/sdk`
  - Tag pattern `ui-v*.*.*` → builds and publishes `@sovereignfs/ui`
  - Steps: `pnpm install` → `pnpm --filter <pkg> build` (tsup → `dist/`) →
    `pnpm --filter <pkg> publish --no-git-checks --access public` using the
    `NODE_AUTH_TOKEN` repository secret
  - No other packages are ever published (internal `@sovereignfs/*` packages
    are `private` and workspace-only)
  - Publish runs only after the validation jobs pass on the tagged commit

**SRS reference:** SRS 3.9 (CI validation step), PLT-07, NFR-06, NFR-04

**Review checklist:**

- All five validation jobs pass on a clean checkout
- Unformatted file causes `format` job to fail
- Import boundary violation in a plugin causes `lint` job to fail
- Invalid manifest in `plugins/` causes `generate-validate` job to fail
- pnpm cache is correctly restored between runs
- Pushing an `sdk-v*` tag publishes only `@sovereignfs/sdk`;
  pushing a `ui-v*` tag publishes only `@sovereignfs/ui`
- A tag without a corresponding version bump in the package's `package.json`
  fails the publish (version already exists on npm)

---

#### ✅ 0.10 — Deployment & upgrade strategy

> Full entry: **[8.1]** in [data-sovereignty.md](data-sovereignty.md) — Deployment & upgrade strategy.
> This task also establishes the drizzle-kit migration runner and `sv backup`/`restore` commands referenced in this epic.

---

#### ✅ 0.11 — Non-Docker production deployment, Phase 1 — PM2

**Goal:** Ship the PM2 deployment path as the first-class non-Docker fallback
(RFC 0026 Phase 1). Operators who can't or won't use Docker get a documented,
supported path to production.

**Deliverables:**

- `bin/sv.ts`: health-gate in `sv serve` — poll auth `GET /api/health`
  (`http://127.0.0.1:3001` by default, derived from `SOVEREIGN_AUTH_URL`) with a
  30-second timeout before spawning the runtime process; log the wait via
  `consola.info`; exit non-zero with a clear error on timeout; unit-tested in
  `bin/__tests__/`
- `bin/sv.ts`: new `sv setup pm2 [--dir <install-dir>] [--env-file <path>]`
  sub-command; template-fill logic in `bin/helpers.ts`; unit-tested
- `bin/__tests__/fixtures/pm2.example.config.js` — canonical PM2 ecosystem
  config (same output as `sv setup pm2` with default arguments), kept in sync
  by a `renderPm2Config` unit test
- `docs/self-hosting.md`: new "Non-Docker deployment (PM2)" section covering
  Node.js version requirement, build steps, `pm2 startup`/`pm2 save` for boot
  persistence, env-var differences table (Docker vs non-Docker), data-directory
  setup, upgrade procedure, and reverse-proxy references (reuse existing snippets)
- SRS §3.1: PM2 added as a supported non-Docker deployment model

**Dependencies:** `sv serve` exists (Task 0.5.04); `sv backup`/`restore`
(Task 0.5.13) referenced in the upgrade procedure but not a hard blocker

**SRS reference:** RFC 0026 Phase 1, SRS §3.1

**Review checklist:**

- `sv serve` logs the health-gate wait and exits cleanly if auth never becomes
  healthy within 30 s; unit test covers the poll logic
- `sv setup pm2` produces a valid PM2 ecosystem config with correct paths, env,
  and `HOSTNAME=127.0.0.1` on the auth entry
- `docs/self-hosting.md` PM2 section is self-contained: a reader with Node.js,
  pnpm, and PM2 installed can follow it to a running instance without Docker

---

#### ✅ 0.12 — E2E golden-path test suite

**Goal:** Wire up Playwright as the browser-automation layer and write the first
golden-path tests covering the critical user flows: auth (login/logout/redirect),
launcher navigation, Account and Console plugin pages, platform shell navigation
(root rewrite, brand link, avatar menu), and the monetization paywall flow.

> **Current-state note:** This task originally landed six spec files / 20 tests.
> The suite has since grown; the current spec list and counts live in
> [testing-e2e.md](../testing-e2e.md).

**Scope:**

- `playwright.config.ts` — config with dual `webServer` (auth `:3001`, runtime `:3000`),
  `globalSetup`, chromium-only in CI, `retries: 1` to absorb Next.js lazy-compilation 404s
- `__tests__/e2e/global-setup.ts` — seeds test users via `pnpm sv seed`, saves storage state
  for both users, generates test Ed25519 keypair for paywall spec
- `__tests__/e2e/fixtures.ts` — `adminPage` / `userPage` fixture helpers
- Initial six spec files: `auth`, `launcher`, `account`, `console`, `navigation`, `paywall`
- `.github/workflows/e2e.yml` — hosted CI job definition kept disabled while E2E remains a
  manual gate; retains the source-only `push: main` path filter for a future re-enable
- `docs/testing-e2e.md` — local run guide + full coverage/deferred-flow table

**Version bumps:** none (devDependency only — `@playwright/test`; no package API changes).

**SRS reference:** RFC 0010 (test organisation); SRS NFR-11 (accessibility/quality).

**Review checklist:**

- `pnpm test:e2e` passes the current Playwright suite locally against dev servers
- `pnpm test` (Vitest) still passes unchanged (no `.spec.ts` picked up)
- `pnpm lint` passes (`__tests__/e2e/**` and `playwright.config.ts` excluded from ESLint)
- `e2e.yml` workflow appears in GitHub Actions after merge with hosted execution disabled by
  current policy

---

#### 📋 0.13 — Non-Docker production deployment, Phase 2 — systemd

**Goal:** Add systemd as a zero-extra-dependency alternative to PM2 for Linux
server operators (RFC 0026 Phase 2). Phase 1 (PM2) must ship first.

**Deliverables:**

- `bin/sv.ts`: `sv setup systemd [--user <user>] [--dir <dir>] [--env-file <path>]`
  sub-command writing two pre-filled unit files to the current directory; template
  logic in `bin/helpers.ts`; unit-tested
- `docs/examples/sovereign-auth.service`, `docs/examples/sovereign-runtime.service`
  — canonical unit files (same as `sv setup systemd` defaults): `User=sovereign`,
  `WorkingDirectory=`, `EnvironmentFile=`, `HOSTNAME=127.0.0.1` on auth,
  `ExecStartPre` health-poll on the runtime unit, `Restart=on-failure`
- `docs/self-hosting.md`: "Non-Docker deployment (systemd)" section alongside the
  PM2 section; covers account creation, `EnvironmentFile` setup, `systemctl enable`,
  log access via `journalctl`, and the upgrade procedure
- Document `sv serve` as a valid single-process target under either PM2 or systemd
  (simplest path for minimal init systems)
- SRS §3.1: systemd noted as the recommended Linux-native alternative to PM2

**Dependencies:** Task 0.5.29 (Phase 1 — PM2 and `sv serve` health-gate must be
in place)

**SRS reference:** RFC 0026 Phase 2, SRS §3.1

**Review checklist:**

- `sv setup systemd` produces two syntactically valid unit files with correct
  `WorkingDirectory`, `EnvironmentFile`, `HOSTNAME`, and `ExecStartPre` health-poll
- `systemctl start sovereign-runtime` waits for `sovereign-auth` to pass its health
  check before the runtime process starts
- `docs/self-hosting.md` systemd section is self-contained alongside the PM2 section

---

#### ✅ 0.14 — Typecheck performance and project references

**Status (August 2026): shipped — workstream 0012 leg 3, packages only.**
Audited the inheritance graph: 7 library packages under `packages/`
(`bridge`, `create-plugin`, `db`, `mailer`, `manifest`, `sdk`, `ui`) all
extend `packages/tsconfig/library.json` → `base.json`; the internal
dependency graph among them is shallow — only `bridge` depends on another
package (`sdk`). Four Next.js-family apps (`runtime`, `apps/auth`,
`apps/harness`, `apps/relay`) extend `nextjs.json`.

**A real regression was found and avoided, not just a risk noted.** The
first attempt added `composite: true` directly to the shared
`library.json` (and each package's own `tsconfig.json`) — that broke
`tsup`'s DTS build outright (`pnpm build` failed on `packages/ui` with
`error TS6307: File '...' is not listed within the file list of project`),
because tsup's internal DTS bundler reads the same tsconfig and doesn't
handle composite mode's stricter file-list validation the way real
`tsc -b` does. This would have broken the platform's actual production
build, not just typechecking. Fixed by isolating the new machinery into
a dedicated `tsconfig.build-refs.json` per package (extending the
package's own `tsconfig.json`, adding `composite`/`incremental`/a
throwaway `dist-tsc/` output dir there instead) — each package's real
`tsconfig.json` (read by both `tsup` and the existing `tsc --noEmit`
script) is completely untouched. `packages/mailer` separately needed its
JSON locale imports added to `include` — composite mode requires every
reachable file to be explicitly covered, `--noEmit` mode does not.

**A root `tsconfig.packages.json` solution file** references all 7
packages' `tsconfig.build-refs.json` (`bridge`'s references `sdk`'s,
matching the one real internal dependency), exposed via two new,
opt-in root scripts — `pnpm typecheck:packages:incremental` (`tsc -b
tsconfig.packages.json`) and `...:clean` — for local iterative
development. **Not wired into `pnpm typecheck`, CI, or `pnpm build`** —
those are entirely unchanged and were re-verified green after this leg
(`pnpm typecheck`: 31/31 passing; `pnpm build`: 12/12 passing; full test
suite: 2411 passing).

**Timings, measured, not estimated:**

- Existing `pnpm typecheck` (Turbo-orchestrated `tsc --noEmit`, all 31
  projects), fully cold: ~83s. Turbo's own warm-cache rerun (nothing
  changed): ~4.6s. **Unchanged by this leg** — the existing command and
  its Turbo task config were not touched.
- New `pnpm typecheck:packages:incremental` (7 core packages via
  `tsc -b`), cold: ~7.8s. No-op rerun: ~0.44s. After touching one file
  in `packages/ui`: ~0.5s to detect and reprocess.

The real win isn't the cold number (Turbo's hash-based caching already
makes a fully-unchanged full run fast) — it's that `tsc --noEmit` has
zero memory between invocations (`--noEmit` suppresses the
`.tsbuildinfo` write entirely), so today any single-file edit inside a
package forces a full from-scratch re-check of that whole package on
the next `pnpm typecheck` cache miss. The new path gives these 7
packages genuine sub-package-granularity incrementality for local
iteration, underneath Turbo's existing per-package caching, without
touching what CI or `pnpm build` actually run.

**Next.js apps evaluated, explicitly excluded — with concrete reasons,
not just caution.** `nextjs.json` already declares `incremental: true`,
but it's equally dead config today for the same reason (`--noEmit`
everywhere). Composite mode's requirement that every reachable file be
explicitly `include`-covered is a poor fit for apps whose tsconfig
includes `.next/types/**/*.ts` — a set Next.js regenerates dynamically
per build, not a static file list. Given the tsup regression just found
came from the exact same failure class (a bundler's own internal
type-checking reading the same tsconfig composite mode was added to),
and Next's blast radius (`next build`/`next dev` for the whole platform)
is far larger than one package's DTS build, this wasn't attempted. Ships
as a documented "not viable in this pass" rather than a silent gap.

**Deliverables:**

- Audit the current `tsconfig` inheritance graph.
- Add `composite: true` to package configs where viable.
- Add root TypeScript project references for packages first.
- Evaluate Next.js app/runtime compatibility separately before enabling
  references for apps.
- Confirm Turbo caching still behaves correctly.
- Measure before and after timings for `pnpm typecheck`.

**Dependencies:** Task 0.2 (shared TypeScript config), Task 0.9 (CI pipeline).

**SRS reference:** 2.2 Tech Stack, NFR-05.

**Review checklist:**

- Package-level typechecking can use incremental metadata.
- The change does not make Next.js app typechecking more fragile.
- Timing data is recorded in the PR or epic notes.

---

#### 📋 0.15 — Operational consistency checks

**Goal:** Catch drift between auth DB, platform DB, generated state, and
operator configuration before it becomes a production issue.

**Deliverables:**

- Add or extend health checks for:
  - Generated registry presence and platform compatibility.
  - Root plugin ID points to an installed, enabled, root-eligible plugin.
  - Invite-only state if duplicated between auth and platform stores.
  - Disabled incompatible plugins and recorded reasons.
  - Plugin env vars required by manifests.
- Consider a `pnpm sv doctor` command that reports:
  - Required env readiness.
  - DB dialect and migration status.
  - Plugin manifest and generation status.
  - Auth URL, public auth URL, and cookie-domain consistency.
  - Notification transport configuration.
- Ensure doctor-style checks do not mutate state unless explicitly requested.

**Dependencies:** Task 0.10 (deployment and upgrade strategy), Task 2.12
(production dev-mode and diagnostics), Task 3.10 (plugin compatibility and
versioning), Task 3.11 (plugin-scoped environment variables).

**SRS reference:** NFR-07, NFR-10, RFC 0006.

**Review checklist:**

- Operators can distinguish liveness from configuration readiness.
- Common deployment drift has actionable error messages.
- The doctor command does not mutate state unless explicitly requested.

---

#### 📋 0.16 — Pre-v1 stabilization gate

**Goal:** Create a release-quality checkpoint that prevents new feature work
from outrunning platform maintainability.

**Deliverables:**

- Add an explicit pre-v1 go/no-go checklist covering:
  - Middleware refactor complete or explicitly deferred.
  - Generate refactor complete or explicitly deferred.
  - E2E suite covers auth, account, console, launcher, and paywall flows.
  - Docs reflect current commands, test behavior, and development workflow.
  - `pnpm generate` leaves no stale generated artifacts.
  - `pnpm lint`, `pnpm typecheck`, and `pnpm test` pass in CI.
  - `pnpm test:e2e` passes manually before browser-facing, auth, middleware, platform plugin,
    or Playwright harness changes are pushed.
- Require new pre-v1 feature epics to state whether they touch middleware,
  generation, auth, plugin manifests, or SDK contracts.

**Dependencies:** Task 2.17 (middleware decomposition), Task 3.23 (generate
script decomposition), Task 16.3 (current-state testing documentation cleanup).

**SRS reference:** NFR-04, NFR-05, NFR-11.

**Review checklist:**

- There is a clear go/no-go checklist before v1.
- Stabilization work is visible on the roadmap rather than hidden in ad hoc
  cleanup.
- Feature work that changes load-bearing architecture has test requirements
  attached up front.

#### ✅ 0.17 — CI dependency-vulnerability scanning

**Goal:** Close a real gap — this repository had no automated dependency-
vulnerability or static-analysis scanning anywhere in CI before this task.
`pnpm audit` was never run, no Dependabot config existed, and no CodeQL/SAST
workflow was wired up.

**Deliverables:**

- `.github/dependabot.yml` — weekly update PRs for the `npm` (pnpm workspace,
  root directory) and `github-actions` ecosystems.
- `.github/workflows/codeql.yml` — CodeQL analysis for `javascript-typescript`,
  triggered on push to `main`, on pull requests, and on a weekly schedule (so
  newly-disclosed advisories against unchanged code are still caught, not just
  vulnerabilities introduced by new code).
- A new `audit` job in `.github/workflows/ci.yml`, gated by the existing
  `changes` classification job (path-triggered on `package.json`,
  `pnpm-lock.yaml`, and any workspace package's `package.json`) — runs
  `pnpm audit --prod --audit-level=high`. `--prod` scopes the gate to
  production-shipped dependencies rather than build/dev tooling, and
  `--audit-level=high` fails only on high/critical findings, matching the
  severity threshold most CI dependency gates use to stay actionable rather
  than noisy.
- `pnpm-workspace.yaml`'s new `auditConfig.ignoreGhsas` list — the documented,
  reviewed exception list for pre-existing advisories that could not be
  resolved by an in-range dependency bump in this task (see Task 0.18, which
  tracks resolving them). Every entry is a specific GHSA ID with a reason, not
  a blanket severity suppression.
- A one-time `pnpm update -r` across the whole workspace (safe — respects
  existing semver ranges in `package.json`/the pnpm catalog, no forced major
  bumps) as the natural first step before turning the gate on, since it would
  be counterproductive to ship a new vulnerability gate immediately failing
  on debt that a routine update already clears. Reduced findings from 43 to
  19 (9 in the `--prod` scope this gate actually checks); the remainder is
  Task 0.18's scope.
- A separate scheduled `.github/workflows/dependency-audit.yml` (weekly,
  `workflow_dispatch` also enabled for manual runs) running the same
  `pnpm audit --prod --audit-level=high` against `main` — catches newly
  disclosed CVEs in dependencies that didn't change, which the PR-gated
  `audit` job in `ci.yml` cannot (it only runs when a PR touches a manifest
  or lockfile).

**Dependencies:** None.

**SRS reference:** NFR-06 (dependency and supply-chain hygiene).

**Review checklist:**

- `pnpm audit --prod --audit-level=high` exits 0 on a clean checkout — the
  `auditConfig.ignoreGhsas` exceptions are respected automatically, with no
  CLI flags required.
- A PR that introduces a new high/critical production-dependency
  vulnerability fails the `audit` job; a PR that only touches unrelated code
  does not trigger the job at all (path-gated, same pattern as the existing
  `design-tokens`/`generate-validate` jobs).
- CodeQL runs on PRs and on a weekly schedule, and surfaces findings in the
  PR's Security tab.
- Dependabot opens PRs on its own schedule without any manual trigger.
- `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, and
  `pnpm test` all still pass after the workspace-wide dependency refresh.

---

#### 📋 0.18 — Remediate known dependency vulnerabilities

**Goal:** Resolve the advisories Task 0.17 could not close with an in-range
update and had to record in `pnpm-workspace.yaml`'s `auditConfig.ignoreGhsas`
as a reviewed, temporary exception — so that list shrinks over time instead
of becoming a permanent blanket suppression nobody revisits.

**Deliverables, one per currently-ignored GHSA ID:**

- `GHSA-p6gq-j5cr-w38f` (nodemailer, high — arbitrary file read / SSRF via
  the message-level `raw` option): fix requires bumping `nodemailer` from the
  `^8.0.11` range to `>=9.0.1`, a major version — review `packages/mailer`
  against nodemailer 9's changelog for breaking API changes before bumping.
- `GHSA-p2fr-6hmx-4528` (`@better-auth/oauth-provider`, moderate — may issue
  access tokens for unauthorized audiences via unbound resource indicators):
  the only patched release is `1.7.0-beta.4`, a prerelease; evaluate whether
  to adopt the beta ahead of a stable release given RFC 0072's external
  OAuth/OIDC provider surface is real, externally-reachable attack surface.
- `GHSA-f88m-g3jw-g9cj` (sharp, high — inherited libvips CVEs), and
  `GHSA-6g55-p6wh-862q` / `GHSA-r28c-9q8g-f849` (postcss, high — arbitrary
  file read / path traversal via `sourceMappingURL`): both are transitive
  dependencies pinned inside Next.js's own dependency tree
  (`better-auth > next > sharp` / `> postcss`), not directly controllable via
  this repo's own `package.json`/catalog; resolve by tracking whether a newer
  Next.js patch release bumps its own internal pins, or evaluate a `pnpm`
  override if the gap persists.
- `GHSA-5c6j-r48x-rmvq` (serialize-javascript, high — RCE via `RegExp.flags`
  and `Date.prototype.toISOString()`): transitive via
  `@ducanh2912/next-pwa > workbox-build > @rollup/plugin-terser` — build-time
  only (used to minify the generated service worker, never executed against
  runtime/attacker-controlled input), already on `next-pwa`'s latest release;
  same tracking approach as the postcss/sharp entries above.

Each fix removes its GHSA ID from `auditConfig.ignoreGhsas` in the same PR
that resolves it — don't batch removals separately from the fix.

**Dependencies:** Task 0.17 (the scanning + exception-list mechanism this
task's deliverables assume already exists).

**SRS reference:** NFR-06.

**Review checklist:**

- Each resolved advisory's GHSA ID is removed from `auditConfig.ignoreGhsas`
  in the same PR that fixes it, not left behind.
- `pnpm audit --prod --audit-level=high` still exits 0 after each fix (no
  regression from the dependency bump reintroducing a different advisory).
- A major-version bump (nodemailer) includes a review of breaking changes
  against `packages/mailer`'s actual usage, not just a version-string edit.

---

#### ✅ 0.19 — Publish a `sovereign-tools` image

**Shipped as workstream [0006](../workstreams/0006-rfc-0071-incident-followups.md)
leg 1, re-scoped during implementation** (2026-08-13): RFC 0071's at-rest
encryption was retired from the live code path before this task started, so
`sv db encrypt`/`decrypt` — named below and in the original review checklist
— no longer exist. The underlying gap (no source-checkout-free `sovereign-tools`
image) was unaffected and shipped against today's real admin commands
instead: `sv backup`/`restore`, `sv db migrate-to-sqld`/`migrate-to-postgres`/
`encrypt-fields`, `sv keys rotate-field-kek`/`rotate-blind-index`, and
`sv user reset-mfa`. See the workstream doc for the full re-scope rationale.

**Goal:** Close the first still-open follow-up from
`docs/incidents/2026-07-24-rfc-0071-encryption-rollout.md`: the documented
`sv db encrypt`/`decrypt`/`backup`/`restore` procedure assumes a source
checkout (`docker compose --profile tools run --rm tools pnpm sv <command>`),
but `.github/workflows/publish-images.yml`'s build matrix only publishes
`sovereign-runtime` and `sovereign-auth` to GHCR — no `sovereign-tools`
image exists, and `docker-compose.prod.yml`'s `tools` service
(`docker-compose.prod.yml:209-214`) has only a `build:` block, no `image:`
fallback, unlike `runtime`/`auth` which both have
`image: ${SOVEREIGN_VERSION:+ghcr.io/sovereignfs/sovereign-<name>:${SOVEREIGN_VERSION}}`
(`docker-compose.prod.yml:98`) alongside their `build:` block. A production
deployment that only has `docker-compose.prod.yml` + `.env` — the documented,
intended `SOVEREIGN_VERSION`-pinned deployment shape — cannot run any `sv`
admin command without first cloning the full repository as a workaround,
which is exactly what the incident's resolution steps had to do.

**Deliverables:**

- Add `sovereign-tools` (Dockerfile already has a distinct `tools` build
  target, `Dockerfile:98`, `AS tools`) to the `build-and-push` matrix in
  `.github/workflows/publish-images.yml`, alongside `sovereign-runtime` and
  `sovereign-auth`, passing `target: tools` to `docker/build-push-action`.
- Add the matching `image:` fallback line to `docker-compose.prod.yml`'s
  `tools` service, mirroring `runtime`'s exact pattern.
- `docs/self-hosting.md`'s backup/restore and encryption sections updated to
  drop the "clone the repo first" workaround as the documented path — the
  published-image deployment now works as originally intended.

**Dependencies:** None.

**SRS reference:** incident doc above; RFC 0006 (deployment & upgrade
strategy), RFC 0071 (SQLite at-rest encryption).

**Review checklist:**

- A deployment with only `docker-compose.prod.yml` + `.env` and
  `SOVEREIGN_VERSION` set (no source checkout) can run
  `docker compose --profile tools run --rm tools pnpm sv db encrypt` and
  every other documented `sv` admin command successfully.
- `docker compose --profile tools run --rm tools` still works with a local
  source checkout and no `SOVEREIGN_VERSION` set (the `build:` block remains
  the fallback, unchanged from today).
- The published `sovereign-tools` image gets the same semver/`latest` tag
  set as `sovereign-runtime`/`sovereign-auth` (`type=semver`/`type=raw`
  entries in the existing `docker/metadata-action` step, reused per-matrix-entry).
- `docs/self-hosting.md` no longer instructs operators to clone the repo as
  a prerequisite for `sv` admin commands against a published-image
  deployment.

---

#### ✅ 0.20 — `libSQL`/`sqld` container spike (Research 0003, workstream 0009 leg 2)

**Goal:** Stand up `sqld` (libSQL's server) as its own container and prototype
`packages/db` talking to it, to answer the two questions Research 0003 left
open before any production code depends on the answer: how libSQL's
client — async even for local access — reconciles with `packages/db`'s
existing dialect-agnostic async contract (`docs/architecture-rules.md:42-47`),
and how RFC 0071's SQLCipher-based at-rest encryption
(`openKeyedSqlite`, `packages/db/src/sqlite-encryption.ts:314`, and its
`apps/auth` twin) maps onto a `sqld`-backed database. This leg's deliverable is
a decision, written up as an RFC — not working platform code.

**Deliverables:**

- `sqld` added via a new `docker-compose.sqld.yml` overlay, mirroring the
  existing `docker-compose.postgres.yml` pattern rather than being embedded in
  the base compose files — reachable from `runtime`/`auth` on the internal
  network only (no host port), a `/health`-backed healthcheck matching
  `postgres`'s `pg_isready` one.
- A throwaway prototype (not wired into `packages/db`'s real call sites)
  exercising `@libsql/client` against the container, enough to observe the
  async-contract and encryption questions empirically.
- An RFC (next available number) that: supersedes Research 0003's "opt-in
  third tier" recommendation with the mandatory, staged adoption locked in
  workstream 0009's Decisions Locked table; specifies the driver shape for
  `packages/db/src/client.ts` and `plugin-client.ts`, including whether
  `Dialect` (`packages/db/src/dialect.ts:1`, currently `'sqlite' | 'postgres'`)
  gains a third value or libSQL stays a connection-shape variant under
  `'sqlite'`; and states explicitly how encrypted SQLite databases are
  handled — native `sqld` encryption, a different mechanism, or an explicit
  documented gap, but not silence.
- Research 0003 updated to mark its SQLite row superseded, pointing at the new
  RFC.

**Dependencies:** None. Independent of Task 8.22.

**SRS reference:** none yet — this task produces the RFC that will cite one.

**Review checklist:**

- `docker compose -f docker-compose.prod.yml -f docker-compose.sqld.yml up`
  brings up `sqld` with no code change to `runtime`/`auth`; plain
  `docker compose up` (no overlay) is unchanged for every existing deployment.
- The RFC explicitly resolves both open questions (async contract, RFC 0071
  compatibility) — an RFC that ships without an encryption answer is not done.
- The RFC's driver-shape decision is concrete enough that Task 8.23 can be
  scoped from it without a further design conversation.

---

#### ✅ 0.21 — Harden checkAdminKey: timing-safe comparison + rate limiting on /api/admin

**Goal:** Close a timing-side-channel and flood-protection gap in the sole authorization boundary for `/api/admin/*` on both `runtime` and `apps/auth`. `runtime/src/admin-guard.ts:16` and its byte-identical twin `apps/auth/src/admin-guard.ts:8` compare the caller's bearer token to `SOVEREIGN_ADMIN_KEY` with plain `!==` — a timing side-channel inconsistent with every other secret/signature comparison in this codebase (`runtime/src/webhook-hmac.ts:26`, `storage.ts:134`, `connections.ts:49` all use `crypto.timingSafeEqual` with a pre-check on buffer length). This guard is the sole authorization boundary for the entire `/api/admin/*` surface on both services — user management, invites, capability grants, plugin lifecycle, instance config (20+ route files on the runtime side alone, e.g. `runtime/app/api/admin/users` via the auth app, `runtime/app/api/admin/plugins/[id]/access/route.ts`, `instance-config/route.ts`). Compounding the timing issue, `runtime/middleware.ts`'s matcher deliberately excludes `/api/admin` (line 648: `\"...api/admin...\"` in the negative-lookahead) because it's self-authenticated by design — but that also means it receives none of `checkGlobalRateLimit`'s per-IP flood protection (`runtime/src/rate-limit.ts:61-77`), and `apps/auth`'s `/api/admin/*` routes (`apps/auth/app/api/admin/{settings,directory,users,invites}/route.ts` and nested routes) have no rate limiting at all today — better-auth's own `rateLimit.storage: 'database'` config (`apps/auth/src/auth.ts`, `docs/security.md`) only covers better-auth's own sign-in/sign-up endpoints, not these hand-rolled admin routes. Net result: an attacker with network access to either service's `/api/admin` surface can guess `SOVEREIGN_ADMIN_KEY` at unlimited rate, with a timing oracle helping narrow the search.

**Deliverables:**

- Convert `runtime/src/admin-guard.ts`'s `checkAdminKey()` (currently `if (auth !== \`Bearer ${adminKey}\`)`at line 16) to a length-checked`crypto.timingSafeEqual`comparison, mirroring the`safeEqual(a, b)`helper already duplicated in`runtime/src/connections.ts:46-50`and`runtime/src/storage.ts:131-135` (`Buffer.from`both sides, compare`.length`before calling`timingSafeEqual` since it throws on mismatched-length buffers rather than returning false).
- Apply the identical comparison fix to `apps/auth/src/admin-guard.ts:8` (the byte-identical twin the audit finding names) — keep the two files' comparison logic in lockstep, consistent with how these two guards have been kept as intentional duplicates rather than a shared import (service-boundary independence, same reasoning already documented for `apps/auth/src/db.ts`'s dialect-resolution duplication in `docs/architecture-rules.md`).
- Add a new dedicated per-IP rate limiter, one module per service (`runtime/src/admin-rate-limit.ts`, `apps/auth/src/admin-rate-limit.ts`), reusing the fixed-window bucket shape already established by `runtime/src/rate-limit.ts`'s `checkGlobalRateLimit` (lines 61-77) and `runtime/src/directory.ts`'s `checkDirectoryRateLimit` (lines 21-37): in-memory `Map<string, {resetAt, count}>`, one bucket per client IP. Unlike those two, this bucket increments **only on a failed key comparison**, never on a successful one — `checkAdminKey` is the single call point behind every `/api/admin/*` route in both services (e.g. `plugins/console/app/plugins/actions.ts`'s `adminFetch`, called on every Console admin action with the correct key from `process.env.SOVEREIGN_ADMIN_KEY`), so counting successes too would risk throttling legitimate Console traffic instead of just repeated bad-key guesses.
- Wire the new limiter into both `checkAdminKey()` implementations: on a failed comparison, increment the caller's IP bucket and return 403 as today; once a bucket crosses the threshold within the window, every subsequent request from that IP — including one presenting the correct key — returns `429` with a `Retry-After` header until the window resets, matching `runtime/middleware.ts`'s existing 429 response shape (lines ~112-118) for its own global limiter. The runtime side's existing `SOVEREIGN_ADMIN_KEY` unset -> `503` branch (`admin-guard.ts:9-14`) stays a config error, not a rate-limited path.
- Resolve the caller's IP inside `checkAdminKey(request: Request)` (both services pass a plain `Request`, not `NextRequest`) by trusting the last `X-Forwarded-For` hop, falling back to `X-Real-IP` — the same single-reverse-proxy trust logic `runtime/src/rate-limit.ts`'s `clientIp()` (lines 83-113) already documents and implements. On the runtime side, widen `clientIp`'s parameter type from `NextRequest` to `Request` (backward compatible — `NextRequest extends Request`, and the function body only calls `.headers.get()`) and import it directly into `admin-guard.ts`. On the `apps/auth` side, duplicate the same logic into the new `apps/auth/src/admin-rate-limit.ts` — `apps/auth` has no existing IP-resolution helper of its own (`grep -rn "x-forwarded-for" apps/auth/src` currently returns nothing) and deliberately doesn't import `runtime/src/*`.
- Add `resetAdminRateLimitForTests()` exports to both new modules, mirroring `resetGlobalRateLimitForTests()`/`resetDirectoryRateLimitForTests()`, so `runtime/src/__tests__/admin-guard.test.ts` and `apps/auth/src/__tests__/admin-guard.test.ts` can clear bucket state between test cases without cross-test bleed.
- Extend both existing `admin-guard.test.ts` files (`runtime/src/__tests__/admin-guard.test.ts`, `apps/auth/src/__tests__/admin-guard.test.ts`) with: a wrong-key-of-different-length case (proves the length check runs before `timingSafeEqual`, which would otherwise throw), a rate-limit-trips-after-N-failures case asserting `429` + a `Retry-After` header once the threshold is crossed, and a case proving a _correct_-key request from an IP that has already tripped the limiter is still rejected with `429` (not silently let through).

**Dependencies:** None.

**SRS reference:** None — this is remediation from a codebase security audit, not new design. No RFC or SRS section currently covers `checkAdminKey`'s comparison method or `/api/admin`'s rate-limit posture; `docs/architecture-rules.md`'s existing `SOVEREIGN_ADMIN_KEY` bullet (~line 190) covers a different, already-fixed concern (server actions bypassing capability checks), not this one.

**Review checklist:**

- `grep -rn "auth !== \`Bearer" runtime/src apps/auth/src`returns no matches — the plain`!==` comparison is gone from both files.
- `grep -n "timingSafeEqual" runtime/src/admin-guard.ts apps/auth/src/admin-guard.ts` shows both files using it.
- `pnpm --filter runtime exec vitest run src/__tests__/admin-guard.test.ts` and the equivalent `apps/auth` run both pass, including the new different-length-key, rate-limit-trips, and correct-key-while-tripped cases.
- A manual `curl` loop against a local `pnpm dev` instance sending N+1 wrong-key requests to any `/api/admin/*` route from the same source returns `403` for the first N and `429` with a `Retry-After` header for the rest, then `403`/`200` again once the window elapses.
- The same manual test confirms a request presenting the _correct_ `SOVEREIGN_ADMIN_KEY` still succeeds normally when the caller's IP has not tripped the limiter — Console's own admin actions (e.g. toggling a plugin from `/console/plugins`) are unaffected under normal use.
- `pnpm typecheck` and `pnpm lint` pass with no new `eslint-disable` comments.
- `docs/architecture-rules.md` gets a new bullet documenting the `checkAdminKey` timing-safe-comparison + failure-only rate-limit pattern, consistent with this file's own convention of recording load-bearing security fixes there.

---

#### ✅ 0.22 — Evict expired entries from the three in-memory rate-limit maps; fix the stale peer-comparison comment

**Goal:** Close a memory-growth and stale-documentation finding from a platform-hardening audit: `runtime/src/rate-limit.ts`'s `checkGlobalRateLimit` (`rate-limit.ts:61-77`) writes or overwrites an entry in its module-level `buckets` Map (`rate-limit.ts:35`) on every request but never deletes one — a key that simply stops being seen (an IP that moves on after a scan, a bot that rotates addresses) stays resident for the life of the container. `checkGlobalRateLimit` sits directly in `runtime/middleware.ts`'s hot path, run before almost every other check (`middleware.ts:105-119`), and is keyed by client IP — attacker-influenced cardinality on an internet-facing instance. The identical write-only pattern, cleared only by a `resetXForTests()` test helper, is independently repeated in `runtime/src/directory.ts`'s `buckets` Map (`directory.ts:14`, written in `checkDirectoryRateLimit`, `directory.ts:21-37`) and `runtime/src/plugin-mailer.ts`'s `pluginBuckets`/`recipientBuckets` Maps (`plugin-mailer.ts:17-18`, written in the shared `checkBucket` helper, `plugin-mailer.ts:26-45`) — systemic across all three of this codebase's in-memory fixed-window rate limiters. Separately, `rate-limit.ts`'s own doc comment (`rate-limit.ts:21-24`) justifies the in-memory design by comparing it to "the same accepted limitation already documented for better-auth's own... `storage: 'memory'` rate limiter" — false today, since `apps/auth/src/auth.ts:131`'s `rateLimit.storage` was switched to `'database'` months ago (the `0.94.16` Status entry in `CLAUDE.md`), closing that gap on the auth side. The comment should instead say this in-memory design is now the one remaining single-instance gap, tracked by the paused Task 2.29 (blocked on Edge-runtime/`ioredis` incompatibility, per its correction note in `docs/epics/platform-shell.md`).

**Deliverables:**

- `runtime/src/rate-limit.ts`: add lazy eviction to `checkGlobalRateLimit` — a module-level `lastSweepAt` timestamp (initialized to `0`) and an `EVICTION_INTERVAL_MS` constant (e.g. 5 minutes); when `now - lastSweepAt >= EVICTION_INTERVAL_MS`, iterate `buckets` once and `.delete()` every entry whose `resetAt <= now`, then set `lastSweepAt = now`. Runs as a cheap check on every call but only does a full-Map iteration once per interval, not per request.
- `runtime/src/directory.ts`: apply the identical lazy-eviction pattern to `checkDirectoryRateLimit`'s `buckets` Map — its own `lastSweepAt`/`EVICTION_INTERVAL_MS`, independent of `rate-limit.ts`'s copy (matches this module's existing documented precedent of duplicating the bucket shape rather than sharing a module, per its own top-of-file comment).
- `runtime/src/plugin-mailer.ts`: apply the same pattern to `checkBucket` (`plugin-mailer.ts:26-45`), sweeping both `pluginBuckets` and `recipientBuckets` on the same interval gate — `checkPluginMailerRateLimit` calls `checkBucket` twice per invocation (once per map), so the sweep must not run twice per call; gate it once per `checkPluginMailerRateLimit` invocation, not once per `checkBucket` call.
- `resetGlobalRateLimitForTests()`, `resetDirectoryRateLimitForTests()`, and `resetPluginMailerRateLimitForTests()` also reset each module's `lastSweepAt` back to `0`, so tests using small synthetic `now` values (already the pattern in `runtime/src/__tests__/rate-limit.test.ts`, e.g. `1_000`, `1_500`, `2_001`) stay isolated from real-time sweep state leaking across test files that share the same long-lived module instance.
- Export a test-only bucket-count helper from each of the three modules (e.g. `rateLimitBucketCountForTests()`, `directoryRateLimitBucketCountForTests()`, `pluginMailerRateLimitBucketCountForTests()`), mirroring the existing `resetXForTests()` naming convention, returning the underlying Map's `.size` — the only way to assert eviction actually shrinks the Map from outside the module, since `buckets`/`pluginBuckets`/`recipientBuckets` are not otherwise exported.
- Rewrite `rate-limit.ts:21-24`'s stale comment: remove the false comparison to better-auth's `storage: 'memory'` limiter (now `'database'`, `apps/auth/src/auth.ts:131`, per the `0.94.16` Status entry in `CLAUDE.md`); state instead that this in-memory, per-process design is now the one remaining single-instance rate-limiting gap, tracked by the paused Task 2.29 (`docs/epics/platform-shell.md`), and note the eviction added by this task bounds memory growth but does not address the multi-instance/shared-store gap Task 2.29 covers.
- New regression tests in `runtime/src/__tests__/rate-limit.test.ts`, `directory.test.ts`, and `plugin-mailer.test.ts`: seed several distinct keys, advance `now` past both the window and the eviction interval, trigger one more call (to fire the lazy sweep), and assert the bucket-count helper reports the expired entries removed while a still-active key's entry survives.

**Dependencies:** None. Builds on Task 2.28 (`runtime/src/rate-limit.ts`'s original implementation, `docs/epics/platform-shell.md`) but does not block or get blocked by the paused Task 2.29 (Redis-backed store for the same limiter) — eviction bounds single-instance memory growth; 2.29 addresses the separate multi-instance shared-counter gap.

**SRS reference:** NFR-02 (abuse prevention) — the same reference cited by Task 2.28, which this hardens. No RFC or incident doc applies; this is remediation of an audit finding, not new design.

**Review checklist:**

- `rateLimitBucketCountForTests()` (and the `directory`/`plugin-mailer` equivalents) shrinks after enough synthetic time passes for both the fixed window and the eviction interval to elapse and one more call fires the sweep — a still-live key's entry is untouched.
- The eviction sweep does not run on every call — assert (e.g. via a call-count spy or by checking the Map is not re-scanned) that a burst of calls within one `EVICTION_INTERVAL_MS` window triggers at most one sweep.
- `checkPluginMailerRateLimit`'s two `checkBucket` calls (plugin-scope, then recipient-scope) trigger the sweep gate at most once per `checkPluginMailerRateLimit` invocation, not once per map.
- `resetGlobalRateLimitForTests()`/`resetDirectoryRateLimitForTests()`/`resetPluginMailerRateLimitForTests()` reset `lastSweepAt` as well as the Map(s) — running the full existing rate-limit test files back-to-back in the same process still passes with no cross-test state leakage.
- `rate-limit.ts`'s doc comment no longer claims better-auth uses `storage: 'memory'`; it correctly states `'database'` and names Task 2.29 as the remaining single-instance gap.
- Existing behavior is unchanged for every currently-passing test in `rate-limit.test.ts`, `directory.test.ts`, and `plugin-mailer.test.ts` — allow/deny decisions, window reset, and per-key independence all still hold; eviction only removes already-expired entries, never an active one.
- `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test` — all pass.

---

#### ✅ 0.23 — Add a per-tick cap and handler timeout to the schedule tick loop

**Goal:** Close a durability gap in the Phase 1 plugin scheduler (RFC 0046, Task 3.16): `tickOnce` (`runtime/src/scheduler.ts:59-104`) walks every declared schedule in a plain `for` loop (line 75) and `await`s each due handler sequentially, with no cap on how many due handlers one tick processes and no timeout around `decl.handler(...)` (`runtime/src/scheduler.ts:85-93`) — the surrounding `try`/`catch` (lines 84-99) only catches a thrown or rejected promise, not a hang. The sibling job worker already carries both safeguards: `runtime/src/jobs.ts` bounds itself to `JOBS_PER_TICK = 20` (`runtime/src/jobs.ts:53-54`, applied at line 206, `for (let i = 0; i < JOBS_PER_TICK; i++)`) with a documented rationale ("bounds one tick's worst-case latency; remaining backlog continues next tick"), and `runtime/src/user-deletion.ts:84-92` already establishes the handler-timeout pattern for this codebase — it races each plugin deletion handler against a 30s `setTimeout` (`DELETION_TIMEOUT_MS`, `runtime/src/user-deletion.ts:17`). As plugin count grows, or if any single schedule handler is slow or hangs (e.g. an unbounded fetch to a third-party API — `ScheduleHandler` at `packages/sdk/src/types.ts:635` takes no `AbortSignal`, so there is no cooperative-cancellation contract even if the platform wanted one), one tick's wall-clock duration is the unbounded sum of every due handler's latency. Worse, `startScheduler`'s `setInterval` (`runtime/src/scheduler.ts:132-134`) fires a new `tickOnce` every 60s regardless of whether the previous invocation returned, and there is no module-level re-entrancy guard on `tickOnce` itself — only the per-schedule `state.running` flag (`runtime/src/scheduler.ts:26-27,77`), which stops one stuck schedule from being reinvoked but does nothing to stop a second, overlapping `tickOnce` call from starting and re-scanning every other schedule — so a slow tick compounds into multiple concurrently in-flight ticks.

**Deliverables:**

- Add a `SCHEDULES_PER_TICK` cap constant to `runtime/src/scheduler.ts` (`20`, matching `runtime/src/jobs.ts:54`'s `JOBS_PER_TICK`) and change `tickOnce`'s `for` loop (`runtime/src/scheduler.ts:75-103`) to stop after processing `SCHEDULES_PER_TICK` due handlers in a single call, leaving any remainder's `lastRun`/`running` state untouched so it's picked up on the very next 60s tick instead of waiting out its full `intervalMinutes` — mirroring `runtime/src/jobs.ts:53`'s "remaining backlog continues next tick" comment.
- Sort the schedule list by `lastRun` ascending (staleness-first) at the top of each `tickOnce` invocation, before applying the cap, so a tick with more due handlers than `SCHEDULES_PER_TICK` doesn't always favor whichever schedules happen to sit earlier in `PLUGIN_SCHEDULES`' declaration order and starve the rest.
- Add a `SCHEDULE_HANDLER_TIMEOUT_MS` constant (`30_000`, matching `runtime/src/user-deletion.ts:17`'s `DELETION_TIMEOUT_MS`) and wrap the `decl.handler(...)` call (`runtime/src/scheduler.ts:85-93`) in the same `Promise.race`/`setTimeout` pattern already used at `runtime/src/user-deletion.ts:84-92`. Since `ScheduleHandler` (`packages/sdk/src/types.ts:635`) accepts no `AbortSignal`, this only stops `tickOnce` from waiting on a hung handler — it cannot cancel the handler's own execution. `state.running` (`runtime/src/scheduler.ts:26-27`) must stay `true` for a timed-out schedule until its orphaned promise actually settles, so the existing per-schedule guard at line 77 still prevents that specific schedule from being reinvoked while it's notionally still running.
- Add a module-level `tickInFlight` boolean guard around the `setInterval` callback in `startScheduler` (`runtime/src/scheduler.ts:132-134`): if the previous `tickOnce` call hasn't resolved yet when the next interval fires, log a warning via `logger.warn` and skip starting a new one instead of letting overlapping `tickOnce` invocations pile up.
- Update `tickOnce`'s doc comment (`runtime/src/scheduler.ts:51-58`) to describe the cap, timeout, and orphaned-promise behavior — the current comment ("Failures are logged and never thrown ... one broken handler must not take down the tick loop") predates all three and says nothing about a hang now being bounded.
- Extend `runtime/src/__tests__/scheduler.test.ts` with regression tests, following the file's existing `toStates`/`deps`/fake-timer conventions (e.g. lines 1-40): a tick with more due handlers than the cap processes exactly the cap and leaves the rest due; a handler whose promise never resolves is abandoned after `SCHEDULE_HANDLER_TIMEOUT_MS`, logged, and does not block a second due handler in the same tick; a `tickOnce` invocation still in flight when `setInterval` fires again does not start a second concurrent `tickOnce`.
- Add a line to `docs/plugin-development.md`'s schedule-handler documentation (which already documents "thrown errors are caught and logged; the failed schedule waits out its own interval before running again", per this file's `0.101.3` Status entry) noting that a handler exceeding `SCHEDULE_HANDLER_TIMEOUT_MS` is treated the same way for tick-loop purposes, plus the caveat that the handler's own async work may keep running in the background since there is no cancellation signal.

**Dependencies:** None — `runtime/src/scheduler.ts` and its Phase 1 design already shipped (Task 3.16, RFC 0046); this hardens the existing implementation in place without changing its external contract (manifest `schedules[]`, `ScheduleContext`/`ScheduleHandler`).

**SRS reference:** RFC 0046 (Plugin background jobs and schedules, Phase 1 scheduler — docs/rfcs/0046-plugin-jobs.md). No SRS/NFR item directly bounds tick-loop latency today; this closes an operational gap RFC 0046's Phase 1 scope left unaddressed, not new design — remediation, not a spec change.

**Review checklist:**

- A synthetic schedule handler whose promise never resolves is abandoned by `tickOnce` after `SCHEDULE_HANDLER_TIMEOUT_MS`, logged via `logger.error`, and does not prevent a second due handler in the same tick from completing (assert both outcomes under fake timers).
- A tick with more due handlers than `SCHEDULES_PER_TICK` processes exactly the cap; the untouched remainder's `lastRun` is unmodified and it is picked up on the very next tick rather than waiting a full `intervalMinutes`.
- `startScheduler` with a handler slow enough to still be in flight when the next `setInterval` fires does not start a second concurrent `tickOnce` — verified via a call-count assertion, not just absence of a thrown error.
- A timed-out schedule's `state.running` stays `true` until its orphaned handler promise actually settles; a tick that runs within that window still skips it, so the existing guard at `runtime/src/scheduler.ts:77` continues to hold under the new behavior.
- All existing `runtime/src/__tests__/scheduler.test.ts` tests (e.g. "invokes a never-run schedule on the first tick") still pass unmodified — the cap/timeout/re-entrancy guard are no-ops for the common case of few, fast handlers.
- `pnpm --filter runtime exec vitest run src/__tests__/scheduler.test.ts` and full `pnpm test` both pass; `pnpm format:check && pnpm lint && pnpm typecheck` are clean.
- `docs/plugin-development.md`'s schedule-handler section documents the timeout behavior and the no-cancellation caveat for `SCHEDULE_HANDLER_TIMEOUT_MS`.

---

#### ✅ 0.24 — Isolate checkBootCompatibility() from boot-abort faults; add test coverage

**Goal:** Close a gap in `0.101.8`'s own boot-isolation fix: `runtime/instrumentation.ts`'s `register()` wraps the scheduler (`instrumentation.ts:99-108`) and job-worker (`instrumentation.ts:114-121`) dynamic imports in try/catch specifically because an earlier uncaught fault in one of them took down the entire platform at boot — but the `await checkBootCompatibility();` call one step earlier (`instrumentation.ts:38-39`) is still bare. `checkBootCompatibility()` itself (`runtime/src/boot-compat.ts`) has no try/catch anywhere in its body despite calling `getPlatformDb()` (`boot-compat.ts:18`) and `setPluginEnabled()` (`boot-compat.ts:28`) — real DB calls that can throw, including during the exact class of Postgres connectivity trouble this codebase's own incident history (the `0.101.9` advisory-lock incident, and the `2026-07-24-rfc-0071-encryption-rollout.md` incident before it) shows actually happens in production — and `checkCompatibility()` (`packages/manifest/src/compatibility.ts:40`,`:51`), whose `semver.gt()` calls throw on a malformed `minPlatformVersion`/`maxPlatformVersion` string. If any of this throws, `register()` aborts before the scheduler, job worker, backup worker, or event broker ever start, reopening the exact "one fault kills all of boot" failure mode the adjacent fix closed, one call earlier in the same function. There is also no `runtime/src/__tests__/boot-compat.test.ts` at all.

**Deliverables:**

- Wrap `await checkBootCompatibility();` (`runtime/instrumentation.ts:38-39`) in try/catch. Log via `console.error` (not the structured `logger` — its own dynamic import doesn't happen until `instrumentation.ts:44`/`:56`, after this call site, matching `runAllPluginMigrations()`'s own catch at `runtime/src/plugin-migrations.ts:101-103`, which uses `console.error` for the identical reason) and let boot continue into the scheduler/job-worker/backup-worker/event-broker steps that already follow, mirroring the doc-comment pattern already attached to the scheduler (`instrumentation.ts:83-98`) and job-worker (`instrumentation.ts:110-113`) try/catch blocks.
- Add a per-plugin try/catch inside `checkBootCompatibility()`'s `for` loop (`runtime/src/boot-compat.ts:20-35`), mirroring `runAllPluginMigrations()`'s per-plugin isolation (`runtime/src/plugin-migrations.ts:71-104`) so a single plugin's `checkCompatibility()` throw (`packages/manifest/src/compatibility.ts:40`/`:51` — `semver.gt()` throws a `TypeError` on a malformed `minPlatformVersion`/`maxPlatformVersion` string) or a single `setPluginEnabled()` write failure (`boot-compat.ts:28`) doesn't stop every subsequent plugin in `getInstalledPlugins()`'s iteration order from being evaluated. Log with `console.error('[boot-compat] Failed to check compatibility for plugin "${manifest.id}":', err)` and continue to the next manifest — this inner catch is a distinct layer from the outer instrumentation.ts one above: it does not cover the `getPlatformDb()` call at `boot-compat.ts:18`, which runs once before the loop starts and is only reachable by the outer catch.
- Add `runtime/src/__tests__/boot-compat.test.ts` (none exists today) mocking `@sovereignfs/db` (`getPlatformDb`, `setPluginEnabled`), `@sovereignfs/manifest` (`checkCompatibility`), `../registry` (`getInstalledPlugins`), `../plugin-compat` (`markIncompatible`, `recordWarnings`), and `../platform-version` (`getPlatformVersion`) — following the `vi.hoisted()`/`vi.mock()` pattern already used in `runtime/src/__tests__/plugin-migrations.test.ts`. Cover: (1) normal path — a mix of compatible, warning, and incompatible manifests each drive the correct `markIncompatible`/`setPluginEnabled(false)`/`recordWarnings` calls; (2) one manifest's `checkCompatibility()` call throwing (simulating `semver.gt()`'s `TypeError` on a malformed version string) is caught per-plugin and does not stop the loop from reaching and correctly evaluating the manifests after it in iteration order — deliberately ordered non-last in the mocked registry, matching `plugin-migrations.test.ts`'s own documented reasoning for why loop-isolation bugs only surface when the offending entry isn't last; (3) one manifest's `setPluginEnabled()` call rejecting is caught the same way and does not stop evaluation of subsequent manifests.
- Update the `register()` doc comment at the top of `runtime/instrumentation.ts` (step 4, currently 'Check all installed plugins for platform-version compatibility...') to note the fault-isolation behavior, matching how steps 6/7's comments already describe it for the scheduler/job worker.

**Dependencies:** None. `0.101.8`'s scheduler/job-worker isolation fix (`instrumentation.ts:83-121`, commit `97a18339`) already established the try/catch pattern this task extends one step earlier in the same function.

**SRS reference:** None — this is remediation, not new design. Related prior work: `0.101.8`'s Status entry (scheduler/job-worker boot isolation, commit `97a18339`); `docs/incidents/2026-07-24-rfc-0071-encryption-rollout.md` (the original per-plugin migration-loop isolation incident `runAllPluginMigrations()` was hardened against, which this task's per-plugin loop fix mirrors).

**Review checklist:**

- `runtime/instrumentation.ts`'s `checkBootCompatibility()` call is wrapped in try/catch; a thrown/rejected `checkBootCompatibility()` is logged and `register()` continues on to start the scheduler, job worker, backup worker, and event broker — verified by a test or a manual reproduction (e.g. temporarily making `checkBootCompatibility` throw and confirming the process still serves requests), not just by reading the diff.
- `checkBootCompatibility()`'s own `for` loop (`runtime/src/boot-compat.ts`) has a per-plugin try/catch: one manifest's `checkCompatibility()` throw or `setPluginEnabled()` rejection is logged and does not prevent manifests later in `getInstalledPlugins()`'s iteration order from being checked.
- `runtime/src/__tests__/boot-compat.test.ts` exists and passes, covering the normal path plus both isolation cases (a throwing `checkCompatibility()` and a rejecting `setPluginEnabled()`), with the failing manifest deliberately not last in the mocked list.
- `pnpm --filter runtime exec vitest run src/__tests__/boot-compat.test.ts` passes.
- Full `pnpm test`, `pnpm typecheck`, `pnpm lint`, and `pnpm format:check` all still pass.
- No plugin's page/action/schedule/job behavior changes for the normal (no-fault) path — this is fault-path-only isolation, not a behavior change to compatibility checking itself.

---

#### ✅ 0.25 — Finish or explicitly stub backup-completion notifications; add real test coverage

**Goal:** Close the second of 8.16's two still-open follow-ups (data-sovereignty.md:588-595 progress note) by finishing `runtime/src/backup-notification.ts`'s `notifyBackupCompletion()` for the case it can actually serve today — the user who requested a backup — and explicitly stubbing, with a logged warning rather than silence, the one case it genuinely can't: fanning an instance-scope, requester-less job out to all admins, since no primitive anywhere in `packages/db`/`runtime/src` currently enumerates admin user IDs (role data lives in the separate `apps/auth` service). Right now the function is comments-only after acquiring the broker — its `_payload` parameter is unused, it never calls `broker.publish()` or writes a `notifications` row, and it's called from both the success and failure branches of `backup-worker.ts`'s `claimAndRunJob()` (lines 106 and 111), so every completed or failed backup job today produces zero notification despite the integration point looking fully wired. Compounding this, the function's only existing test coverage (`backup-worker.test.ts`) mocks `notifyBackupCompletion` to a no-op that is behaviorally indistinguishable from the real (broken) implementation, so the gap is structurally invisible to CI — no test in the repo can fail because this doesn't work.

**Deliverables:**

- Widen `BackupNotificationPayload` in `runtime/src/backup-notification.ts:3-8` with `recipientUserId: string | null` (the `requestedByUserId` from the `backup_jobs` row — the field the doc comment already says should exist but doesn't).
- Update both call sites in `runtime/src/backup-worker.ts:106` and `:111-116` (`claimAndRunJob`'s success and failure branches) to pass `recipientUserId: job.requestedByUserId` alongside the existing `jobId`/`scope`/`status`/`errorMessage` fields.
- Implement `notifyBackupCompletion()` in `runtime/src/backup-notification.ts` to actually send when `recipientUserId` is non-null: call `@sovereignfs/db`'s `sendNotification(pdb, { id: randomUUID(), recipientUserId, source: 'backup', sourceType: 'platform', title, body, url, category: 'backup' })` (via `getPlatformDb()`, matching `backup-worker.ts`'s own import), then `getBroker()?.publish(recipientUserId, { notificationId, userId: recipientUserId, title, body, url, category: 'backup', source: 'backup' })`, then `fanOutPushToUser(recipientUserId, { title, body, url, category: 'backup' })` from `runtime/src/push.ts` (omit `source` in the push payload — `resolvePayload` in `push.ts:52-55` only uses it for a per-plugin icon fallback that doesn't apply to a platform-originated notification). Compose `title`/`body`/`url` from `payload.status`/`payload.scope`/`payload.errorMessage` (e.g. "Backup complete" / "Backup failed: <errorMessage>", linking to wherever the job's download route will live once 8.16/8.17 ship). This deliberately does NOT go through `sdk.notifications.send()`/`requireHost().notifications.send()` (`runtime/src/sdk-host.ts`'s `notifications.send`, ~line 823) — that path hardcodes `source: pluginId, sourceType: 'plugin'` and is meant for a plugin acting inside a real request; `backup-worker.ts`'s tick runs outside any request context (the same class of gap `sdk.storage`/`sdk.env`/`sdk.db.getClient()` already hit and fixed via background-context fallbacks, per this file's own Status history) and `SendNotificationInput.sourceType` already has a `'platform'` literal (`packages/db/src/platform-db.ts:2724`) for exactly this case — call the DB/broker/push primitives directly instead.
- When `recipientUserId` is null (an instance-scope job with no identifiable requester — the only case left un-handled once the above ships, since there is no existing primitive anywhere in `packages/db` or `runtime/src` to enumerate admin user IDs, confirmed by search — user/role data lives in the separate `apps/auth` service, not the platform DB), do not silently no-op: call `logger.warn('backup-notification: instance-scope job has no requester to notify; admin fan-out is not implemented', { jobId, scope })` and return. Replace the module doc comment's current claim ("the notification is sent ... For instance-level backups, the notification goes to all admins") with an accurate statement of what actually ships: notifies the requesting user when known; admin broadcast fan-out for a requester-less instance job is an explicit, logged gap pending a cross-service admin-listing primitive, not silently dropped.
- Add `runtime/src/__tests__/backup-notification.test.ts` exercising the real (unmocked) `notifyBackupCompletion`, following `runtime/src/__tests__/push.test.ts`'s established mocking convention (`vi.mock('@sovereignfs/db', ...)`, `vi.mock('../db', ...)`, `vi.mock('../notification-broker', ...)`, `vi.mock('../push', ...)`, `vi.mock('../logger', ...)`): asserts `sendNotification`/`broker.publish`/`fanOutPushToUser` are all called with the right recipient/title/category for both `status: 'complete'` and `status: 'failed'` when `recipientUserId` is set; asserts none of the three are called and `logger.warn` fires instead when `recipientUserId` is null; asserts a `getBroker() === null` (polling-only deployment) still writes the notification row and skips only the broker publish, not the whole function.
- Update `runtime/src/__tests__/backup-worker.test.ts`'s existing `vi.mock('../backup-notification', ...)` call-site assertions to include `recipientUserId: job.requestedByUserId` in the expected payload for both the success and failure branches, so the widened shape is covered at the call-site boundary as well as in the new dedicated test.
- Update `docs/epics/data-sovereignty.md`'s 8.16 "Progress note" (~line 588-595, the "Notification-on-completion is still a no-op stub" bullet): either remove that bullet if this task closes it fully, or narrow it to name only the remaining admin-fan-out gap — do not leave the note claiming the whole mechanism is unimplemented once the requester-notification path ships.

**Dependencies:** 8.16 (this task finishes one of its two still-open deliverables; the schema, worker orchestration, and broker/push infrastructure it depends on already exist and are tested). No new blocking dependency.

**SRS reference:** RFC 0084 (docs/rfcs/0084-ui-driven-backup-restore.md) — this task closes the \"Notification-on-completion is still a no-op stub\" gap called out in epic task 8.16's own Progress note (docs/epics/data-sovereignty.md).

**Review checklist:**

- `grep -n 'TODO: wire the actual notification sending' runtime/src/backup-notification.ts` returns nothing.
- A backup job completing with a non-null `requestedByUserId` produces a real row in the `notifications` table (verified against a live sqld/pg instance or via the mocked `sendNotification` assertion) with `source: 'backup'`, `sourceType: 'platform'`, and a title reflecting success/failure.
- The same completion also calls `getBroker()?.publish()` (when a broker is configured) and `fanOutPushToUser()` — an in-app bell and a push notification both fire, not just a DB row.
- An instance-scope job with `requestedByUserId: null` logs a clear warning naming the unimplemented admin fan-out, and does not throw or silently return with no trace.
- `runtime/src/__tests__/backup-notification.test.ts` imports the real `notifyBackupCompletion` (not a mock of the module under test) and fails if the TODO stub is reintroduced.
- `runtime/src/__tests__/backup-worker.test.ts`'s mock-based assertions include `recipientUserId` in the expected payload.
- `pnpm --filter runtime exec vitest run backup-notification backup-worker` passes.
- `pnpm format:check && pnpm lint && pnpm typecheck` pass.
- `docs/epics/data-sovereignty.md`'s 8.16 progress note no longer claims the notification mechanism is entirely unimplemented — it's either removed or narrowed to the remaining admin-fan-out gap.

---

#### ✅ 0.26 — Add explanations to the login/2FA eslint-disable casts, or replace them with a typed helper

**Goal:** Close a CLAUDE.md code-quality violation confirmed live in four login/2FA client components: six `// eslint-disable-next-line @typescript-eslint/no-explicit-any` comments carry no trailing explanation, violating the repo rule "Never disable ESLint rules inline (`// eslint-disable`) without a comment explaining why." All six exist for the same reason — `authClient`'s inferred type loses the `twoFactorClient`/`passkeyClient` plugin method signatures because `runtime/src/auth-client.ts:27` and `apps/auth/src/auth-client.ts:27` register `passkeyClient() as unknown as BetterAuthClientPlugin` (a documented, necessary cast for a peer-version mismatch between `@better-auth/passkey` and `better-auth`), so every call site that reaches `authClient.signIn.passkey()` or `authClient.twoFactor.*` has to re-derive its own untyped cast to compile: `runtime/app/login/login-form.tsx:72-73`, `runtime/app/login/2fa/challenge-form.tsx:32-33,50-51`, `apps/auth/app/login/login-form.tsx:70-71`, `apps/auth/app/login/2fa/challenge-form.tsx:37-38,55-56`. The audit finding's characterization of `plugins/account/app/_components/PasskeySection.tsx` as "the identical problem solved correctly" is only half right as of this reading: its plugin-registration cast at lines 110-112 does carry a trailing explanation ("Cast to silence the minor peer-version type mismatch between @better-auth/passkey and better-auth (runtime-compatible)."), but that same file has its own separate, equally bare `// eslint-disable-next-line @typescript-eslint/no-explicit-any` at line 121 for `(client as any).passkey.addPasskey(...)` — a distinct, undocumented instance of the exact same problem the audit finding didn't catch, on an account-settings component outside this task's login/2FA scope. Rather than pasting the same boilerplate explanation onto six near-duplicate casts, fix it once at the source: give the augmented client a real type in each app's own `auth-client.ts` (duplicated per app, not shared — matching this repo's existing convention that `apps/auth` deliberately duplicates rather than imports shared auth logic) and have all four consuming files use that instead of re-deriving `any` casts.

**Deliverables:**

- Add an `AuthClientWithPlugins` type alias to `runtime/src/auth-client.ts` that types `signIn.passkey` (matching the actual call shape used at `runtime/app/login/login-form.tsx:73` and `runtime/app/login/2fa/challenge-form.tsx:51`: `() => Promise<{ data: unknown; error: { message?: string } | null }>`) and `twoFactor.verifyTotp`/`twoFactor.verifyBackupCode` (matching `runtime/app/login/2fa/challenge-form.tsx:33,36-37`: `(opts: { code: string }) => Promise<{ data: unknown; error: { message?: string } | null }>`); export a `typedAuthClient` constant assigned `authClient as AuthClientWithPlugins` once, immediately after the existing `authClient` export at `runtime/src/auth-client.ts:29`.
- Mirror the identical `AuthClientWithPlugins`/`typedAuthClient` definition in `apps/auth/src/auth-client.ts` (duplicated, not imported from `runtime` — the two apps do not share code) immediately after its own `authClient` export at line 29.
- Update `runtime/app/login/login-form.tsx:72-73` to call `typedAuthClient.signIn.passkey()` and delete the `eslint-disable-next-line` comment and the `(authClient.signIn as any)` cast; add `typedAuthClient` to the existing `import { authClient } from '@/src/auth-client'` at line 7.
- Update `runtime/app/login/2fa/challenge-form.tsx:32-33` (`const twoFactor = (authClient as any).twoFactor;` → `const twoFactor = typedAuthClient.twoFactor;`) and `:50-51` (`(authClient.signIn as any).passkey()` → `typedAuthClient.signIn.passkey()`), deleting both `eslint-disable-next-line` comments and updating the import at line 6.
- Apply the same two edits to `apps/auth/app/login/login-form.tsx:70-71` and `apps/auth/app/login/2fa/challenge-form.tsx:37-38,55-56`, deleting all four remaining bare disable comments.
- Leave `plugins/account/app/_components/PasskeySection.tsx:121`'s own bare `eslint-disable-next-line` (`(client as any).passkey.addPasskey(...)`) untouched — out of scope for this task's login/2FA title; file a follow-up epic task if it should be closed the same way.

**Dependencies:** None.

**SRS reference:** None — this is remediation of an existing CLAUDE.md code-quality rule ("Never disable ESLint rules inline ... without a comment explaining why"), not new design. The underlying passkey feature these casts route through is RFC 0012 (Passkeys & TOTP multi-factor auth); this task changes no auth behavior, only the type-safety of the client calling it.

**Review checklist:**

- `grep -rn "eslint-disable-next-line @typescript-eslint/no-explicit-any" runtime/app/login apps/auth/app/login` returns no matches (all six removed, none merely annotated).
- `pnpm lint` passes with zero new `no-explicit-any` suppressions introduced anywhere else to compensate.
- `pnpm typecheck` passes for both `runtime` and `apps/auth` — `typedAuthClient.signIn.passkey`, `typedAuthClient.twoFactor.verifyTotp`, and `typedAuthClient.twoFactor.verifyBackupCode` all resolve without an `any` cast at every one of the four call sites.
- `runtime/src/auth-client.ts` and `apps/auth/src/auth-client.ts` each still contain exactly one documented `any`/`unknown` cast — the pre-existing, already-explained `passkeyClient() as unknown as BetterAuthClientPlugin` peer-version cast — unchanged.
- Manual verification in a local dev session (no automated test exists for these four components today): email/password sign-in, passkey sign-in on both `/login` (runtime) and `apps/auth`'s own `/login`, and both TOTP and backup-code verification on `/login/2fa` still complete successfully and show the same error messages on failure as before the refactor.
- `plugins/account/app/_components/PasskeySection.tsx:121`'s own bare disable comment is confirmed still present and explicitly out of scope — not silently left broken by an incomplete search-and-replace across the repo.

---

## Related RFCs

- [RFC 0006 — Deployment & upgrade strategy](../rfcs/0006-deployment-upgrade-strategy.md)
- [RFC 0010 — Test organization](../rfcs/0010-test-organization.md)
- [RFC 0019 — Test setup & seeding](../rfcs/0019-test-setup-and-seeding.md)
- [RFC 0026 — Non-Docker deployment](../rfcs/0026-non-docker-deployment.md)
- [RFC 0071 — SQLite at-rest encryption](../rfcs/0071-sqlite-at-rest-encryption.md)
  (Task 0.19)

## Related Docs

- [self-hosting.md](../self-hosting.md)
- [testing-e2e.md](../testing-e2e.md)
- [upgrade.md — runtime version map + v1.0.0 checklist](../upgrade.md)
- [upgrade.md](../upgrade.md)
