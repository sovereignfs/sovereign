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
- `docs/examples/pm2.example.config.js` — canonical PM2 ecosystem config (same
  output as `sv setup pm2` with default arguments)
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

**Goal:** Wire up Playwright as the browser-automation layer and write 20 golden-path tests
covering the critical user flows: auth (login/logout/redirect), launcher navigation, Account
and Console plugin pages, platform shell navigation (root rewrite, brand link, avatar menu),
and the monetization paywall flow.

**Scope:**

- `playwright.config.ts` — config with dual `webServer` (auth `:3001`, runtime `:3000`),
  `globalSetup`, chromium-only in CI, `retries: 1` to absorb Next.js lazy-compilation 404s
- `__tests__/e2e/global-setup.ts` — seeds test users via `pnpm sv seed`, saves storage state
  for both users, generates test Ed25519 keypair for paywall spec
- `__tests__/e2e/fixtures.ts` — `adminPage` / `userPage` fixture helpers
- Six spec files (20 tests total): `auth`, `launcher`, `account`, `console`, `navigation`, `paywall`
- `.github/workflows/e2e.yml` — CI job, triggers on `push: main` with `paths` filter (source only,
  not docs/md)
- `docs/testing-e2e.md` — local run guide + full coverage/deferred-flow table

**Version bumps:** none (devDependency only — `@playwright/test`; no package API changes).

**SRS reference:** RFC 0010 (test organisation); SRS NFR-11 (accessibility/quality).

**Review checklist:**

- `pnpm test:e2e` passes all 20 tests locally against `pnpm dev` servers
- `pnpm test` (Vitest) still passes unchanged (no `.spec.ts` picked up)
- `pnpm lint` passes (`__tests__/e2e/**` and `playwright.config.ts` excluded from ESLint)
- `e2e.yml` workflow appears in GitHub Actions after merge; passes on next source-code push to main

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

#### 📋 0.14 — Typecheck performance and project references

**Goal:** Improve contributor feedback time as the monorepo grows, without
making Next.js app typechecking or Turbo caching more fragile.

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
  - `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm test:e2e` pass in CI.
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

## Related RFCs

- [RFC 0006 — Deployment & upgrade strategy](../rfcs/0006-deployment-upgrade-strategy.md)
- [RFC 0010 — Test organization](../rfcs/0010-test-organization.md)
- [RFC 0019 — Test setup & seeding](../rfcs/0019-test-setup-and-seeding.md)
- [RFC 0026 — Non-Docker deployment](../rfcs/0026-non-docker-deployment.md)

## Related Docs

- [self-hosting.md](../self-hosting.md)
- [testing-e2e.md](../testing-e2e.md)
- [upgrade.md — runtime version map + v1.0.0 checklist](../upgrade.md)
- [upgrade.md](../upgrade.md)
