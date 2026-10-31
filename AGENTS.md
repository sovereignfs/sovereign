# AGENTS.md

Guidance for every AI agent working in this repository (Codex reads this file
directly; Claude Code loads it through `CLAUDE.md`). It is the one copy of the
conventions — do not duplicate them elsewhere.

## What this is

**Sovereign** — a self-hostable identity and foundation service, and the tools to run it. Anyone
can deploy **core**, its sign-in server, and point any OpenID Connect application at it for
sign-in; in later phases core also offers shared services (mail, notifications, activity, backups)
to apps. Core is **generic**: it knows OAuth clients, never particular apps. This repository also
holds the operator toolkit that deploys it (`tools/cli`, `tools/create`) and the shared packages every
Sovereign app uses (`@sovereignfs/ui`, `sdk`, `config`, `database`, `crypto`, `mailer`, `api-client`, …).
Open source, privacy-first.

**Naming:** _Sovereign_ is the project and this repository; _core_ (_Sovereign core_) is the
sign-in server in `apps/core`, the thing `ghcr.io/sovereignfs/sovereign` runs.

## Source of truth

Read the relevant sections before any task — they are authoritative over
assumptions:

- `docs/specs/core-app.md` — what `apps/core` must do, phase by phase. Wins over
  code, epics and issues until it is changed.
- `docs/specs/operator-cli.md` — what `tools/cli` must do. Holds the same place
  for it as `core-app.md` does for `apps/core`.
- `spec/core-api/` — the HTTP contract apps call; `spec/env.md` — the
  environment variable convention; `spec/suite.md` and `spec/app-manifest.md` —
  the instance repository and what an app provides (`spec/schemas/`).
- `ROADMAP.md` — chronological task index (milestone → epic task ID → status).
  Full task detail lives in `docs/epics/`. Each task = one branch = one PR.
- `docs/development-workflow.md` — how to start, implement, and complete a task
  (`CURRENT_TASK.md`, epic task IDs).
- `docs/multi-agent.md` — how Claude Code and Codex divide work, commit
  attribution.
- `docs/architecture-rules.md` — full detail behind every hard rule listed
  below.
- `docs/specs/sdk.md` — what `@sovereignfs/sdk` does.
- `docs/specs/design-system.md` — what `@sovereignfs/ui` promises, and
  `docs/design-system.md` — the guide to using it.
- `docs/releasing.md` — what is published (npm, the image) and how it is released.
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
    needs at least a minor bump plus a migration note (`docs/upgrade.md`), and
    for `ui` a major bump from `1.0.0` (`docs/specs/design-system.md` §4).
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
- **Email is sent in the background, and its availability is checked first,**
  so verification, resend and reset answer alike for known and unknown
  addresses; better-auth's signed cookie cache is off, so an
  ended session stops working at once everywhere.
- **Sign-up's terms and time zone are checked in the user-create hook and
  recorded by the server;** every page is rendered per request, for the nonce.
- **Every way of opening a session must pass the second step** when TOTP is on,
  and core offers no "trust this device".
- **Passkeys must be user-verified** (checked in core's hooks, not left to
  better-auth). Every session passes `assertMayOpenSession` (the hook on creating
  one), and deactivating an account is `AccountStates`, one transaction.
  **better-auth's packages are pinned to one version.**
- **Every check asks `can` and every server action or route calls
  `requireCapability` itself** (a test fails when one does not); the owner's
  guarantees are held in `changeRole` and `AccountStates`.
  **The matrix in force is read from the database and a stored row is never
  trusted:** owner-only capabilities and the owner's row cannot be edited, and a
  check that cannot read the matrix fails.
  **Handing over ownership is one transaction of two conditional updates, and a
  password asked for again goes through `confirmPassword`, which counts wrong
  answers.**
- **The OIDC provider is better-auth's plugins, configured:** the bare instance URL
  is the issuer, only the code flow with PKCE `S256` exists, no client registers
  itself, redirect addresses match exactly, and its tables are checked against the
  installed plugins.
- **An operator's action on an account holds the role rules in `AccountManager`**
  (capability, whom, not oneself), and deleting is one transaction; the Console's
  buttons are only a convenience.
- **An invitation link is public and decides nothing**: sign-up checks the address
  (`hasValidInvite`); `InviteManager` makes and cancels invitations, and every
  link that does not work shows the same page.
- **Instance settings are changed only by `InstanceManager`** (capability read
  fresh; SMTP needs the owner-only `instance:configure-secrets` and is never loaded
  for anyone else); **an uploaded SVG is rebuilt by `sanitiseSvg`, never passed
  through**.
- **The matrix editor saves the whole table it showed, and a form whose checkboxes
  a refusal must leave is sent from `onSubmit`, not as a form action** (an action
  resets the form); **ownership is handed over only by `transferOwnershipAction`**,
  which asks for the password and leaves the page.
- **Apps are written only through `ClientRegistry`, as the person with the
  request's headers; an app's secret is returned once, to the page that asked**,
  and the Console says "app" except in the technical settings.
- **`sovereign-admin` acts as the system actor, which only its entry point
  (`src/admin/main.ts`) builds**; no route or page imports it, and the registry
  accepts only an actor made there.
- **The SDK sends a refresh token once, and says so when it cannot know.** Core rotates
  a refresh token on every use and takes one used twice for theft, so
  `packages/sdk/src/tokens.ts` refreshes one at a time per person, stores the new token
  before using the access token, never retries a refresh that was sent, and refuses to
  send again one whose answer was lost. Its calls name an actor, retry only what the
  contract marks safe to repeat, and log no token or person.
- **An app's own token is the app's and no person's.** The grant needs an app scope an operator gave a confidential app;
  `authenticateApp` and `authenticate` each refuse the other's token; rotating the secret or switching the app off ends the
  tokens (`app_token_revocations`).
- **The SDK's sign-in is PKCE with a one-use pending record, a host-only session cookie
  and a logout token refused unless it is wrong in no way** (`packages/sdk/src/auth.ts`):
  `getSession` makes no call to core, a return address is a path on the app, and a
  replayed `jti` is refused.
- **The launcher (`/`) reads apps through `listLauncherApps`** (tile fields only)
  after checking `launcher:access`; **only `/` may load pictures from other
  addresses** (`remoteImages` in `buildCsp`).
- **Connected apps are read and removed for the session's own account** (never
  one named in a request); Remove access is `removeAccess`, and nothing else
  removes a consent.
- **A person deletes their own account only through `AccountManager.deleteSelf`**
  (after the password; never an owner's, judged by the stored role); it shares
  the one transaction an operator's deletion uses.
- **The Core API is defined only in `spec/core-api/openapi.yaml`**; the client in
  `packages/api-client` is generated from it (`pnpm generate:api-client`, never
  edited by hand) and every handler's answer is checked against it
  (`expectMatchesContract`).
- **The branding document (`/.well-known/sovereign-instance`) is public, typed from
  the contract, and always current** (never cached past revalidation).
- **Core API routes (`/api/v1`) call their guard first** (`directoryGuard` →
  `authenticate`: key, type, audience, scope, then account, app, session and
  revocation); a signed token is revoked by time (`token_revocations`, written
  by `revoke`); the Directory returns only `sub`, `name`, `picture`, matches
  names only and an email only whole.
- **The browser client never follows a redirect answer by itself**
  (`disableDefaultFetchPlugins`): the forms navigate, through `continuationUrl`,
  or an app's callback is requested twice with one authorization code. **Every
  response carries the hardening headers** (`securityHeaders`, from the proxy's
  one exit), HSTS over https only.
- **The typeface is Hanken Grotesk, shipped by `@sovereignfs/ui`** (`tokens/fonts.css`,
  loaded by `tokens.css`; never fetched from another site), and CSS names a family only
  through `var(--sv-font-family…)` or `inherit` (`pnpm design:tokens:check` fails otherwise).
- **The service worker (`src/sw/source.ts`, at `/sw.js`) keeps only an allow-list of
  files the same for everyone** (built files and icons), has no handler for anything
  else, and builds its own offline page; nothing of a person is ever stored.
- **Every signed-in page has the one `AccountHeader`** (from its layout: the launcher,
  the identity pages, the Console; the mark and name left, the avatar menu right), a missing or failed page has `not-found.tsx` /
  `error.tsx`, and going to another page is a `ButtonLink`: no page is a dead end
  and none carries an unstyled link.
- **Phase 1 acceptance is `apps/e2e`**: one named test for each item of §3.17
  (`§3.17.N:` in the title; a test fails when an item has none), run in CI on
  each database against a built core. Its apps ask from addresses of their own,
  and a step that removes access waits out the revocation second.
- **The image bakes in no environment**: `.dockerignore` leaves out every `.env`
  file, the Dockerfile copies the manifest of every workspace package (a test
  fails when a package is added and not copied), and `pnpm docker:smoke` (CI's
  `image` job) boots sqld, PostgreSQL and SQLite from it. The seed refuses any
  address that is not on this machine.
- **Every Console page calls `requireConsole` itself** (a test fails when one does
  not), and answers someone who may not enter with a page that is not there.
- **A client is written only by `ClientRegistry`** (validation, the provider's
  secret hashing, its adapter for core's fields; the provider's own write routes
  are off), and every method needs `client:manage`.
- **One routine revokes tokens, on the caller's own transaction; a session is
  ended through better-auth's endpoints, never by deleting its row** (the row's
  tokens would stay alive and no app would be told). Remove access is
  `removeAccess`, the provider's consent-deleting endpoints are off.
- **`roles` is for trusted clients only** (stripped from the request, not offered
  at consent, withheld from tokens), and the consent page believes only what the
  provider signed.
- **A route handler that changes something calls `requireSameOrigin`** (a test
  fails when it does not); **an image is judged by its bytes**; **`users.image`
  is set only by uploading a picture.**
- **A session is ended by its id and only for its owner, and a list of sessions
  never carries a token.**
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

`packages/ui` is the **Sovereign Design System** — a public contract. What it
promises: `docs/specs/design-system.md`. How to use it: `docs/design-system.md`.

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
apps/e2e/           Phase 1 acceptance — Playwright, run against a built core
tools/              things that are run, never imported (AGPL; published, but not libraries)
  cli/              the operator toolkit, sv — files on the operator's machine, sv apply and sv receive on the server
  create/           npm create @sovereignfs — makes an instance repository, or an app
packages/
  ui/               design system — published
  bridge/           device bridge — release-ready, not published yet
  config/           env convention and start-up validation
  database/         sqld / PostgreSQL / SQLite file
  crypto/           field encryption (later: end-to-end, recovery kit)
  mailer/           mail delivery
  api-client/       typed Core API client
  sdk/              how an app's server calls core — tokens, failure, version support
  tsconfig/         shared TS configs — extend these
spec/               core-api/ (OpenAPI), env.md, suite.md, app-manifest.md, schemas/
docs/
  specs/            core-app.md, operator-cli.md, design-system.md, sdk.md — source of truth for each
  epics/            task detail;  rfcs/  research/  adrs/
scripts/            repository tooling
Dockerfile, docker-compose*.yml   the image and its three compose setups (docs/deploying.md)
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
pnpm dev                         # core on :3000 (needs SV_URL and SV_AUTH_SECRET, see apps/core/.env.example); starts sqld first when .env chooses it
pnpm seed                        # local accounts: owner, admin, user @example.test (development only; refuses a non-local SV_URL)
pnpm e2e                         # Phase 1 acceptance: the Playwright suite against a built core (build core first; SV_DB_DIALECT picks the database)
pnpm docker:smoke                # build the image and boot sqld, PostgreSQL and SQLite compose setups from it (needs Docker)
pnpm generate:api-client         # regenerate packages/api-client from spec/core-api/openapi.yaml
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

The current platform version is the root `package.json`'s, and `ROADMAP.md` (its header
and its rows) is the canonical task queue and completion record.

**The next task is assigned by the developer at session start.** Read
`ROADMAP.md` to find pending tasks, then ask which one to pick up — do not
assume.

Keep this file current with load-bearing conventions only. Do not add task
completion entries or release narrative here — that belongs in `ROADMAP.md`, the
PR body, and `docs/epics/`.
