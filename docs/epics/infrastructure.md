# Epic 0: Infrastructure

> The workspace every package and app builds in, the CI that guards it, the
> repository's own documents, the Docker image operators run, and the suite
> that proves a phase is done.

## Status

⏳ In Progress

## Overview

`sovereign-core` starts from a founding manifesto and the imported history of
`packages/ui`, `packages/bridge` and `packages/mailer`. This epic turns that
into a working pnpm + Turborepo workspace, adds `apps/core`, and makes the
whole thing buildable, testable and deployable. The last task of each phase
in this epic is that phase's acceptance suite.

## Related

- [docs/specs/core-app.md](../specs/core-app.md) — §1.1, §3.5, §3.15, §3.17
- [docs/development-workflow.md](../development-workflow.md) — task lifecycle, git flow, versions
- [docs/architecture-rules.md](../architecture-rules.md) — hard rules, including lessons from the legacy codebase

## Tasks

#### ✅ 0.1 — Workspace skeleton

**Goal:** A pnpm + Turborepo workspace that installs from a frozen lockfile on
every supported platform.

**Deliverables:**

- Root `package.json` (`private`, `packageManager` pinned, `engines.node` ≥ 24.15),
  `.node-version`, `.npmrc`, `.gitignore`, `.editorconfig`
- `pnpm-workspace.yaml`: workspace globs (`apps/*`, `packages/*`); the shared
  `catalog:` (with `next` at the latest stable release); `overrides`, each
  capped to its consumer's declared range (none needed yet); `supportedArchitectures`
  covering darwin/linux, arm64/x64, glibc/musl; `allowBuilds`; a strict
  release-age gate; and the one scoped peer allowance for `eslint-plugin-jsx-a11y`
- `packages/ui`, `packages/bridge` and `packages/mailer` **excluded** from the
  workspace until task 2.1 (they expect the legacy catalog, and `bridge` imports
  types from the removed SDK), and left out of Prettier, ESLint and the
  link checker for the same reason; the exclusions are listed in one place each,
  with a pointer to 2.1
- `turbo.json` with `build`, `dev`, `lint`, `typecheck`, `test`
- Prettier (single quotes, semicolons, trailing commas `all`, width 100,
  2-space) and ESLint 10 flat config with `typescript-eslint` strict, jsx-a11y
  and `eslint-config-prettier`; a lint rule that stops `packages/*` importing the
  core app; pre-commit hooks running Prettier and ESLint
- Root scripts the skills rely on: `format`, `format:check`, `lint`,
  `typecheck`, `test`, `build`, `docs:check-links`, `verify:push` (run by a
  pre-push hook)
- `scripts/check-doc-links.ts`: every relative Markdown link resolves; targets a
  later task will create are listed in `PLANNED_TARGETS` and accepted only while
  missing
- Tests that fail when `.agents/skills/` and `.claude/skills/` differ (except
  `agents/openai.yaml`), when the package-boundary or accessibility lint rules
  stop firing, and when the link checker misbehaves
- Root `package.json` at version `0.0.0`; `CURRENT_TASK.md` gitignored
- `packages/tsconfig` (already imported from legacy with its history before the
  first push) wired into the workspace

**Dependencies:** none

**Spec reference:** —

**Review checklist:**

- `pnpm install --frozen-lockfile` succeeds on macOS and in `node:24-alpine`
  (the lockfile carries the glibc and musl variants of native packages for
  arm64 and x64; a git-less copy installs, as a Docker build context would).
  Run in `node:24-alpine` on aarch64 and on x86_64: a frozen install, lint,
  typecheck and the tests all pass
- `pnpm format:check` and `pnpm lint` pass
- `pnpm verify:push` passes
- Each new guard is seen to fail when broken: skills drift, the package
  boundary, the accessibility rules, a dead link
- `git rev-list --max-parents=0 HEAD` returns only the manifesto commit

#### 📋 0.2 — `apps/core` skeleton

**Goal:** An empty Next.js app, on the latest stable release, that is already
secure by default and drawn with the design system.

**Deliverables:**

- `apps/core` on the latest stable Next.js (16.4.3 as of 2026-10-26; check the
  npm `latest` tag when the task starts), App Router, TypeScript, extends
  `packages/tsconfig`
- `@sovereignfs/ui` tokens and components wired in; light and dark themes
- `proxy.ts` applying a nonce-based Content Security Policy on every return
  path; no `'unsafe-inline'` in `script-src`
- `GET /api/health` reporting app and database status only
- Start-up refuses to run without required secrets (uses `packages/config`)

**Dependencies:** 0.1, 1.1, 2.1

**Spec reference:** §1.3, §3.5

**Review checklist:**

- `pnpm --filter core build` and `start` work; `/api/health` answers
- Every response carries the CSP header with a fresh nonce
- Start-up without `SV_AUTH_SECRET` fails with a clear message

#### ⏳ 0.3 — Continuous integration

**Goal:** Every pull request is checked, and only what a change can affect is run.

**Deliverables:**

- `.github/workflows/ci.yml` and a `setup` composite action (pnpm with its store
  cached, Node from `.node-version`, a frozen-lockfile install)
- A first job, **Classify changes**, that runs `scripts/ci-changes.ts` under plain
  Node (nothing installed) and decides which other jobs run. A change to
  documentation only runs nothing else; an unrecognised path, an empty diff and a
  change to the CI definition run everything. The script is tested, including as
  CI invokes it
- Jobs for format, lint, typecheck, test and build; a dependency audit that runs
  when a manifest or the lockfile changes
- Database legs for sqld, a SQLite file and PostgreSQL, each started the way
  production will run it (sqld `v0.24.33` with `--enable-namespaces` through
  `docker run`, since `services:` cannot set a command; PostgreSQL 18). Vitest has
  two projects: `unit` (`pnpm test`) and `db` (`pnpm test:db`, the
  `*.db.test.ts` files, run once per dialect with `SV_DB_DIALECT`). A smoke test
  per dialect gives each leg something real to prove: sqld keeps namespaces apart,
  a SQLite file round-trips, PostgreSQL isolates schemas and returns `bigint` as a
  string. A leg with no dialect set fails rather than passing empty
- Triggers: pull requests targeting `main` only (no push trigger) and a manual
  `workflow_dispatch`; no job runs while the PR is a draft or labelled `skip-ci`,
  and GitHub skips the run for `[skip ci]` in the head commit
- `codeql.yml` (also on pushes to `main`), the weekly `dependency-audit.yml`, and
  `dependabot.yml` (weekly, seven-day cooldown, Next.js and better-auth in their own
  groups, no TypeScript or `@types/node` majors)
- Hardening: third-party actions pinned to commit SHAs, `persist-credentials: false`
  on every checkout, `contents: read`, job timeouts, `github` context passed to
  scripts through `env`. `actionlint` and `zizmor` pass (zizmor's one remaining
  preference, the `$/` form for local actions, is deliberately not adopted)

**Dependencies:** 0.1

**Spec reference:** —

**Review checklist:**

- A docs-only PR runs only the change-detection job: the classifier, run as the
  workflow runs it over a real documentation-only commit, turns every job off
- A deliberately failing test on one database leg fails CI: a leg pointed at a
  dead PostgreSQL exits non-zero, `fail-fast: false` keeps the other legs
  reporting, and each leg passed against its real service
- `actionlint` is clean and `zizmor` reports nothing but the deliberate `./` choice
- Not verifiable here: the first real run on a GitHub pull request (labels, drafts
  and the matrix cannot be exercised locally)

#### ✅ 0.4 — Repository documents `[parallel]`

**Goal:** People and agents know how to work here before code lands.

**Deliverables:**

- `README.md` (what core is, licence table: AGPL-3.0 for `apps/core`, MPL-2.0
  for `packages/*`) and `SECURITY.md`
- Already on `main` from the bootstrap (kept current by this task, not
  re-created): `AGENTS.md` (the conventions) and `CLAUDE.md` (imports it);
  `CONTRIBUTING.md`; `docs/development-workflow.md`; `docs/multi-agent.md`;
  `docs/architecture-rules.md` (rules carried over from the legacy codebase);
  the `sv-*` skills in `.agents/skills/` and `.claude/skills/`; the GitHub PR
  and issue templates
- `ROADMAP.md` and `docs/epics/` kept in step

**Dependencies:** none

**Spec reference:** —

**Review checklist:**

- Every link resolves
- `AGENTS.md` names `docs/specs/core-app.md` as the source of truth, and
  `CLAUDE.md` holds no conventions of its own

#### 📋 0.5 — Docker image and compose

**Goal:** An operator can run core from a published image on each supported
database.

**Deliverables:**

- `sovereign-core` image (multi-stage, `node:24-alpine`), shipping its
  migrations and every CLI it needs at runtime
- Compose files: sqld (default), PostgreSQL overlay, single-container SQLite
  file
- Development: a persistent sqld container started by `pnpm dev`; a seed
  script for local accounts
- `.env.example` listing every variable core reads
- Core's public URL resolves and is reachable from inside its own container
  (a hairpin route or a host entry in the compose files), because checking an
  `id_token_hint` makes core fetch its own signing keys from `SV_URL` (spec
  §3.6.5); documented for `sovereign-infra`

**Dependencies:** 0.2, 1.2

**Spec reference:** §3.15, §3.17.1, §3.6.5

**Review checklist:**

- A fresh instance boots from the documented variables on each of the three
  databases
- The image boots with no `.env` baked in
- RP-initiated logout with an `id_token_hint` works from inside the compose
  setup

#### 📋 0.6 — Phase 1 acceptance

**Goal:** Prove Phase 1 is done, end to end, in a real browser.

**Deliverables:**

- A Playwright suite covering every item of spec §3.17, including a virtual
  authenticator for passkeys
- An off-the-shelf OIDC relying party run as a test app, plus a second,
  minimal test client
- A security review of Phase 1 (CSP, auth flows, token handling, rate limits,
  capability checks); findings fixed or recorded

**Dependencies:** all other Phase 1 tasks

**Spec reference:** §3.17

**Review checklist:**

- The suite passes on all three databases in CI
- Each §3.17 item maps to at least one named test
