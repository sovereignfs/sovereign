# Epic 0: Infrastructure

> The workspace every package and app builds in, the CI that guards it, the
> repository's own documents, the Docker image operators run, and the suite
> that proves a phase is done.

## Status

📋 Planned

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

#### 📋 0.1 — Workspace skeleton

**Goal:** A pnpm + Turborepo workspace that installs from a frozen lockfile on
every supported platform.

**Deliverables:**

- Root `package.json` (`private`, `packageManager` pinned, `engines.node` ≥ 24.15),
  `.node-version`, `.npmrc`, `.gitignore`, `.editorconfig`
- `pnpm-workspace.yaml`: workspace globs (`apps/*`, `packages/*`); the shared
  `catalog:` (with `next` at the latest stable release); advisory
  `overrides`, each capped to its consumer's declared
  range; `supportedArchitectures` covering darwin/linux, arm64/x64, glibc/musl;
  `allowBuilds`
- `turbo.json` with `build`, `dev`, `lint`, `typecheck`, `test`
- Prettier (single quotes, semicolons, trailing commas `all`, width 100,
  2-space) and ESLint 9 flat config with `typescript-eslint` strict and
  `eslint-config-prettier`; pre-commit hooks running both
- Root scripts the skills rely on: `format`, `format:check`, `lint`,
  `typecheck`, `test`, `build`, `docs:check-links`, `verify:push` (run by a
  pre-push hook)
- A test that fails when `.agents/skills/` and `.claude/skills/` differ
  (except `agents/openai.yaml`)
- Root `package.json` at version `0.0.0`; `CURRENT_TASK.md` gitignored
- `packages/tsconfig` (already imported from legacy with its history before the
  first push) wired into the workspace

**Dependencies:** none

**Spec reference:** —

**Review checklist:**

- `pnpm install --frozen-lockfile` succeeds on macOS and in `node:24-alpine`
- `pnpm format:check` and `pnpm lint` pass
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

#### 📋 0.3 — Continuous integration

**Goal:** Every PR and every push to `main` is checked, and only what a change
can affect is run.

**Deliverables:**

- A first job that works out what the change touches; documentation-only
  changes run nothing else
- Format, lint, typecheck, unit tests, build
- Database test legs: sqld, SQLite file, PostgreSQL
- CI runs on pull requests targeting `main` only — no push-to-`main` trigger;
  skipped while the PR is a draft, labelled `skip-ci`, or the head commit says
  `[skip ci]`
- CodeQL and a scheduled dependency audit

**Dependencies:** 0.1

**Spec reference:** —

**Review checklist:**

- A docs-only PR runs only the change-detection job
- A deliberately failing test on one database leg fails CI

#### 📋 0.4 — Repository documents `[parallel]`

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

**Dependencies:** 0.2, 1.2

**Spec reference:** §3.15, §3.17.1

**Review checklist:**

- A fresh instance boots from the documented variables on each of the three
  databases
- The image boots with no `.env` baked in

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
