# AGENTS.md

Guidance for every AI agent working in this repository (Codex reads this file
directly; Claude Code loads it through `CLAUDE.md`). It is the one copy of the
conventions — do not duplicate them elsewhere.

## What this is

**Sovereign Core** — a self-hostable identity and foundation service. Anyone
can deploy it and point any OpenID Connect application at it for sign-in; in
later phases it also offers shared services (mail, notifications, activity,
backups) to apps. Core is **generic**: it knows OAuth clients, never particular
apps. This repository also holds the shared packages every Sovereign app uses
(`@sovereignfs/ui`, `config`, `database`, `crypto`, `mailer`, `api-client`, …).
Open source, privacy-first.

## Source of truth

Read the relevant sections before any task — they are authoritative over
assumptions:

- `docs/specs/core-app.md` — what `apps/core` must do, phase by phase. Wins over
  code, epics and issues until it is changed.
- `spec/core-api/` — the HTTP contract apps call; `spec/env.md` — the
  environment variable convention.
- `ROADMAP.md` — chronological task index (milestone → epic task ID → status).
  Full task detail lives in `docs/epics/`. Each task = one branch = one PR.
- `docs/development-workflow.md` — how to start, implement, and complete a task
  (`CURRENT_TASK.md`, epic task IDs).
- `docs/multi-agent.md` — how Claude Code and Codex divide work, commit
  attribution.
- `docs/architecture-rules.md` — full detail behind every hard rule listed
  below.
- `docs/design-system.md` — the `@sovereignfs/ui` model.
- `docs/releasing.md` — what is published to npm and how it is released.
- `.agents/skills/sv-*` — task lifecycle skills (`sv-task-start`,
  `sv-task-complete`, `sv-verify`, `sv-security-check`, `sv-update-task-docs`,
  `sv-create-pr`, `sv-ui-design`). Byte-identical copies live in
  `.claude/skills/` for Claude Code; a test enforces it — edit one, copy to the
  other.

**Research precedes RFCs.** An open-ended architectural or strategic question
with no concrete design gets a research doc in `docs/research/` (findings,
options, recommendation) before an RFC in `docs/rfcs/`. A settled decision is
recorded as an ADR in `docs/adrs/`. A documented "not now" is a valid outcome.

## Working conventions

- **One task at a time.** Implement a single task, verify its review checklist,
  then stop for human review. Do not start a task on an unmerged PR.
  _Workstream legs_ (`docs/workstreams/`) are the exception: one leg = one
  branch = one PR = one review gate; run every task in the leg uninterrupted,
  verify, open a draft PR, stop. One version bump per leg.
- **Tasks are sequenced** — each depends on the ones its Dependencies line names;
  tasks tagged `[parallel]` can run alongside others whose dependencies are met.
- **Branch per task, cut from an up-to-date `main`** (`git switch main && git pull`).
  Name by change type: `feat/<slug>`, `fix/<slug>`, `docs/<slug>`, `chore/<slug>`.
  _(Post-v1.0.0, `main` becomes production and `dev` the integration branch.)_
- **Epic task IDs (`4.3`) are permanent** — use them in doc cross-references and
  dependency lists, never in branch names, commit messages, or PR titles/bodies.
  **Roadmap versions are volatile** — look them up in `ROADMAP.md`, never
  hard-code them in docs.
- **Commits** explain _why_, not just _what_: subject under 72 characters in the
  form `type(scope): summary` (`feat`, `fix`, `docs`, `chore`; scope optional,
  e.g. `feat(ui):`), body wrapped at 100 characters, a `Verified:` line naming
  what was run. They end with your agent's trailer — for Claude Code
  `Co-Authored-By: Claude Code <noreply@anthropic.com>` (model-agnostic — never a
  specific model name), for Codex `Co-Authored-By: Codex <noreply@openai.com>`.
  One logical change per commit.
- **PRs** target `main`, are created with `gh pr create --draft`, and are marked
  ready only on explicit instruction. Bodies describe what changed and why, cite
  spec sections (`core-app §3.6.4`), carry no task numbers, and end with your
  agent's footer (`🤖 Generated with [Claude Code](https://claude.com/claude-code)`
  or `🤖 Generated with [Codex](https://developers.openai.com/codex)`).
- **Merge strategy: rebase and merge** — never squash, never a merge commit.
  **Fix commit messages before merging**; never rewrite `main`.
  **Never merge automatically** — wait for instruction or ask.
- **Never commit or push without being asked.** Prepare changes in the working
  tree and stop.
- **On task completion, update `ROADMAP.md` and the task heading in
  `docs/epics/<file>.md` in the same PR** (both ✅). If the task advances an
  RFC, update that RFC's `Status:` line and its row in `docs/rfcs/README.md`
  too. Use `Implemented` once every incorporated task is ✅,
  `Partially implemented (reason)` otherwise, `Retired`/`Superseded` with a
  pointer if removed or replaced.
- **Per-task narrative goes in the PR body and the task's `docs/epics/` note,
  not in this file.** This file gains a new bullet only when a task surfaces a
  genuinely new, reusable rule (the full story goes in
  `docs/architecture-rules.md`).
- **Verify before claiming done.** Run the review-checklist commands and show
  the output. A regression test is only trusted after it has been seen to fail
  against the pre-fix code.
- **Flag Docker-config impact immediately.** A new/renamed env var, port,
  on-disk path, native dep, or anything affecting `next build`/standalone
  output means updating the `Dockerfile`, `docker-compose*.yml` and
  `.dockerignore` in the same change.
- **Docs are part of the change.** A behaviour change updates
  `docs/specs/core-app.md`; an HTTP change updates `spec/core-api/`; an env var
  change updates `.env.example`, the spec's variable table and `spec/env.md`;
  every `process.env` read is declared in `.env.example`.
- **Version bumps are part of the PR**, semver by change type: `fix/` → patch,
  `feat/` → minor, breaking → major plus a `docs/upgrade.md` note, `chore/` /
  `docs/` → none unless a public API changed.
  - **Root `package.json`** is the platform version: each completed task bumps
    minor; patches are hotfixes between tasks; a single jump to `1.0.0` marks
    public release.
  - **Internal packages and `apps/core`** follow normal semver independently.
  - **`@sovereignfs/ui`, `@sovereignfs/bridge` and `@sovereignfs/api-client`**
    are published contracts: a patch never contains a breaking change; breaking
    needs at least a minor bump plus a migration note.
  - Tags/commit subjects: root `vX.Y.Z`; packages and apps `<slug>-vX.Y.Z`
    (`ui-`, `bridge-`, `core-`, …).

## Naming conventions

- **"App" is what people read; "client" is the protocol term.** User-facing
  text says "app". "Client" appears only in code, the Core API, and the
  Console's technical settings for registering one.
- **Roles** are `scope:role-name` (`platform:owner`); **capabilities** are
  `resource:action` (`user:manage`).
- **Environment variables** use the app's prefix: `SV_` for core.

## Code quality

Prettier (single quotes, semicolons, trailing commas `all`, width 100, 2-space)
is the single formatting authority; ESLint 10 flat config + `typescript-eslint`
(recommended + strict) + `eslint-config-prettier` for linting;
`simple-git-hooks` + `lint-staged` pre-commit; `.editorconfig` baseline.

- **Never disable ESLint rules inline** without an explanatory comment.
- **Prefix intentionally-unused identifiers with `_`** — the only sanctioned way
  to keep an unused binding.
- **Never add per-package Prettier overrides.** One config for the repository.
- **No Biome.**
- `pnpm format:check` and `pnpm lint` must pass before every PR (hook + CI).

## Hard architectural rules — critical violations

The rules most likely to be broken by accident. Full context and history for
each: `docs/architecture-rules.md`.

### Boundaries and contracts

- **Core is generic.** Nothing in core may depend on a particular app existing.
- **Shared packages work with no core present.** `packages/*` never import
  `apps/core`.
- **`packages/ui` components are framework-agnostic** — never import
  `next/navigation`/`next/link`; active state and links come from the consumer.
- **Extend `packages/tsconfig`** in every package and app.

### Auth, security, proxy

- **No secrets with defaults:** required secrets throw on start-up if unset.
- **Server actions and routes authorize inside:** require a session plus the
  specific capability for every mutation — a `'use server'` function is a
  public POST endpoint whatever the page's guard says.
- **Never `'unsafe-inline'` in `script-src`** (nonce-based CSP); apply the CSP on
  every proxy return path.
- **`proxy.ts` keeps the Edge discipline** — no Node built-ins, no DB access.
- **The proxy's sign-in redirect is `303`, never `307`.**
- **No fresh-session requirement** (`session.freshAge: 0`) — sensitive actions
  ask for the password instead.
- **A better-auth bump is verified against a populated store, never only a
  fresh one** (captures in `apps/core/src/__tests__/fixtures/auth-store`).
- **The password policy is enforced where the hash is made** (`policedHash`),
  and better-auth's origin and CSRF checks are never switched off.
- **Registration is enforced in better-auth's `user.create.before` hook,** which
  every account passes through: invite-only fails closed, the first account is
  the one made when no account exists, the owner is held by a unique index, and
  a role is never taken from a request.
- **PostgreSQL migrations name no schema** — `db:generate` strips drizzle-kit's
  `"public".` and a test guards it.
- **Timing-safe comparison** for every key or token compare.
- **Never interpolate a request-derived value into a shell command**; spawned
  `git` gets credentials through its environment, never argv.
- **Service-to-service trust uses one signed-token pattern** — never invent a new
  mechanism per service pair.
- **An anchored quantifier before `$`/`^` is quadratic** — use an index scan.

### Data layer

- **The data layer is always async**, even on SQLite.
- **Session-scoped Postgres primitives run on one pinned client**, never on the
  pool. **node-postgres returns `bigint` and `COUNT(*)` as strings** — coerce.
  **Timestamps in milliseconds are `bigint`** on Postgres. **Identifiers stay
  under 63 bytes.**
- **Every schema change is made for every dialect**; the parity test catches a
  column added to one only.
- **Encryption changes fail per app, never silently convert data;** conversion is
  an explicit command shipped in the published image.

### Runtime, boot, Docker

- **Never `NEXT_PUBLIC_*` for runtime-varying values** — inlined at build time.
- **Never drop the `pnpm-workspace.yaml` COPY from Dockerfiles.**
- **The image ships its migrations and every CLI it needs at runtime.**
- **Every outbound `fetch` in a server render path has a timeout.**

### UI and client behaviour

- **`'use client'` components never read browser globals in a `useState`
  initializer or render.**
- **Never fork a navigation decision by viewport** — fork rendered content only.
- **`router.push()` to the current URL doesn't refetch — use `router.refresh()`.**
- **Page padding comes from `PageContainer`**, never local padding.
- **Overlays portal into the shell root**, never `document.body`.
- **The service worker never stores a per-user page.**

## Design system (`packages/ui`)

`packages/ui` is the **Sovereign Design System** — a public contract. Full
model: `docs/design-system.md`.

- **Core's UI follows the established Sovereign UI as it is.** Sign-in and
  related pages, consent, the signed-in shell, the launcher, the Console and the
  identity pages keep the layouts and behaviour of their Sovereign predecessors
  (see `docs/specs/core-app.md` §1.3).
- **Tokens** are CSS custom properties prefixed `--sv-*`, two tiers (primitives →
  semantic). Pages reference **semantic colour tokens only**; scale tokens
  (`--sv-space-*`, `--sv-radius-*`, `--sv-font-size-*`) are used directly.
- **Components** are React + CSS Modules, RSC-safe. **No Tailwind, no runtime
  CSS-in-JS, no third-party component framework.** Components never hard-code
  values.
- **DS-first:** reusable UI capability is built in `packages/ui` and consumed by
  core — never implemented locally "to be promoted later".
- **Storybook hygiene (per PR):** a new component gets a story (default + one
  variant) and a Component Gallery entry; a new or renamed token updates the
  token gallery; then `pnpm --filter @sovereignfs/ui typecheck`.

## Tech stack

Next.js — latest stable, 16.4.3 at the time of writing (App Router) ·
TypeScript 6 · Turborepo + pnpm workspaces ·
better-auth 1.7 + `@better-auth/oauth-provider` · Drizzle ORM (sqld, PostgreSQL,
SQLite file) · nodemailer SMTP (`packages/mailer`) · CSS Modules + CSS custom
properties (`packages/ui`) · `tsup` (ESM only) · Vitest + Testing Library ·
Playwright · OpenAPI 3.1 (`spec/core-api/`) · Docker Compose.

## Repository layout

```
apps/core/          the core app — identity, sign-in server, Console, launcher
packages/
  ui/               design system — published
  bridge/           device bridge — release-ready, not published yet
  config/           env convention and start-up validation
  database/         sqld / PostgreSQL / SQLite file
  crypto/           field encryption (later: end-to-end, recovery kit)
  mailer/           mail delivery
  api-client/       typed Core API client — published
  tsconfig/         shared TS configs — extend these
spec/               core-api/ (OpenAPI), env.md
docs/
  specs/            core-app.md — source of truth for apps/core
  epics/            task detail;  rfcs/  research/  adrs/
scripts/            repository tooling
```

Packages are under the `@sovereignfs/*` scope. `"private": true` is the
do-not-publish signal.

## Commands

```bash
pnpm install --frozen-lockfile   # routine install (also installs the git hooks)
pnpm format / format:check       # Prettier
pnpm lint / lint:fix             # ESLint
pnpm typecheck                   # turbo typecheck in every package, then tsc for the repo's scripts
pnpm test / test:watch           # turbo test in every package, then the repo-level unit tests
pnpm test:db                     # the *.db.test.ts tests, against the dialect named by SV_DB_DIALECT
pnpm dev                         # core on :3000 (needs SV_URL and SV_AUTH_SECRET, see apps/core/.env.example)
pnpm build                       # turbo build
pnpm storybook / build-storybook # the design system's Storybook (dev server on :6006 / static build)
pnpm design:tokens:check         # every --sv-* token used is defined; no hard-coded colours
pnpm packages:check              # pack the published packages, check the tarballs, dry-run the publish (after a build)
pnpm generate:icons              # regenerate the Icon components from scripts/icon-list.ts
pnpm generate:theme-presets      # regenerate tokens/theme-presets.css from theme-presets.ts
pnpm docs:check-links            # every relative Markdown link resolves
pnpm verify:push                 # format:check, lint, typecheck, design:tokens:check, docs:check-links, test (the pre-push hook)
```

The database scripts and the Docker commands arrive with the tasks that create
them (0.5, 1.2).

## Environment notes

- Node 24.15+ (`.node-version` pins the patch), pnpm 11 (`packageManager`).
- **Next.js tracks the latest stable release** — the npm `latest` tag, pinned in
  the catalog. Never a canary, preview, beta or release candidate. Patch and
  minor releases are taken routinely in a `chore/` PR; a new major gets its own
  roadmap task, since it can change APIs and conventions.
- **Read the Next.js docs bundled with the installed version**
  (`node_modules/next/dist/docs/`) before writing Next.js code; it changes faster
  than any model's training data. Heed deprecation notices.
- **Shared dev tooling is pinned via the pnpm `catalog:`** — never a literal
  version; add new shared deps to the catalog first.
- **Use `pnpm install --frozen-lockfile` for routine installs**; unexpected
  lockfile churn means something is unpinned.
- **An `overrides` entry for an advisory is capped to the consumer's declared
  range**, never open-ended.
- **TypeScript 6:** the shared base sets `types: ["node"]`; never add `baseUrl`.
  TypeScript stays on 6.0.x until `typescript-eslint` supports 7; ESLint is on 10
  even though `eslint-plugin-jsx-a11y` still declares 9 (a scoped peer allowance
  in `pnpm-workspace.yaml`, with a test that fails if its rules stop firing).
- **pnpm refuses releases less than a day old** (`minimumReleaseAge`, strict). A
  catalog range whose floor is a brand-new release fails to install — name a
  release at least a day old. Never accept pnpm's offer to add an exclusion.
- **Tests** await every async operation they start, and scope long timeouts to
  the one slow test.

## Status

Current platform version: **`0.13.0`**. `ROADMAP.md` is the canonical task queue
and completion record.

**The next task is assigned by the developer at session start.** Read
`ROADMAP.md` to find pending tasks, then ask which one to pick up — do not
assume.

Keep this file current with load-bearing conventions only. Do not add task
completion entries or release narrative here — that belongs in `ROADMAP.md`, the
PR body, and `docs/epics/`.
