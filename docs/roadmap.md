# Sovereign — Roadmap

**Version:** 1.0\
**Date:** June 2026\
**Purpose:** The single source of truth for Sovereign's build plan — implementation tasks grouped by release milestone (**Pre-v1**, **v1**). Each task is a single PR. Completed (merged) tasks are marked **✅**. Reference `sovereign-proposal-plan-srs.md` for architectural decisions and rationale.

> **Note.** This roadmap is the build plan; it replaces the former
> `sovereign-implementation-tasks.md` (now retired). Completed tasks are marked
> **✅**; unfinished tasks are listed in priority order under each milestone.
> Incorporating the open RFCs (0012–0024) as scheduled tasks is an ongoing pass.

---

## How to use this document

Each task maps to one Claude Code session and one PR. Before starting a session:

1. Provide Claude Code with the relevant SRS sections as context
2. Provide this document and point to the specific task
3. Review the PR before moving to the next task — no task should start on an unmerged PR

Tasks are sequenced — each depends on the previous unless marked **[parallel]**.

**TypeScript config dependency:** All packages and apps created from Task 0.3.04 onwards must extend from `packages/tsconfig`. Remind Claude Code of this at the start of each package creation session — it is a foundational dependency established in 0.3.02 and easy to miss.

**Code quality dependency:** ESLint and Prettier are established in Task 0.3.03. All packages created from 0.3.04 onwards must comply with the root ESLint and Prettier config. Do not introduce per-package formatting overrides.

**Docker Compose scope:** Task 0.3.12 creates a basic dev-only Compose setup. Task 0.5.02 makes it production-complete. These are intentionally split — do not flag 0.5.02 as duplication.

---

## Pre-v1

Everything that ships to reach the **v1.0** release — foundations (v0.3), the
platform chrome plugins (v0.4), and polish/self-hosting (v0.5). Tasks already
implemented keep their original order, numbering, and phase grouping.

### Phase v0.3 — Foundation

#### ✅ Task 0.3.01 — Monorepo scaffold

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

#### ✅ Task 0.3.02 — Shared TypeScript config

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

#### ✅ Task 0.3.03 — Code quality tooling

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

#### ✅ Task 0.3.04 — `packages/db` — Drizzle client factory

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

#### ✅ Task 0.3.05 — `packages/manifest` — schema and validation

**Goal:** Manifest schema package providing TypeScript types and a validation function.

**Deliverables:**

- `packages/manifest/` with:
  - `src/types.ts` — full `SovereignManifest` interface and `Permission` type as defined in SRS section 5
  - `src/validate.ts` — `validateManifest(json): ValidationResult` — checks required fields, valid enum values, `repository` required when type is `sovereign` or `community`
  - `src/index.ts` — barrel export
- Unit tests covering: valid manifest passes, missing required field fails, invalid enum value fails, missing repository on sovereign type fails
- `tsup.config.ts` — `entry: ['src/index.ts']`, `format: ['esm']`, `dts: true`, `clean: true`
- `package.json`:
  - `build` script: `tsup`
  - No `dev` script — compiled by consuming apps via `transpilePackages`
  - `exports`: `{ ".": "./src/index.ts" }` for workspace; overwritten at publish

**SRS reference:** 3.8 Manifest System, Section 5 Plugin Manifest Reference

**Review checklist:**

- All fields from SRS Section 5 present in the TypeScript interface
- `shell`, `database`, `runtime`, `type` fields all typed correctly with correct enum values
- Validation tests pass

---

#### ✅ Task 0.3.06 — `packages/mailer` — SMTP abstraction

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

#### ✅ Task 0.3.07 — `packages/ui` — Sovereign Design System scaffold

**Goal:** Sovereign Design System scaffold — two-tier CSS custom property token
architecture and one primitive component to validate the setup. This package is
a public contract for plugin developers; token names and component APIs must be
treated with the same versioning discipline as the SDK.

**Deliverables:**

- `packages/ui/` with:
  - `src/tokens/primitives.css` — raw scale tokens with `--sv-` prefix:
    colour palette (`--sv-grey-50` … `--sv-grey-950`), spacing scale
    (`--sv-space-1` … `--sv-space-16`), font sizes (`--sv-font-size-sm` …
    `--sv-font-size-2xl`), border radii (`--sv-radius-sm/md/lg`)
  - `src/tokens/semantic.css` — contextual tokens mapped from primitives:
    `--sv-color-surface`, `--sv-color-text-primary`, `--sv-color-text-muted`,
    `--sv-color-border`, `--sv-color-accent`, `--sv-shadow-card` etc. These are
    what plugin developers reference. Tenant theming overrides this layer only.
  - `src/components/Button/Button.tsx` — single primitive component using CSS
    Modules to validate the setup
  - `src/components/Button/Button.module.css` — styles referencing `--sv-*`
    tokens only; no hardcoded values
  - `src/index.ts` — barrel export
- Extends `packages/tsconfig` (`library.json`)
- Builds cleanly and is importable by the runtime
- `docs/design-system.md` — foundational design system doc covering:
  - Design principles (what Sovereign UI should feel and look like)
  - Token architecture (two-tier model, `--sv-*` convention, primitive vs
    semantic, theming surface)
  - Full primitive and semantic token reference (all tokens defined in this task)
  - Component contribution guide (how to build a new component correctly —
    CSS Modules, token-only values, accessibility expectations)
  - Theming guide (how tenant overrides work by swapping semantic tokens at
    `:root`; what primitives are and why plugins must not reference them)

  Note: the plugin developer consumption guide (how to use components and tokens
  in a plugin) lives in `docs/plugin-development.md` (Task 0.5.06), not here.
  This doc is for contributors and system-level understanding.

**Technology:** CSS custom properties for tokens (plain `.css` files) + React +
CSS Modules for components. No Tailwind. No runtime CSS-in-JS. No third-party
component framework. See CLAUDE.md — Design System section for full rationale
and token conventions.

**Build:** `tsup` — ESM output, TypeScript declarations. CSS (both CSS Modules
and token files) is marked **external** (`external: [/\.css$/]`); tsup/esbuild
can't scope-hash CSS Modules, so the consuming Next.js app processes the CSS —
via `transpilePackages` (the `src` tree) in v1, or its own bundler when the
package is installed from npm. React is external too (`react`, `react-dom`,
`react/jsx-runtime`), and `esbuildOptions.jsx = 'automatic'`. The `.css` files
ship via the package `files` field; full npm-publish CSS packaging (ensuring the
externalised `.css` imports resolve inside `dist/`) is finalised in Task 0.5.07.

- `tsup.config.ts` — entry: `['src/index.ts']`, format: `['esm']`, dts: true,
  clean: true, external: `[/\.css$/, 'react', 'react-dom', 'react/jsx-runtime']`,
  `esbuildOptions.jsx = 'automatic'`
- `package.json`:
  - `build` script: `tsup`
  - No `dev` script — consuming Next.js apps (runtime) include this package in
    `transpilePackages`; Next.js compiles the TypeScript source directly and
    handles CSS Modules natively. Changes to components are picked up by HMR
    instantly without any watch build.
  - `exports`: `{ ".": "./src/index.ts" }` for workspace; tsup overwrites with
    `dist/` paths at build time. Published to npm as `@sovereignfs/ui`.
  - `files` field must include `dist/` and any CSS files for the npm package

**SRS reference:** 2.2 Tech Stack (`packages/ui`)

**Review checklist:**

- `Button` renders without errors when imported into a test file
- No hardcoded colour, spacing, or radius values in any component CSS — only
  `--sv-*` token references
- All semantic tokens map to primitive tokens — no semantic token has a
  hardcoded value
- `tokens/primitives.css` and `tokens/semantic.css` are valid, importable CSS
  files
- `docs/design-system.md` exists and covers all sections listed above

---

#### ✅ Task 0.3.08 — `packages/sdk` — interface definitions

**Goal:** SDK package with full interface definitions for v1 surface. Implementations are stubs at this stage — real implementations come in later tasks.

**Deliverables:**

- `packages/sdk/` with:
  - `src/types.ts` — `Session`, `PlatformConfig`, `MailOptions`, `DrizzleClient` types
  - `src/auth.ts` — `getSession()`, `requireSession()` — stubs throwing `NotImplementedError`
  - `src/db.ts` — `getClient()` — stub
  - `src/mailer.ts` — `send()` — stub
  - `src/platform.ts` — `getConfig()` — stub
  - `src/unimplemented.ts` — `storage`, `notifications`, `events` stubs throwing `NotImplementedError` with message indicating v1 non-implementation
  - `src/index.ts` — barrel export as `sdk.*`

Note: the `no-restricted-imports` ESLint boundary rule blocking `runtime/src`
imports in `plugins/*` is configured in Task 0.3.03 (code quality tooling),
not here. By the time this task runs it is already active. This task only
verifies it catches a violation.

**Build:** `tsup` — ESM only, TypeScript declarations. Published to npm as
`@sovereignfs/sdk`; `package.json` must include `exports`, `main`, `types`,
and `files` fields pointing to `dist/`.

- `tsup.config.ts` — entry: `['src/index.ts']`, format: `['esm']`, dts: true,
  clean: true
- `package.json`:
  - `build` script: `tsup`
  - No `dev` script — compiled by consuming apps via `transpilePackages`
  - `exports`: `{ ".": "./src/index.ts" }` for workspace; overwritten at publish
  - `files` must include `dist/` for the npm package

**SRS reference:** 3.6 SDK, NFR-06

**Review checklist:**

- All SDK methods from SRS 3.6 present
- Unimplemented stubs throw `NotImplementedError` with a clear message
- ESLint import boundary rule catches a `runtime/src` import in a test plugin
  file (rule was established in Task 0.3.03)

---

#### ✅ Task 0.3.09 — `apps/auth` — better-auth server **[parallel with 0.3.10]**

**Goal:** Self-contained auth server wrapping better-auth. Handles login, logout, registration, session verification, and its own login/registration UI. Owns its identity database; does **not** use `packages/db` (SRS §3.3).

**Deliverables:**

- `apps/auth/` — Next.js app with:
  - better-auth (email/password) backed by its **own** database — better-auth's
    standard `user`/`session`/`account`/`verification` schema (SQLite default
    via `better-sqlite3`, Postgres via env). The schema is managed by
    better-auth, not `packages/db`.
  - `role` as a non-editable better-auth `additionalField`; a
    `databaseHooks.user.create` hook assigns `platform:admin` to the first user
    and `platform:user` thereafter.
  - Its own **login and registration UI**, built with `@sovereignfs/ui`.
  - `/api/auth/[...all]` — better-auth catch-all handler.
  - `/api/verify` — endpoint that validates the session and returns the user
    (id, email, role) or 401.
  - Invite-only: an `invites` table in the auth DB; when `AUTH_INVITE_ONLY=true`,
    registration requires a valid, unconsumed invite token (first-user bootstrap
    exempt). Invite **creation** is a Console feature (Task 0.4.02).
  - Session stored as an httpOnly cookie. Cookie sharing with the runtime works
    via host-scoping (SRS §3.10) — no special config.
  - `AUTH_SECRET` has no default — the server throws on startup if it is unset.
  - Environment: `AUTH_SECRET`, `AUTH_DATABASE_URL` (defaults to a local SQLite
    file), `AUTH_INVITE_ONLY`.
- `apps/auth/next.config.ts` — `transpilePackages: ['@sovereignfs/ui']` (the
  only workspace package the auth server consumes).

Deferred: password reset (AUTH-07) — revisited in a later auth task.

**SRS reference:** 3.3 Auth Layer, 3.10 Shared Login State, 4.3 Functional Requirements — Auth

**Review checklist:**

- Login sets an httpOnly cookie
- `/api/verify` returns 401 for an invalid/expired token, the user otherwise
- First registered user gets `platform:admin`; the second gets `platform:user`
- `AUTH_INVITE_ONLY=true` blocks registration without a valid invite token
- `AUTH_SECRET` has no default value — throws on startup if unset
- Login/registration screens render with `@sovereignfs/ui`

---

#### ✅ Task 0.3.10 — Runtime scaffold **[parallel with 0.3.09]**

**Goal:** Sovereign Core Next.js app scaffold with shell layout, middleware, and root placeholder page. No plugins wired yet.

**Deliverables:**

- `runtime/` — Next.js 15 app with App Router:
  - `app/(platform)/layout.tsx` — shell layout implementing the three-section sidebar (PLT-11):
    - **Top:** branding header — logo / tenant name; links to `/`.
    - **Middle:** plugin icon area. In the v0.3 scaffold this section is empty (no plugins installed yet). The first icon will always be the root plugin, pointing to `/` (PLT-12); it is inserted and populated in Tasks 0.4.05 (Launcher) and 0.4.04 (root plugin config). Each icon loads from the manifest `icon` field (path relative to plugin root); runtime generates a two-letter monogram fallback if `icon` is absent.
    - **Bottom:** hardcoded shell chrome, **not** driven by the plugin registry — Console icon (rendered only for `platform:admin`) + Account avatar slot (all authenticated users). This section does not participate in user customisation.
    - Mobile layout: header (logo + Account avatar) + content area + footer launcher (mirrors middle section; Console icon visible to admin only).
  - `app/(platform)/page.tsx` — placeholder redirect page (empty for now; in Task 0.4.04 this redirects to the configured root plugin's `routePrefix`)
  - `app/plugins/` — empty directory with `.gitignore` (generated, never committed)
  - `src/middleware.ts` — reads session cookie, calls `apps/auth /api/verify` to validate session (v0.3 approach — see SRS AUTH-05 for v0.5 local verification target), redirects to `/login` if unauthenticated
  - `src/registry.ts` — reads `generated/registry.ts`, exports installed plugin list
  - `generated/registry.ts` — placeholder empty registry
  - `app/login/route.ts` — redirects unauthenticated users to the auth server's
    login page (the login/registration UI lives in `apps/auth`, not the runtime;
    SRS §3.3). The auth server redirects back after login.
- `runtime/next.config.ts` — must include:
  - `transpilePackages: ['@sovereignfs/sdk', '@sovereignfs/ui',
'@sovereignfs/db', '@sovereignfs/manifest', '@sovereignfs/mailer']` —
    compiles all workspace package TypeScript sources directly during dev.
    Changes to any package file trigger HMR in the runtime without a separate
    watch build. (All packages share the single `@sovereignfs/*` scope; only
    `sdk` and `ui` are published, the rest are `private`.)
  - `webpack: (config) => { config.resolve.symlinks = false; return config; }`
    — required for plugin HMR. Without this, webpack resolves symlinks to
    their real path before watching, breaking hot reload for plugin source
    files that are symlinked into `runtime/app/plugins/` by the generate
    script. Setting `symlinks: false` makes webpack watch the symlink path
    so edits to `plugins/[id]/app/` propagate via HMR immediately.
- `runtime/package.json` — `dev` script runs the generate script before
  starting the dev server: `tsx ../scripts/generate-registry.ts && next dev`.
  The generate script is run synchronously on startup (creates/updates
  symlinks), then Next.js dev server starts.
- Environment: `SOVEREIGN_AUTH_URL`, `SOVEREIGN_AUTH_SECRET`

**SRS reference:** 3.4 Runtime Layer, 3.10 Shared Login State, PLT-01, PLT-02, PLT-08, PLT-11, PLT-12, PLT-13

**Review checklist:**

- Unauthenticated request to `/` redirects to `/login`
- Shell renders correctly on desktop and mobile viewports
- `app/plugins/` is gitignored
- No hardcoded auth secret
- Editing a file in `packages/ui/src/` while `pnpm dev` is running triggers
  HMR in the runtime without any manual rebuild step
- Editing a file in `plugins/console/app/` triggers HMR in the runtime

---

#### ✅ Task 0.3.11 — Generate script

**Goal:** Pre-build script that reads plugin manifests, validates them, and injects plugin routes into the runtime.

**Deliverables:**

- `scripts/generate-registry.ts`:
  - Scans `plugins/*/manifest.json`
  - Validates each manifest via `packages/manifest`
  - Fails with a clear error if any manifest is invalid
  - Writes `runtime/generated/registry.ts` — typed array of installed plugin manifests
  - In `development` mode: symlinks `plugins/[id]/app/` → `runtime/app/plugins/[id]/`
  - In `production` mode: copies `plugins/[id]/app/` → `runtime/app/plugins/[id]/`
  - Mode determined by `NODE_ENV`
  - `--watch` flag: when passed, watches the `plugins/` directory for new or
    removed plugin directories and re-runs the symlink/copy step automatically.
    Used by `runtime/package.json`'s `dev` script to keep the plugin route
    tree in sync while the Next.js dev server is running. A newly added plugin
    directory is symlinked immediately; developers may need to trigger a route
    refresh in Next.js (fast-refresh boundary), but no manual generate command
    is needed.
- `turbo.json` updated with two additions:
  - `generate` task: `dependsOn: ["packages/manifest#build"]`, outputs
    `["runtime/app/plugins/**", "runtime/generated/**"]`, `cache: false`
    (plugin file state is not cacheable)
  - `runtime#build` override: `dependsOn: ["generate", "^build"]` — ensures
    generate runs and all package deps are built before the runtime Next.js
    build starts. Without this, `next build` may run before plugins are
    composed in.
- `package.json` script: `"generate": "tsx scripts/generate-registry.ts"`

**SRS reference:** 3.9 Plugin Loading Model

**Review checklist:**

- Invalid manifest causes script to exit non-zero with a readable error
- `runtime/generated/registry.ts` is valid TypeScript after running
- Symlinks created in dev mode, copies in production mode
- Running generate with no plugins produces an empty registry without errors

---

#### ✅ Task 0.3.12 — Docker Compose for local dev

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

### Phase v0.4 — Platform Plugins (Console, Launcher, Account)

#### ✅ Task 0.4.01 — Console plugin scaffold

**Goal:** Console plugin directory structure, manifest, and basic routing wired into the runtime via the generate script.

**Deliverables:**

- `plugins/console/manifest.json` — type: `platform`, runtime: `native`, routePrefix: `/console`, adminOnly: true, shell: `default`, icon: `icon.svg`
- `plugins/console/icon.svg` — Console icon, rendered by the shell in the sidebar bottom section (admin only)
- `plugins/console/app/layout.tsx` — console shell layout
- `plugins/console/app/page.tsx` — console home (empty, links to sub-sections)
- `plugins/console/db/schema.ts` — no tables yet (console reads platform tables)
- `plugins/console/package.json`
- Running `pnpm generate` wires console into the runtime

**SRS reference:** 3.5 Plugin System, 4.4 Functional Requirements — Console, PLT-03

**Review checklist:**

- `/console` returns 403 for `platform:user`, accessible for `platform:admin`
- Generate script correctly picks up console manifest
- Console appears in launcher for admin users only

---

#### ✅ Task 0.4.02 — Console: user management

**Goal:** User list, invite, role change, and deactivate/reactivate.

**Deliverables:**

- `plugins/console/app/users/page.tsx` — paginated user list: name, email, role, status, join date
- `plugins/console/app/users/invite/page.tsx` — invite form: generates invite token, sends email via `sdk.mailer`
- Role change and deactivate/reactivate as server actions
- SDK `auth` and `mailer` real implementations wired in this task as a prerequisite for Console to function. `db` and `platform` implementations remain as stubs and are completed in Task 0.5.05.

**SRS reference:** CON-02, CON-03, CON-04, CON-05

**Review checklist:**

- User list shows all users with correct data
- Invite email sends (or logs no-op) when SMTP unconfigured
- Role change persists correctly
- Deactivated user cannot log in

---

#### ✅ Task 0.4.03 — Console: plugin management

**Goal:** Installed plugin list with enable/disable toggle.

**Deliverables:**

- `plugins/console/app/plugins/page.tsx` — list of installed plugins from registry: name, version, type, status
- Enable/disable toggle as server action — writes to a `plugin_status` table in platform db
- Runtime middleware respects disabled status — returns 404 for disabled plugin routes
- Disabled plugins hidden from launcher

**SRS reference:** CON-06, CON-07, PLT-04

**Review checklist:**

- Disabling a plugin blocks its routes immediately (no rebuild required)
- Disabled plugin disappears from launcher
- Re-enabling restores access

---

#### ✅ Task 0.4.04 — Console: tenant settings, system health, and root plugin config

**Goal:** Tenant name configuration, invite-only toggle, system health dashboard, and admin-configurable root plugin.

**Deliverables:**

- `platform_settings` table added to `packages/db` schema (`src/schema/platform.ts`):
  - Columns: `key` (string), `value` (string), `tenant_id` (string), `updated_at` (timestamp)
  - PK: `(key, tenant_id)`
  - Initial row seeded on first run: `key = 'root_plugin_id'`, `value = 'fs.sovereign.launcher'`
- `plugins/console/app/settings/page.tsx` — three settings in one page:
  - Tenant name field (CON-08) — writes to `tenants` table
  - Invite-only toggle (CON-10) — writes to `tenants` table, auth server reads it at registration
  - Root plugin selector (CON-11) — dropdown listing all installed, enabled, non-`adminOnly` plugins; writes `root_plugin_id` to `platform_settings`; change takes effect immediately without restart
- `plugins/console/app/health/page.tsx` — runtime version, database type + connection status, auth server status, disk usage (CON-09)
- `runtime/app/(platform)/page.tsx` updated — reads `root_plugin_id` from `platform_settings` and redirects to that plugin's `routePrefix` (default: `/launcher`)
- Tenant name stored in `tenants` table, exposed via `sdk.platform.getConfig()`

**SRS reference:** CON-08, CON-09, CON-10, CON-11, PLT-06, PLT-14, PLT-15

**Review checklist:**

- Tenant name change reflects in `sdk.platform.getConfig()` immediately
- Health page shows accurate database type (SQLite vs Postgres)
- Invite-only toggle takes effect on next registration attempt without restart
- Changing root plugin updates `platform_settings`; navigating to `/` immediately loads the newly configured root plugin without restart
- When the root plugin is not the Launcher, the Launcher appears in the sidebar middle section as a regular icon linking to `/launcher` (PLT-12)
- `platform_settings` table present in migration; `root_plugin_id` seeded on first run

---

#### ✅ Task 0.4.05 — Launcher plugin

**Goal:** Platform home screen that lists all installed plugins, serving as the default root page at `/`.

**Deliverables:**

- `plugins/launcher/` with:
  - `manifest.json` — id: `fs.sovereign.launcher`, type: `platform`, runtime: `native`, routePrefix: `/launcher`, shell: `default`, icon: `icon.svg`, permissions: `["auth:session", "db:readOnly"]`, minPlatformVersion: `0.4.0`
  - `icon.svg` — grid-of-dots or home symbol
  - `app/page.tsx` — plugin grid: reads installed, enabled plugins from registry; excludes chrome plugins (`fs.sovereign.launcher`, `fs.sovereign.account`, `fs.sovereign.console`); renders main grid for accessible plugins; renders a separate "Admin" section for `adminOnly: true` plugins (visible to `platform:admin` only); empty state when no non-chrome plugins are installed
  - `components/PluginGrid.tsx` — responsive grid layout
  - `components/PluginTile.tsx` — tile card: plugin icon + name + description; clicking navigates to the plugin's `routePrefix`

**Dependencies:** Task 0.4.03 (plugin registry and `plugin_status` table), Task 0.4.04 (root plugin redirect so `/` loads Launcher by default)

**SRS reference:** LCH-01–LCH-05, PLT-12, `docs/plugins/launcher.md`

**Review checklist:**

- Navigating to `/` loads the Launcher page (via the root plugin redirect set in Task 0.4.04)
- All installed, enabled, non-chrome plugins appear as tiles with icon, name, and description
- `adminOnly` plugins appear only in the Admin section and only for `platform:admin` users
- Chrome plugins (`fs.sovereign.launcher`, `fs.sovereign.account`, `fs.sovereign.console`) do not appear in any tile section
- Clicking a tile navigates to the plugin's `routePrefix`
- Empty state is shown when no non-chrome plugins are installed
- `pnpm lint`, `pnpm format:check`, and `pnpm typecheck` pass

---

#### ✅ Task 0.4.06 — Account plugin

**Goal:** Per-user profile, preferences, and credential management for all authenticated users.

**Deliverables:**

- `plugins/account/` with:
  - `manifest.json` — id: `fs.sovereign.account`, type: `platform`, runtime: `native`, routePrefix: `/account`, shell: `default`, icon: `icon.svg`, permissions: `["auth:session", "db:readWrite"]`, minPlatformVersion: `0.4.0`
  - `icon.svg` — user silhouette or similar. Note: the sidebar bottom section renders the user's avatar (or initials) for `fs.sovereign.account`, not this icon; `icon.svg` is used in the Launcher grid only.
  - `app/layout.tsx` — three-tab sub-navigation: Profile / Security / Preferences
  - `app/page.tsx` — redirect to `/account/profile`
  - `app/profile/page.tsx` — display name + avatar upload (ACC-01, ACC-02, ACC-03). Avatar stored on disk at `data/avatars/<user_id>` and served via a Next.js route; `avatar_url` written to the user record.
  - `app/security/page.tsx` — password change with current-password confirmation (ACC-04); active sessions list with revoke (ACC-05, ACC-06)
  - `app/preferences/page.tsx` — timezone (searchable IANA dropdown, ACC-07) + appearance toggle Light / Dark / System (ACC-08)
  - `db/schema.ts` — `account_prefs` table: `user_id` (PK/FK), `tenant_id`, `timezone` (IANA string, default `UTC`), `theme` (`system` | `light` | `dark`, default `system`), `updated_at`
  - `components/AvatarUpload.tsx`, `components/SessionList.tsx`, `components/TimezoneSelect.tsx`
- Appearance preference written to both `account_prefs` (authoritative) and a `sv-theme` cookie so the shell can apply `data-theme` on the server without a DB round-trip (prevents SSR flash — see ACC-08 open question in `docs/plugins/account.md`)

**Dependencies:** Task 0.4.02 (`sdk.auth` — session, password change via `better-auth`, sessions API)

**SRS reference:** ACC-01–ACC-08, `docs/plugins/account.md`

**Review checklist:**

- User can update display name; change persists on reload
- Avatar upload stores file, updates `avatar_url`, and is reflected in the sidebar bottom section's avatar slot
- Password change succeeds with the correct current password; rejected with wrong current password; current session is preserved after a successful change
- Active sessions list shows all sessions with device hint, IP, and last-active timestamp; any session except the current one can be revoked
- Timezone preference stored in `account_prefs`
- Appearance toggle applies `data-theme` immediately without reload; preference survives page reload via the `sv-theme` cookie
- `pnpm lint`, `pnpm format:check`, and `pnpm typecheck` pass

---

### Phase v0.5 — Polish and Self-Hosting

#### ✅ Task 0.5.00 — `scripts/install-plugins.ts` — plugin install script

**Goal:** Full implementation of the install script stubbed in Task 0.3.01.

**Deliverables:**

- `sovereign.plugins.json` at repo root — config file declaring which sovereign/community plugins to install:
  ```json
  {
    "plugins": [
      {
        "id": "io.openfs.sovereign.tasks",
        "repository": "https://github.com/sovereignfs/sovereign-plugin-tasks"
      },
      {
        "id": "io.openfs.sovereign.splitify",
        "repository": "https://github.com/sovereignfs/sovereign-plugin-splitify"
      }
    ]
  }
  ```
- `scripts/install-plugins.ts` — reads `sovereign.plugins.json`, clones each repository into `plugins/[id]/` if not already present, skips if directory exists, runs `pnpm generate` after all plugins are installed
- `package.json` script: `"install:plugins": "tsx scripts/install-plugins.ts"`

**SRS reference:** 2.3 Monorepo Structure, 3.5 Plugin System

**Review checklist:**

- Running script clones declared plugins into correct directories
- Already-cloned plugins are skipped without error
- `pnpm generate` runs automatically after install
- Script fails clearly if a repository URL is unreachable

#### ✅ Task 0.5.01 — PWA configuration

**Goal:** Runtime configured as an installable PWA.

**Deliverables:**

- `@ducanh2912/next-pwa` configured in `runtime/next.config.ts`
- `public/manifest.json` — PWA manifest: name, icons, theme colour
- Service worker caching shell and static assets
- App installable from Chrome and Safari

**SRS reference:** 3.11 PWA, PLT-09

**Review checklist:**

- Lighthouse PWA audit passes
- App installable on desktop Chrome and mobile Safari
- Offline load shows shell (not blank page)

---

#### ✅ Task 0.5.02 — Production Docker image

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

#### ✅ Task 0.5.03 — Postgres validation

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

#### ✅ Task 0.5.04 — `sv` CLI — core commands

**Goal:** `sv` CLI with essential commands for managing a Sovereign deployment.

**Deliverables:**

- `bin/sv` — TypeScript entry point, executed via `tsx` (no separate compile
  step; consistent with the `scripts/` pattern)
- Commands:
  - `sv install` — runs install script, clones sovereign/community plugins defined in config
  - `sv generate` — runs generate script
  - `sv build` — runs generate then pnpm build
  - `sv dev` — starts runtime and auth server in dev mode
  - `sv serve` — starts production server via direct node. PM2 is supported as
    an optional non-Docker deployment path — documented in `docs/self-hosting.md`
    but not the canonical production approach. Docker is canonical.
  - `sv plugin add <repository>` — clones a plugin, runs generate
  - `sv plugin remove <id>` — removes plugin directory, runs generate

**Technology:** `citty` (command framework) + `consola` (terminal output) —
both TypeScript-first, lightweight, from the UnJS ecosystem. `citty` handles
nested subcommands (`sv plugin add/remove`) cleanly. `consola` provides
consistent info/success/warn/error formatting. CLI is monorepo-internal in v1
— no global npm install path. See SRS §2.2 and decision log.

**SRS reference:** 2.4 Phased Roadmap v0.5, 2.2 Tech Stack

**Review checklist:**

- `sv dev` starts both services correctly
- `sv plugin add` clones and wires a plugin end-to-end
- `sv plugin remove` cleans up symlinks/copies and updates registry
- `sv --help` and `sv plugin --help` output accurate, well-formatted help text
- No compiled output — CLI runs directly via `tsx`

---

#### ✅ Task 0.5.05 — SDK implementations (db and platform)

**Goal:** Complete remaining SDK implementations. `sdk.auth` and `sdk.mailer` were wired in Task 0.4.02. This task completes `sdk.db` and `sdk.platform`.

> **Scope update (Jun 2026).** Since this task was written the architecture moved on: `sdk.platform` and `sdk.mailer` are implemented **directly in `packages/sdk`** (via `@sovereignfs/db`/`@sovereignfs/mailer`), not re-exported from the runtime — so the "SDK re-exports runtime implementations" deliverable below is obsolete, and `runtime/src/sdk/*` is not created. `sdk.platform.getConfig()` landed async with Task 0.5.03; this task completes the last stub, `sdk.db.getClient()` (async, returns the live platform Drizzle instance). The **local JWT-verification middleware migration (AUTH-05) is split into its own follow-up task** — it is large and security-sensitive (better-auth currently uses DB-backed session cookies with no JWT/cookie-cache configured; it needs auth-side JWT issuance plus Edge-compatible `jose` verification on the runtime), and the current `/api/verify` round-trip works correctly in the meantime.

**Deliverables:**

- `runtime/src/sdk/db.ts` — real `getClient()` returning scoped Drizzle instance
- `runtime/src/sdk/platform.ts` — real `getConfig()` reading from `tenants` table
- `runtime/src/middleware.ts` — updated to verify JWT locally using `SOVEREIGN_AUTH_SECRET` (replaces `/api/verify` round-trip per SRS AUTH-05)
- SDK package updated to re-export all runtime implementations when running inside runtime context

**SRS reference:** 3.6 SDK

**Review checklist:**

- `sdk.auth.requireSession()` throws when called from an unauthenticated context
- `sdk.db.getClient()` returns a working Drizzle instance
- `sdk.mailer.send()` delegates correctly to packages/mailer
- No stub implementations remain for the v1 SDK surface

---

#### ✅ Task 0.5.05b — Local session verification in middleware (AUTH-05) **[split from 0.5.05; done]**

**Goal:** Replace the runtime middleware's per-request `/api/verify` round-trip to the auth server with **local** verification of the session, using the shared secret.

**Delivered:** The auth server enables better-auth's signed cookie cache (`session.cookieCache`, `maxAge` 300s), which sets a `session_data` cookie holding session+user HMAC-signed with `AUTH_SECRET`. The runtime middleware verifies it offline via `getCookieCache` (`better-auth/cookies`, Edge-safe) plus the pure `verifiedUserFromCache`/`resolveAuthSecret` helpers (`runtime/src/session-verify.ts`), using `SOVEREIGN_AUTH_SECRET ?? AUTH_SECRET` (local verify skipped when neither is set — no insecure default). On a cache miss it falls back to `/api/verify` (AUTH-06), which now re-emits better-auth's `Set-Cookie`, forwarded by the middleware so the cache self-refreshes. All prior behaviour is preserved (`/login` redirect, `x-sovereign-user-*` headers, `adminOnly` 403, disabled-plugin 404, root-plugin rewrite). Trade-off: role/active changes are stale for at most `maxAge`. Runtime services in all compose files now receive `AUTH_SECRET`.

**SRS reference:** AUTH-05

**Review checklist:**

- An authenticated request is verified with no network call to the auth server
- An invalid/expired/missing token redirects to `/login`
- Deactivated accounts are rejected (parity with the current `active === false` check)
- `SOVEREIGN_AUTH_SECRET` is required at startup (no insecure default)

---

#### ✅ Task 0.5.06 — Documentation **[done]**

**Goal:** Complete self-hosting and plugin developer documentation.

> **Delivered.** `docs/plugin-development.md` and `docs/architecture.md` written;
> `README.md` expanded; `docs/self-hosting.md` and `docs/upgrade.md` completed
> (platform v0.3→v0.4→v0.5 notes). A docs-parity test
> (`runtime/src/docs-parity.test.ts`) + a "docs are part of the change" CLAUDE.md
> convention keep manifest fields, permissions, the SDK surface, and env vars in
> sync with the code.

**Deliverables:**

- `docs/self-hosting.md` — complete: requirements, Docker deploy, env vars, first run, Postgres switch, upgrade path
- `docs/plugin-development.md` — complete: manifest reference, SDK usage, file structure, how to submit to registry
- `docs/architecture.md` — summary of SRS architecture sections for contributors
- `docs/upgrade.md` — versioned upgrade notes (v0.3 → v0.4 → v0.5)
- `README.md` updated — project overview, quick start, links to docs

**SRS reference:** NFR-10, 2.4 Phased Roadmap v1.0

**Review checklist:**

- A developer with no prior Sovereign knowledge can deploy from scratch following `self-hosting.md`
- Plugin developer guide covers all manifest fields with examples
- All env vars documented with descriptions and whether required or optional

---

#### ✅ Task 0.5.07 — CI pipeline

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

#### ✅ Task 0.5.08 — Public `/api` namespace delegation **[parallel]**

**Goal:** Reserve the top-level `/api/*` namespace for plugin-served public APIs, per PLT-16. Required before the API Composer plugin (`docs/plugins/api-composer.md`) can serve its generated APIs.

**Deliverables:**

- Runtime middleware: requests under `/api/*` are exempt from the session-redirect rule (PLT-02) — the serving plugin owns authentication for these routes (API keys per the API Composer spec)
- Route delegation: the runtime rewrites `/api/<segment>/*` to the registered API-provider plugin's serve route (for API Composer: `/api-composer/serve/<segment>/*`)
- Provider registration mechanism — likely a manifest flag (e.g. `apiProvider`); exact shape decided in this task, coordinated with `packages/manifest`. Exactly one provider per instance in v1; the generate script fails loudly if two plugins declare it
- With no provider installed, `/api/*` returns 404

**SRS reference:** PLT-16, `docs/plugins/api-composer.md` (architecture — `/api` namespace delegation)

**Review checklist:**

- An unauthenticated request under `/api/*` is not redirected to login
- `/api/<slug>/<path>` reaches the provider plugin's serve handler with the slug and path intact
- `/api/*` returns 404 when no provider plugin is installed
- Two plugins declaring the provider flag fail the generate step with a clear error

---

#### ✅ Task 0.5.09 — Overlay shell mode **[parallel]**

**Goal:** Add the `overlay` shell mode from RFC 0001 (SRS §3.8/§3.9) — a plugin renders as a dismissable dialog over the current page, with a full-page fallback on hard navigation — and migrate Console and Account to it. A v0.5 polish item; no hard dependency on the other v0.5 tasks, but it needs the `packages/ui` `Dialog` primitive. Console and Account already ship as `default`/full-page, so this is a retrofit.

**Deliverables:**

- `packages/manifest`: `shell` enum gains `'overlay'`; tests; **minor** version bump
- `packages/ui`: a `Dialog` primitive (scrim + panel, sizes, Esc/scrim-click dismissal, focus trap, `--sv-*` tokens) and its mobile full-screen sheet behaviour
- Runtime: a `@modal` parallel-route slot under `(platform)/` (`default.tsx`, dialog `layout.tsx`); the platform layout renders the slot
- `scripts/generate-registry.ts`: for `shell: overlay`, compose the plugin's `app/` tree twice — interception copy under `(platform)/@modal/(.)<routePrefix>/` and full-page fallback under `(platform)/(plugins)/<routePrefix>/`; emit the mode in the registry
- Root-plugin eligibility (CON-11) excludes `overlay` plugins
- Migrate `plugins/console` and `plugins/account` manifests to `shell: "overlay"`; update `docs/plugins/console.md` and `docs/plugins/account.md`
- `CLAUDE.md`: hard-rule note that the shell route-group mapping gains the overlay compose target

**SRS reference:** RFC 0001, SRS §3.8, §3.9, CON-11, §5

**Review checklist:**

- A soft (in-app) navigation to Console/Account opens it as a dialog over the current page; the underlying page stays mounted and is restored on dismiss
- A hard load / deep link / refresh of `/console` or `/account` renders the full-page fallback
- `adminOnly` gating still returns 403 for Console regardless of presentation mode
- Esc and scrim-click dismiss the dialog; mobile renders a full-screen sheet
- An `overlay` plugin cannot be selected as the root plugin (CON-11)
- The generate script composes both copies; navigating between an overlay plugin's sub-routes stays within the dialog

---

#### ✅ Task 0.5.10 — Cross-plugin data sharing (consent-gated)

**Goal:** Implement the consent-gated, pull-based, read-only cross-plugin data-sharing mechanism specified in RFC 0002 / SRS §3.13. The reserved `sdk.data` surface and the `data:provide`/`data:consume` permissions already exist as stubs; this task makes them real. Depends on `sdk.db` (Task 0.5.05).

**Delivered:**

- `@sovereignfs/manifest` → 0.10.0: optional `data.provides[]` / `data.consumes[]` manifest fields; `data:provide` and `data:consume` permissions promoted from reserved to active
- `@sovereignfs/db` → 0.8.0: `consent_grants` and `data_access_log` tables (SQLite + Postgres, bootstrap DDL, dialect-parity-tested); 7 helper functions (`getConsentGrant`, `listConsentGrants`, `listAllConsentGrants`, `createConsentGrant`, `revokeConsentGrant`, `logDataAccess`)
- `@sovereignfs/sdk` → 1.2.0: `sdk.data.provide(contract, resolver)` stores an in-process resolver via the host; `sdk.data.query(ref, params)` consent-checks, calls the resolver, and logs access; `SdkHost` extended with `data` section
- Runtime → 0.13.0: in-memory resolver registry; middleware injects `x-sovereign-plugin-id` for plugin routes; `GET/POST /api/account/data-grants`, `DELETE /api/account/data-grants/[id]`, `GET /api/admin/data-grants`
- Account plugin → 0.3.0: **Data** tab — lists active consents with per-grant revoke
- `docs/plugin-development.md`: `data` manifest field documented, `sdk.data` usage guide with provider/consumer code samples; docs-parity test passes

**Deferred:** `packages/ui` `ConsentPrompt` dialog primitive and Console data oversight view are post-task refinements; the grant management API is fully functional and the Account tab provides user-facing revocation.

**SRS reference:** RFC 0002, SRS §3.13, §5 (manifest `data.*`)

---

#### ✅ Task 0.5.11 — Logout / self sign-out

**Goal:** Implement AUTH-02 self sign-out across the SDK, the shell chrome, and the Account plugin. The requirement was specified but never built — the shell exposes the avatar only as a link to `/account`, `sdk.auth` has no `signOut`, and session revoke (ACC-06) excludes the current session.

**Deliverables:**

- SDK: `sdk.auth.signOut()` → `POST /api/auth/sign-out` on the auth server (forwarding the session cookie + the `Origin` header, per the better-auth CSRF rule already used by `change-password`/`update-user`)
- Runtime: a logout server action / route that calls sign-out, then clears both `better-auth.session_data` and `__Secure-better-auth.session_data` cache cookies (`maxAge: 0`) and `redirect('/login?signedout=1')`
- Shell chrome: an avatar **popover menu** (`runtime/app/(platform)/layout.tsx`, the PLT-11 account slot) — a small `"use client"` component with an Account link + Log out; replaces the bare avatar link. Keyboard-accessible (`aria-expanded`, Esc, click-outside)
- Account: the Security tab's current-session row gains a **Log out** action (Revoke stays for other sessions, ACC-06); the control is a progressive-enhancement form POST (works without JS)
- `/login` shows a "You've been signed out" notice when `?signedout=1`

**Dependencies:** Task 0.4.06 (Account / Security tab), Task 0.5.05b (the `session_data` signed cookie-cache mechanism)

**SRS reference:** AUTH-02, ACC-11, `docs/plugins/account.md`; CLAUDE.md "Profile self-mutations must invalidate the `session_data` cache cookie"

**Review checklist:**

- Clicking Log out (from the avatar menu or the Security row) ends the session and redirects to `/login`
- After logout, protected routes redirect to login **immediately** — no stale window up to `cookieCache` `maxAge` (both cache cookies cleared)
- Other-session revoke (ACC-06) still works and still cannot revoke the current session via the Revoke control
- The avatar menu is keyboard-accessible and dismissable; the Account-page control works with JS disabled
- `sdk.auth.signOut()` sends the `Origin` header (no `MISSING_OR_NULL_ORIGIN`)

---

#### ✅ Task 0.5.12 — Activity log (RFC 0005)

**Delivered:**

- `activity_log` table in both SQLite and Postgres schemas (parity-tested); `recordActivity()`, `listUserActivity()`, `listAdminActivity()` helpers in `@sovereignfs/db` (→ 0.9.0); bootstrap DDL with three indexes
- `sdk.activity.log()` implemented (no longer a stub): reads actor/plugin from request headers via the `SdkHost.activity.log()` contract; runtime injects actor type and namespaces action by plugin ID; `activity:write` permission documented (`@sovereignfs/sdk` → 1.3.0)
- Capture points: Console user-management actions (invite, role change, deactivate/reactivate), admin plugin enable/disable, admin settings changes (tenant name, root plugin, invite-only), Account self-mutations (display name, password change, session revoke, avatar)
- API routes: `GET /api/account/activity` (personal feed, session-gated) and `GET /api/admin/activity` (platform-wide, admin-key-gated with `actorId`/`action`/`limit` filters)
- Account **Activity** tab (`/account/activity`) — personal feed, all users; Console **Activity** nav entry + page (`/console/activity`) — platform-wide feed with actor, action, summary, scope columns
- `runtime/src/activity.ts` `logActivity()` — fire-and-forget wrapper used by runtime routes; never throws so a log failure never blocks the primary action
- `runtime` → 0.14.0; `plugins/account` → 0.4.0; `plugins/console` → 0.5.0

**Deferred:** Login/session-established capture at the runtime verify boundary (Edge runtime cannot write the platform DB; deferred to a follow-on task per RFC 0005 §3 open question).

---

#### ✅ Task 0.5.13 — Deployment & upgrade strategy (RFC 0006)

**Goal:** Implement the tiered, low-downtime upgrade model from RFC 0006 / SRS §3.15. Depends on the CI pipeline (Task 0.5.07) for image publishing.

**Deliverables:**

- CI builds + pushes semver-tagged runtime/auth images; `docker-compose.prod.yml` references `image:` tags pinned by `SOVEREIGN_VERSION` (build-from-source kept as a fallback)
- Graceful shutdown (SIGTERM draining + `stop_grace_period`) in both standalone servers; blue-green documented as the advanced path
- drizzle-kit migrations under expand-contract: `drizzle.config`, `packages/db/migrations/`, load-bearing `runMigrations`, `schema_migrations` ledger, single-writer advisory lock, fail-fast
- `sv backup`/`sv restore` (dialect-aware, DB + avatars) + automatic pre-upgrade snapshot; tag-pinned rollback procedure
- Startup version gate (downgrade guard) surfaced in `/api/admin/health`
- Docs: `docs/self-hosting.md` + `docs/upgrade.md` rewrite

**Dependencies:** Task 0.5.07 (CI / image registry)

**SRS reference:** RFC 0006, SRS §3.15, NFR-01/04/10

**Review checklist:**

- An upgrade is `pull` + recreate (no host build); rollback = repin previous tag + `sv restore`
- A failed migration leaves the DB un-served and the pre-upgrade snapshot intact
- Graceful restart drops no in-flight requests behind the reverse proxy

---

#### ✅ Task 0.5.14 — User data portability (RFC 0007)

**Goal:** Implement self-service export/import/migration from RFC 0007 / SRS §3.16. The reserved `sdk.portability` surface and `data:export`/`data:import` permissions land as stubs first (sequenced after RFC 0005's stubs).

**Deliverables:**

- SDK: `sdk.portability.provideExport`/`provideImport` (replace stubs), runtime-mediated with injected user/tenant
- Runtime: export assembler + import validator (format/schema-version checks, ID remap), plugin-resolver registry, versioned-ZIP streaming, owner gating
- Account: a **Data** tab — export (download) + import/restore (upload) with a per-section result summary
- Reference plugins implement export/import resolvers
- Export/import events audited via `sdk.activity` (Task 0.5.12)

**Dependencies:** Task 0.5.05 (`sdk.db`), Task 0.5.12 (audit), Task 1.0.01 (optional bundle encryption, post-v1)

**SRS reference:** RFC 0007, SRS §3.16, §5 (`data:export`/`data:import`)

**Review checklist:**

- Export produces a versioned ZIP (`manifest.json` + `platform/` + `plugins/<id>/`); a plugin only ever exports/imports the current user's own data
- Import remaps IDs (no FK breakage), is additive by default, and skips unknown plugins with a warning
- Cross-instance import maps the subject user to the target instance's current user

---

#### ✅ Task 0.5.15 — Security hardening, Tier 0 + Tier 1 (RFC 0008)

**Goal:** Ship the no-crypto-machinery hardening tiers of RFC 0008 / SRS §3.17 in v1: security headers + threat-model doc (Tier 0) and transport hardening (Tier 1). At-rest encryption and beyond (Tiers 2–4) are deferred post-v1 to Task 1.0.01.

**Deliverables:**

- Tier 0: security headers (CSP/HSTS/X-Frame-Options/X-Content-Type-Options/Referrer-Policy/Permissions-Policy) in both Next configs + `runtime/middleware.ts`; cookie-hardening review; codify the no-telemetry guarantee; new `docs/security.md` (threat model + self-hoster hardening checklist)
- Tier 1: Postgres `sslmode=require` + cert handling in `packages/db`; enforce TLS/HSTS at the edge (documented + required); optional shared-secret/mTLS on the internal runtime↔auth channel
- No new app secrets or native deps in this task (those arrive with Tier 2 in Task 1.0.01)

**Dependencies:** none hard (TLS/HSTS doc assumes the reverse proxy already in `docs/self-hosting.md`)

**SRS reference:** RFC 0008 (Tiers 0–1), SRS §3.17, NFR-02/07/08

**Review checklist:**

- Every response carries the security headers; CSP does not break the runtime/auth UIs or the inline theme script
- Postgres connects over TLS when `sslmode=require`; `docs/security.md` documents the threat model and the hardening checklist
- No behaviour change to the existing session/cookie flow

---

#### ✅ Task 0.5.16 — Test organization (RFC 0010) **[parallel]**

**Goal:** Apply the boundary-based test layout from RFC 0010. Mechanical; one pass.

**Deliverables:**

- Move flat-co-located test files into per-directory `__tests__/` folders within their packages
- Add root `/__tests__/{integration,e2e}` scaffolding (README); reserve `/__tests__/visual`
- Update `vitest.config.ts` `include` globs (`**/__tests__/**/*.test.{ts,tsx}` + root `__tests__/**`); keep `classNameStrategy` + jsdom pragma
- Filename-suffix conventions (`*.integration.test.ts`, `*.visual.test.tsx`, `*.e2e.ts`) + `test:*` scripts
- Update CLAUDE.md ("co-located `*.test.ts`") + the CONTRIBUTING testing section

**Dependencies:** none (mechanical)

**SRS reference:** RFC 0010

**Review checklist:**

- `pnpm test` discovers all relocated tests; `*.pg.test.ts`, docs-parity, and schema-parity stay package-local and still run/skip as before
- The suite is never left half-moved (single PR)

---

#### ✅ Task 0.5.17 — Icon system (RFC 0011)

**Goal:** Adopt Lucide as the icon language per RFC 0011, via a generated zero-dependency SVG set behind a Sovereign `<Icon>`.

**Deliverables:**

- A name list + generation script emitting curated Lucide icons as inline RSC-safe SVG components into the design system; `lucide` as a **devDependency only** (no runtime/peer dep); ISC `NOTICE`
- `<Icon>` component (typed `name` union, size/color bound to `--sv-` tokens, a11y) exported from the design system
- Replace the chrome monograms/`⚙` emoji with `<Icon>`; render plugin manifest `icon.svg` in `PluginTile`/sidebar safely (`<img>`/sanitized, monogram fallback)
- Docs: `docs/design-system.md` (Icon) + `docs/plugin-development.md`

**Dependencies:** Task 0.4.06 (chrome/Account), Task 0.4.05 (Launcher tiles)

**SRS reference:** RFC 0011

**Review checklist:**

- The published design system carries no runtime/peer icon dependency; icons recolor via `currentColor`/tokens and theme correctly
- Adding an icon is "add a name + regenerate"; plugin SVGs are never injected as raw HTML

---

#### ✅ Task 0.5.18 — Registry contribution process

**Goal:** Define and document the process for submitting a community plugin to `registry/plugins.json`.

**Deliverables:**

- `registry/plugins.json` — initial structure (`{ registryVersion, plugins[] }`); each entry is a **thin record** `{ id, repository: { type, url, ref? }, name, description, author, license, homepage?, keywords?, provenance? }`, **not** a copy of the manifest (the manifest is fetched from the source). Lists only third-party plugins (built-in platform plugins are never registered — they ship in-repo); the array starts empty and grows by submission
- A `registryEntrySchema` + `validateRegistryEntry` in `@sovereignfs/manifest` (reused by the registry test, the validation script, and future tooling — `generate-registry` filters, `sv plugin add <id>`)
- `scripts/validate-registry.ts` (`pnpm registry:validate` / `registry:check`): clones each entry's source at its pinned ref, validates the source manifest + LICENSE, computes a sha256 content-hash over the source tree, and records `provenance` (resolved commit + hash + timestamp); `--check` mode verifies the committed provenance without writing
- A `.github/workflows/registry-validate.yml` CI job gated by `paths: ['registry/**']` — runs `pnpm registry:check` only when the registry changes
- `registry/CONTRIBUTING.md` — submission requirements: valid registry entry, valid manifest at the (public) source, LICENSE file, compatible platform version, unique id, fresh provenance
- PR template for registry submissions
- `docs/plugin-development.md` updated with registry submission section

**SRS reference:** 2.7 Open Source Strategy, 3.8 Manifest System

**Review checklist:**

- Registry entries validate against the registry-entry schema (`registry/__tests__`, fails CI on an invalid entry)
- `pnpm registry:validate` fetches the source, validates the manifest + LICENSE, and pins a content hash; `registry:check` (CI, on `registry/` changes only) fails on a missing/stale hash
- Submission requirements are clear and enforceable

---

#### ✅ Task 0.5.19 — Stable SDK and semver commitment

**Goal:** SDK API review, cleanup, and semver commitment documented.

**Deliverables:**

- SDK API review — remove anything experimental or inconsistent
- `packages/sdk/CHANGELOG.md` — initial entry marking v1.0.0 as stable
- `docs/sdk-stability.md` — documents what stable means: patch = no breaking changes, minor = additive only, major = breaking with migration guide
- SDK package version bumped to `1.0.0`

**SRS reference:** NFR-04

**Review checklist:**

- No stub implementations remain in the v1 SDK surface
- All unimplemented stubs (storage, notifications, events) clearly marked as unstable/experimental
- Semver policy documented and linked from README

---

#### ✅ Task 0.5.20 — SDK distribution & plugin isolation boundary (RFC 0023)

**Goal:** Decide and implement the published-SDK model. Plugins are host-composed fragments with no standalone runtime and the SDK is in-process host glue, so publish `@sovereignfs/sdk` as a **types-first contract** (host-provided/guarded impls, no `db`/`mailer` dependency) — which also dissolves the private-deps blocker — or drop the "published" designation if isolated authoring isn't pursued.

**Deliverables:**

- Restructure `packages/sdk`: published artifact is the typed API surface; implementations are host-provided and throw a clear "runs inside the Sovereign runtime" error outside it; `@sovereignfs/db`/`@sovereignfs/mailer` stay `private` (no bundling)
- `publish.yml` `sdk-v*` path works against the restructured package; the SRS decision-log "no runtime dependencies" claim becomes literally true
- Document the plugin **isolation boundary** (author/typecheck ✅, build-as-app/run ❌) in `docs/plugin-development.md`; rewrite the CLAUDE.md caveat; drop the `noExternal`-bundle plan

**Dependencies:** pairs with Task 0.5.19 (stable SDK); unblocks Task 0.5.27

**SRS reference:** RFC 0023; supersedes the SDK-publish prerequisite in RFC 0017

**Review checklist:**

- A standalone plugin repo type-checks against the published SDK with no `db`/`mailer` install
- The published SDK has zero runtime dependencies; impls fail clearly if executed outside the runtime

---

#### ✅ Task 0.5.21 — Plugin compatibility & versioning (RFC 0024)

**Goal:** Make the dormant `schemaVersion` and `compatibility.minPlatformVersion` fields functional, add an advisory `maxPlatformVersion`, and enforce compatibility consistently.

**Deliverables:**

- `packages/manifest`: add `semver`; validate `min`/`maxPlatformVersion` as semver; add `CURRENT_MANIFEST_SCHEMA_VERSION` (accept ≤ current, reject unknown-higher); add optional `maxPlatformVersion`; a pure `checkCompatibility(manifest, platformVersion)` resolver (manifest **minor** bump)
- Wire the resolver at four points: install (`sv plugin add`/`install-plugins`) + build (`generate-registry`) **refuse** incompatible; **boot disables + surfaces** (Console/health); registry filters (Task 0.5.18)
- Advisory `maxPlatformVersion` = warning, non-blocking; docs in `docs/plugin-development.md` + `docs/self-hosting.md` (+ docs-parity for the new field)

**Dependencies:** coordinates with RFC 0006's boot gate (Task 0.5.13)

**SRS reference:** RFC 0024

**Review checklist:**

- A too-new `minPlatformVersion` fails at install/build with a clear message; an incompatible installed plugin is disabled (not bricking) at boot and shown in health
- `schemaVersion` higher than current is rejected; older is accepted

---

#### ✅ Task 0.5.22 — Plugin-scoped environment variables (RFC 0018)

**Goal:** Let a plugin declare and supply its own env vars in plugin scope without touching monorepo files, with secrets never baked into artifacts.

**Deliverables:**

- Manifest `env` field: `KEY → { description, required?, secret?, scope: 'build'|'runtime', default? }` (`default` rejected on `secret`); manifest **minor** bump + docs-parity
- Auto-namespacing `SV_PLUGIN_<SLUG>_<KEY>`; a scoped `sdk.env.get('KEY')` accessor; `NEXT_PUBLIC_SV_PLUGIN_*` for build-scope client values
- `generate-registry` merges manifest defaults + a plugin-local `.env` (dev only), namespaces, validates (no committed secrets, no collisions), emits a generated gitignored loader + an operator-facing list of required secret keys
- Production secrets are operator-supplied at runtime via the namespaced container env; never baked

**Dependencies:** the `sdk.env` surface (SDK)

**SRS reference:** RFC 0018

**Review checklist:**

- A plugin reads its own keys via `sdk.env.get` unprefixed and cannot read platform/other-plugin keys via the accessor
- A committed secret value fails the build; secret keys never appear in the image

---

#### ✅ Task 0.5.23 — Test setup & seeding (RFC 0019)

**Goal:** A test-data foundation — in-code fixtures/factories plus an idempotent seed with per-role test users — and the dev/prod mode concept.

**Deliverables:**

- In-code fixtures/factories (user/tenant/plugin-status/notification) for unit/integration, placed per RFC 0010's layout
- `sv seed` (`scripts/seed.ts`): idempotent baseline data + per-role test users (admin, user; known passwords via `better-auth/crypto`), **hard-gated to non-prod**
- Document the disposable dev/test DB (config-only via `DATABASE_URL`/`AUTH_DATABASE_URL`); align with the RFC 0010 e2e tier; establish dev (default locally) vs prod mode

**Dependencies:** Task 0.5.16 (test-org layout)

**SRS reference:** RFC 0019

**Review checklist:**

- `sv seed` is idempotent and refuses to run against a prod DB; documented test users can log in
- Fixtures need no running instance or DB

---

#### Task 0.5.24 — Minimal shell mode (RFC 0014)

**Goal:** Wire the third `shell` mode — `minimal` (chrome-free, full-bleed) — which currently fails the build.

**Deliverables:**

- A new top-level `(minimal)` route group (sibling of `(platform)`) with a committed chrome-free `layout.tsx` (force-dynamic for the CSP nonce; `100dvh` + safe-area per RFC 0013) + `.gitignore`
- `generate-registry`: replace the `minimal` build-fail with a compose target (`(minimal)/<routeSegment>`, multi-segment allowed) + clear step; compose/parity tests
- Root-plugin eligibility keeps minimal allowed (kiosk) with the no-chrome/no-nav caveat + a nav-contract convention documented; CLAUDE.md note

**Dependencies:** builds on the RFC 0001 composition model

**SRS reference:** RFC 0014

**Review checklist:**

- A `shell: minimal` plugin composes to `(minimal)/` and renders chrome-free; the session gate still applies
- It is not wrapped by the `(platform)` shell

---

#### Task 0.5.25 — Mobile responsiveness & PWA hardening (RFC 0013)

**Goal:** Harden the mobile and PWA experience across the three shell modes.

**Deliverables:**

- Default shell (mobile): footer → an action button opening a dismissable bottom **Drawer** (plugin nav); header gains the active-plugin title; Console moves into the avatar menu
- Overlay: `--sv-dialog-inset-top` keeps the header visible above the mobile sheet
- Cross-cutting: unify the 640/768 breakpoints; `100vh` → `100dvh`; `viewport-fit=cover` + `env(safe-area-inset-*)`; 44px touch targets + `--sv-touch-target-min`; manifest polish (`display_override`/`shortcuts`/`screenshots`/`orientation`, immersive iOS status bar)
- `packages/ui`: a `Drawer` primitive + tokens (additive **minor**); the first responsive section in `docs/design-system.md`

**Dependencies:** relates to Task 0.5.24 (minimal safe-area)

**SRS reference:** RFC 0013

**Review checklist:**

- The mobile footer opens the Drawer; an open overlay keeps the header visible; safe areas are respected in standalone
- One documented breakpoint; the shell uses `dvh`

---

#### Task 0.5.26 — Passkeys & TOTP MFA (RFC 0012)

**Goal:** Add TOTP MFA (authenticator-app only) and passkeys (2FA + passwordless) on better-auth's first-party plugins.

**Deliverables:**

- `apps/auth`: enable `two-factor` (`totp` + `backupCodes`, no email/SMS OTP) and add `@better-auth/passkey` (rpID/rpName/origin); multi-step login (`twoFactorRedirect`) + passwordless `signIn.passkey()`
- Account Security tab: TOTP enrollment (QR + one-time backup codes), passkey add/list/remove; password re-prompt for sensitive changes (given `freshAge: 0`)
- Recovery ladder: backup codes → Console admin reset → `sv` CLI break-glass for a locked-out sole admin
- Session-cache invalidation on factor changes; document the WebAuthn rpID/origin production constraint + the new env vars

**Dependencies:** Task 0.4.06 (Account/Security), Task 0.5.05b (cookie cache)

**SRS reference:** RFC 0012

**Review checklist:**

- A user enrolls TOTP/passkey and is challenged at login; passwordless sign-in works; backup codes + admin reset recover a lost factor
- No SMS/email OTP path exists

---

#### ✅ Task 0.5.27 — Plugin starter template & example plugins (RFC 0017)

**Goal:** A frictionless plugin on-ramp — one canonical starter skeleton delivered three ways, plus capability-demo example plugins that double as test fixtures.

**Deliverables:**

- One canonical skeleton via a GitHub **template repo** (`sovereign-plugin-template`), a **`sv plugin new <name>`** command, and an **`npm create @sovereignfs/plugin`** initializer
- Capability-demo example plugins (`example-basic`, `example-api`, …) that also serve as runtime test fixtures (composition, route-guard, `apiProvider`)
- Consolidated naming/conventions; tie-in to the registry (Task 0.5.18); the dev/test loop is runtime-hosted (RFC 0023 — no standalone run)

**Dependencies:** Task 0.5.20 (types-first SDK publish), Task 0.5.18 (registry), Tasks 0.5.16/0.5.23 (fixtures)

**SRS reference:** RFC 0017

**Review checklist:**

- A new plugin scaffolds and runs against a local Sovereign from any of the three entry points
- Example plugins compose and double as fixtures

---

#### Task 0.5.28 — Accessibility audit & a11y contract (RFC 0025)

**Goal:** Reach WCAG 2.1 AA on all platform-owned UI, add automated a11y linting,
and deliver the plugin developer a11y contract per RFC 0025.

**Deliverables:**

- `eslint-plugin-jsx-a11y` (recommended ruleset) added to `eslint.config.ts`;
  applied to `runtime/`, `apps/auth/`, `packages/ui/`, and `plugins/`; `pnpm lint`
  and the CI `lint` job pass with no suppressions
- `packages/ui`: four new semantic tokens (`--sv-color-error`, `--sv-color-error-text`,
  `--sv-color-success`, `--sv-color-success-text`) paired with icon/text convention;
  `prefers-reduced-motion` applied to animated components (Dialog, future Drawer/Toast);
  `:focus-visible` outline via `--sv-color-focus-ring` codified on all interactive
  components (`@sovereignfs/ui` **minor** bump)
- Audit + fix: runtime shell chrome, `apps/auth` login/registration, Console,
  Launcher, and Account against WCAG 2.1 AA — roles, labels, keyboard interactions,
  focus order, color contrast
- `docs/design-system.md`: contrast commitment table (4.5:1 text, 3:1 UI components)
  for all semantic color pairs; focus-visible token guidance; per-component a11y
  spec (roles, keyboard table, ARIA attributes, focus order)
- `docs/plugin-development.md`: new "Accessibility" section (semantic HTML, form
  labels, icon `aria-hidden`/`aria-label` convention, color independence, keyboard
  operability, custom widget ARIA patterns, live regions, `prefers-reduced-motion`)
- `docs/sovereign-proposal-plan-srs.md`: NFR-11 — WCAG 2.1 AA for platform-owned UI

**Dependencies:** Task 0.5.17 (Icon a11y convention), Task 0.5.25 (touch targets)

**SRS reference:** RFC 0025, NFR-11

**Review checklist:**

- `pnpm lint` passes with `eslint-plugin-jsx-a11y` enabled; no inline suppressions
- Keyboard-only navigation covers: log in, open and close an overlay plugin, navigate
  Console user list, change a setting in Account
- Every semantic color pair documented in `docs/design-system.md` meets 4.5:1 text
  contrast and 3:1 UI-component contrast
- Plugin dev guide "Accessibility" section covers all items from RFC 0025

---

#### Task 0.5.29 — Non-Docker production deployment, Phase 1 — PM2 (RFC 0026)

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

### Phase v0.6 — User roles & capabilities

#### Task 0.6.01 — Platform roles & capabilities (RFC 0021)

**Goal:** Grow the two-role model into a capability-based model with named role presets and a protected `platform:owner` — the SRS §3.4 "future version" with database-driven capability assignment.

**Deliverables:**

- Capabilities as the enforcement unit; built-in presets owner/admin/auditor/user (hardcoded defaults) + a DB-driven override layer
- `platform:owner`: the first user becomes owner (amends AUTH-08 + a migration for existing instances), sole holder of `role:assign`, protected (closes the missing last-admin guard)
- Centralize role/capability constants + a `hasCapability`/`requireCapability` resolver (replacing the ~6 binary `platform:admin` checks); carry effective capabilities in the signed session cache for the Edge gate; SDK helper; Console assignment UI (audited via RFC 0005)

**Dependencies:** Task 0.5.12 (audit), Task 0.5.05b (session cache)

**SRS reference:** RFC 0021, SRS §3.4

**Review checklist:**

- An auditor sees a read-only Console; the owner cannot be locked out; capability changes propagate within the cookie-cache window
- `adminOnly` maps to a capability gate

---

#### Task 0.6.02 — Plugin-declared capabilities (RFC 0022)

**Goal:** Let plugins declare namespaced capabilities (`splitify:create-group`) enforced intra-plugin via the SDK.

**Deliverables:**

- Manifest `capabilities` declaration (auto-namespaced by slug, optional `defaultGrant`), validated at build (manifest **minor**)
- `sdk.auth.hasCapability` resolves plugin capabilities; enforcement is inside the plugin (not the platform route gate)
- The assignment/storage model (platform-stored vs plugin-managed — the central open question) + docs

**Dependencies:** Task 1.0.02 (capability model)

**SRS reference:** RFC 0022

**Review checklist:**

- A plugin gates a feature on its own capability via the SDK; the platform route gate does not enforce plugin capabilities

---

### Phase v0.7 — Notifications

#### Task 0.7.01 — Notification Center (RFC 0015)

**Goal:** A per-user notification inbox with a bell + panel, toasts, the `sdk.notifications` send surface, and admin broadcast.

**Deliverables:**

- Tenant-scoped `notifications` table (read/unread/dismiss) + notification prefs; clearly differentiated from the activity log
- Implement `sdk.notifications.send` (send-only for plugins; runtime injects source/tenant); platform-owned fan-out (inbox + toast if active)
- Bell + panel in chrome (sidebar/header, RFC 0011 icon, RFC 0013 Drawer on mobile) + a `Toast` primitive; `/api/account/notifications` routes
- Admin broadcast with guardrails (audited via RFC 0005, rate-limited, audience-scoped, user opt-out); admin-selectable transport (polling default / WebSocket) + per-user poll interval

**Dependencies:** Task 0.5.05 (`sdk.db`), Task 0.5.12 (audit), Task 0.5.17 (icons)

**SRS reference:** RFC 0015

**Review checklist:**

- A plugin send appears in the inbox + bell badge + a toast; an admin broadcast reaches all users and is audited; users can mute the announcement category

---

#### Task Task 0.7.02 — Web Push notifications (RFC 0016)

**Goal:** Background delivery of inbox notifications via Web Push (VAPID + service worker).

**Deliverables:**

- VAPID keys as optional no-default env secrets (push disabled when unset); a `customWorkerSrc` push/`notificationclick` handler; `push_subscriptions` table + helpers
- Account opt-in (permission + subscribe) with the iOS-installed-PWA caveat; `web-push` send on the RFC 0015 fan-out (subject to category prefs); prune on `410`
- Plugins never touch push — the platform fans out from the inbox

**Dependencies:** Task 1.0.04 (Notification Center)

**SRS reference:** RFC 0016

**Review checklist:**

- Enabling push delivers a background notification; an unsubscribed device gets none; secrets stay in env (push off when unset)

---

### Phase v0.8 — Plugin isolation & Live debuging

#### Task 0.8.01 — Production dev-mode & diagnostics (RFC 0020)

**Goal:** Validate features on a production instance against a mock database without touching real data, plus local no-telemetry diagnostics.

**Deliverables:**

- A request-scoped dev-mode switch (`AsyncLocalStorage`, never global) → the mock DB for the toggled request only; env-gated off by default, secret-authenticated, visibly flagged, audited (RFC 0005); the mock DB seeded by `sv seed`
- Resolve the auth-server mock-DB crux (or scope v1 to data-only mock)
- Structured logging (`LOG_LEVEL`, stdout only) + a richer admin `/api/admin/health` — reconciled with the no-telemetry guarantee

**Dependencies:** Task 0.5.23 (seed), Task 0.5.12 (audit)

**SRS reference:** RFC 0020

**Review checklist:**

- A dev-mode request reads only the mock DB; concurrent real requests are unaffected; nothing egresses

---

#### Task 0.8.02 — Plugin monetization (RFC 0003)

**Goal:** Let plugin authors monetize plugins via a manifest-declared model + author-signed entitlement gating. RFC 0003 accepted.

**Deliverables:**

- Manifest `monetization` object (`model`/`interval`/`tiers`/`license.publicKey`); validation + tests; `@sovereignfs/manifest` minor bump
- Reserved `sdk.billing`/`entitlements` surface (stub throwing `NotImplementedError`) + `EntitlementRequiredError`; `@sovereignfs/sdk` minor bump
- Entitlement gating in runtime middleware by `routePrefix` (paywall / `402`), mirroring the disabled-plugin pattern; `entitlements` table with `tenant_id`
- `PaymentProvider` adapter interface; manual/bank, Stripe, and PayPal adapters (hosted checkout + webhooks); offline signature verification against author public key
- Subscription management in Account (purchase/import license, active subscriptions, renewal/cancel); entitlement oversight + manual-payment confirmation in Console
- Paywall page (runtime-owned); plugin key-rotation support; docs

**Dependencies:** Task 0.5.08 (API namespace — webhook endpoints), Task 0.5.05 (`sdk.db`)

**SRS reference:** RFC 0003

**Review checklist:**

- A `recurring` plugin is paywalled without an entitlement; a signed license grants access; a Stripe webhook renews the entitlement; manual import works with no gateway

---

#### Task 0.8.03 — Per-plugin database (RFC 0004)

**Goal:** Let a plugin opt into a dedicated database (`database: "isolated"`) rather than sharing the platform DB. RFC 0004 accepted.

**Deliverables:**

- SQLite: dedicated file per isolated plugin (`data/plugins/<pluginId>.db`) via `createClient`; per-plugin client registry (lazy, keyed by id); per-store migration-tracking table
- Postgres: schema-per-plugin (`CREATE SCHEMA`, `search_path`); provision on first use, `DROP SCHEMA … CASCADE` on uninstall; no extra pool (single connection)
- Migration runner routes each plugin's migrations to its resolved store (shared → platform DB; isolated → dedicated store)
- `sdk.db.getClient()` transparently returns the shared or dedicated client per the plugin's `database` setting
- Plugin lifecycle hooks: provision on first `getClient()`, drop on uninstall/purge; per-plugin backup/export path
- SRS §3.7/§4.6/§5 updated ("not implemented" → "opt-in isolated model")

**Dependencies:** Task 0.5.03 (Postgres), Task 0.5.05 (`sdk.db`)

**SRS reference:** RFC 0004

**Review checklist:**

- `database: "isolated"` plugin gets its own SQLite file; uninstall drops it entirely; `shared` plugin is unaffected; Postgres schema-per-plugin provisions and drops cleanly

---

#### Task 0.8.04 — Non-Docker production deployment, Phase 2 — systemd (RFC 0026) **[post-v1]**

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

## v1

The v1.0 release line and post-release work — net-new features, the capability
work the SRS §3.4 designates a “future version”, advanced operations, and
exploratory proposals (added as tasks but gated on RFC acceptance).

### Phase v1.0+ — Post-release / future

> Work scheduled **after** the v1.0 public release. Items here are post-v1 regardless of when their reserved-stub groundwork lands.

#### Task 1.0.01 — Encryption at rest & field-level, Tier 2–4 (RFC 0008) **[post-v1]**

**Goal:** The deferred, crypto-heavy tiers of RFC 0008 / SRS §3.17 — shipped **after v1**. Tier 2 (at-rest encryption + key management), Tier 3 (field-level via `sdk.crypto`), and the charting of Tier 4 (zero-knowledge E2EE). The reserved `sdk.crypto` surface + `crypto:use` permission land as `NotImplementedError` stubs first (after RFC 0005's stubs).

**Deliverables:**

- Tier 2: local-keyfile envelope key management (master KEK → wrapped DEKs; fail-fast when enabled); SQLCipher DB encryption (`better-sqlite3-multiple-ciphers`); encrypted backups (amends Task 0.5.13) + encrypted export bundles (amends Task 0.5.14); avatar/blob encryption
- Tier 3: `sdk.crypto` field-level encrypt/decrypt (per-user DEK) + `crypto:use` enforcement; optional blind indexes
- Tier 4: zero-knowledge E2EE remains charted (per-plugin opt-in, aligned with the federation direction) — not built
- New env vars (`SOVEREIGN_ENCRYPTION`, key/keyfile, backup passphrase) → `.env.example` + `docs/self-hosting.md` + docs-parity; **Docker/native-dep impact** (SQLCipher in image build + `allowBuilds`)

**Dependencies:** Task 0.5.15 (Tier 0–1), Task 0.5.13 (backups), Task 0.5.14 (exports)

**SRS reference:** RFC 0008 (Tiers 2–4), SRS §3.17, §5 (`crypto:use`), NFR-02/07/08/09

**Review checklist:**

- A stolen disk / leaked backup yields ciphertext; the docs state plainly that server-held keys do not defend against a curious operator or RCE
- Encryption is opt-in and fails fast when enabled without a key; rotation re-wraps DEKs without bulk re-encryption
- Field-level encryption is gated by `crypto:use`; encrypted columns document the search/sort caveat

---

_Version 1.20 — June 2026. **Task 0.5.18 — Registry contribution process** completed and merged. New `registry/plugins.json` public discovery index — each entry is a **thin record** `{ id, repository: { type: git|path, url }, name, description, tags? }` (a pointer to the source + display metadata, **not** a copy of the manifest; the manifest is fetched from the source at install time, avoiding drift). Lists only third-party plugins; the array starts empty and grows by submission. Adds `registryEntrySchema` + `validateRegistryEntry` to `@sovereignfs/manifest` (**0.7.0 → 0.8.0**, additive `feat`). Entries carry author/license/homepage/keywords + an optional pinned `repository.ref`. A validation pipeline — `scripts/validate-registry.ts` (`pnpm registry:validate` / `registry:check`) — clones each source, validates its manifest + LICENSE, and records `provenance` (resolved commit + sha256 content hash over the source tree); a `.github/workflows/registry-validate.yml` job gated by `paths: ['registry/**']` re-verifies on registry changes only. Used by `registry/__tests__` (wired into `vitest.config.ts`) + `registry/CONTRIBUTING.md` + a directory-based `.github/PULL_REQUEST_TEMPLATE/registry-submission.md` + a "Submitting to the registry" section in `docs/plugin-development.md`. Earlier notes retained._

_Version 1.19 — June 2026. **Task 0.5.16 — Test organization (RFC 0010)** completed and merged. All 36 test files moved from flat co-location into per-directory `__tests__/` folders; root `__tests__/{integration,e2e,visual}/` scaffold added; `vitest.config.ts` globs updated; `test:unit`/`test:integration`/`test:e2e` scripts added; CLAUDE.md + CONTRIBUTING.md updated. No version bumps (chore). Earlier notes retained._ All 36 test files moved from flat co-location into per-directory `__tests__/` folders; root `__tests__/{integration,e2e,visual}/` scaffold added; `vitest.config.ts` globs updated; `test:unit`/`test:integration`/`test:e2e` scripts added; CLAUDE.md + CONTRIBUTING.md updated. No version bumps (chore). Earlier notes retained.\_

_Version 1.18 — June 2026. Planning change (no task completed, no version bumps): RFC 0003 (plugin monetization) and RFC 0004 (per-plugin database) both accepted. Tasks 1.0.07 and 1.0.08 promoted from exploratory placeholders to fully scoped post-v1 tasks; deliverables, dependencies, and review checklists filled out. RFC index updated (Draft → Accepted). Earlier notes retained._

_Version 1.17 — June 2026. Planning change (no task completed, no version bumps): cross-checked all RFCs against the roadmap and incorporated the unscheduled ones. **Pre-v1** gained Tasks 0.5.20 (SDK distribution & isolation, RFC 0023), 0.5.21 (plugin compatibility & versioning, RFC 0024), 0.5.22 (plugin-scoped env, RFC 0018), 0.5.23 (test setup & seeding, RFC 0019), 0.5.24 (minimal shell, RFC 0014), 0.5.25 (mobile/PWA hardening, RFC 0013), 0.5.26 (passkeys & TOTP MFA, RFC 0012), 0.5.27 (plugin starter & examples, RFC 0017). **v1 / post-release** gained Tasks 1.0.02 (platform roles & capabilities, RFC 0021), 1.0.03 (plugin-declared capabilities, RFC 0022), 1.0.04 (Notification Center, RFC 0015), 1.0.05 (Web Push, RFC 0016), 1.0.06 (production dev-mode & diagnostics, RFC 0020), and exploratory 1.0.07 (plugin monetization, RFC 0003) / 1.0.08 (per-plugin database, RFC 0004). RFC 0009 stays withdrawn (no task). All are documentation-first Draft RFCs; phasing/ordering may change as they are scheduled and accepted. Earlier notes retained._

_Version 1.16 — June 2026. Planning change (renumber): moved **Registry contribution process** → **Task 0.5.18** and **Stable SDK and semver commitment** → **Task 0.5.19** into the pre-v1 Phase v0.5 (they are the run-up-to-1.0 deliverables). Introduced a **Phase v1.0+ — Post-release / future** heading and renumbered the encryption work from Task 0.5.18 to **Task 1.0.01 — Encryption at rest & field-level, Tier 2–4 (RFC 0008)** `[post-v1]` so a task's number prefix now matches its phase (0.5.x = pre-v1, 1.0.x = post-release). Cross-references updated (Tasks 0.5.14/0.5.15). Mirrored in SRS v0.24. Earlier notes retained._

_Version 1.15 — June 2026. Planning change: phased RFC 0008 across v1 / post-v1. **Task 0.5.15** is retitled **"Security hardening, Tier 0 + Tier 1"** (security headers + `docs/security.md` threat model + transport/TLS/Postgres SSL) and ships in v1. New **Task 0.5.18 — Encryption at rest & field-level, Tier 2–4 (RFC 0008)** `[future / post-v1]` holds key management + SQLCipher at-rest + encrypted backups/exports + avatar encryption + `sdk.crypto` field-level (the reserved `sdk.crypto`/`crypto:use` stubs land there); zero-knowledge E2EE stays charted. SRS v0.23 mirrors the split (§3.17 phasing note + updated decision row). Earlier notes retained._

_Version 1.14 — June 2026. Planning change (no task completed, no version bumps): incorporated RFCs 0005, 0006, 0007, 0008, 0010, and 0011 into the build plan. Added **Task 0.5.11 — Logout / self sign-out** (AUTH-02/ACC-11), **Task 0.5.12 — Activity log** (RFC 0005), **Task 0.5.13 — Deployment & upgrade strategy** (RFC 0006), **Task 0.5.14 — User data portability** (RFC 0007), **Task 0.5.15 — Security & encryption architecture** (RFC 0008), **Task 0.5.16 — Test organization** (RFC 0010), and **Task 0.5.17 — Icon system** (RFC 0011). Corresponding SRS edits land in SRS v0.22 (§3.14–§3.17, §5 reserved permissions `activity:write`/`data:export`/`data:import`/`crypto:use`, decision-log rows). RFC 0009 (package codenames) was **withdrawn/deferred** — no task. All reserved SDK surfaces/permissions are additive stubs; the mechanisms land in their respective tasks. Earlier notes retained._

_Version 1.13 — June 2026. Changes from v1.12: reserved the cross-plugin data-sharing surface (RFC 0002, SRS §3.13). Added **Task 0.5.10 — Cross-plugin data sharing (consent-gated)** `[future]` — implements the consent-gated, pull-based, read-only mechanism (consent grants + audit log, manifest `data.*` declarations, runtime resolution, `packages/ui` consent prompt, Account/Console management); depends on `sdk.db` (Task 0.5.05). Landing now (additive, no behaviour change): the reserved `sdk.data` stub (`query`/`provide` → `NotImplementedError`) and `ConsentRequiredError` in `packages/sdk`, and the reserved `data:provide`/`data:consume` permissions in `packages/manifest`, with tests; `@sovereignfs/sdk` → 0.5.0, `@sovereignfs/manifest` → 0.3.0. Also git-/Prettier-ignores `/local/` (private working area). Earlier notes retained._

_Version 1.12 — June 2026. Planning change (no task completed, no version bumps): RFC 0001 (overlay shell variant) accepted and incorporated. Added **Task 0.5.09 — Overlay shell mode** `[parallel]` to the v0.5 phase: a third `shell` mode (`overlay`) that renders a plugin as a dismissable dialog over the current page (App Router parallel + intercepting routes — `@modal` slot + dual composition by the generate script), with a full-page fallback on hard navigation, plus a `packages/ui` `Dialog` primitive and migration of Console/Account. Sequenced as a v0.5 polish item (no hard dependency on the other v0.5 tasks; needs the UI `Dialog`). Corresponding SRS edits: §3.8 (third shell mode), §3.9 (dual composition), §5 (manifest `shell` enum gains `'overlay'`), CON-11 (root-plugin eligibility excludes overlay), and a decision-log row. The manifest enum change and all code land in Task 0.5.09, not in this planning change. Earlier notes retained._

_Version 1.11 — June 2026. Changes from v1.10 (Task 0.5.01, PWA configuration — SRS §3.11, PLT-09; `runtime` → 0.5.0): the runtime is now an installable PWA. `@ducanh2912/next-pwa` wraps `runtime/next.config.ts` (preserving `transpilePackages`/`serverExternalPackages`), **disabled in development** so it never touches HMR — installability/Lighthouse therefore apply only to a production build. `runtime/public/manifest.json` (name, `standalone`, theme/background `#09090b`, 192/512/maskable icons) and the PNG icons in `runtime/public/icons/` are committed source; the icons are the monochrome Launcher 2×2-grid mark, generated programmatically (no rasterizer available). The manifest, theme colour, and apple-touch icon are linked via root-layout `metadata`/`viewport`. A self-contained `/offline` route is the navigation fallback (`fallbacks.document`). The service worker (`sw.js`/`workbox-*`/`fallback-*`) is generated into `runtime/public/` at build and is gitignored + ESLint/Prettier-ignored. The middleware matcher now also excludes the PWA assets and `/offline` (they must load without a session). Verified: `next build` generates the SW cleanly and prerenders `/offline`; a manifest regression test (4) asserts the installability fields. Earlier notes retained._

_Version 1.10 — June 2026. Changes from v1.9 (Task 0.5.00, plugin install script — enters the v0.5 phase, platform → 0.5.0): `scripts/install-plugins.ts` is now implemented (was a stub). It reads `sovereign.plugins.json` (`{ "plugins": [{ "id", "repository" }] }`) at the repo root, shallow-clones each declared plugin into `plugins/<id>/` (skipping any already present), then runs `pnpm generate` to compose them; it fails with a clear message + exit 1 on an unreachable/invalid repo. The parse/validate and clone/skip decision are pure exported helpers (`parsePluginsConfig`, `planInstall`) with 11 unit tests (vitest now also includes `scripts/**`). Cloned plugins are gitignored via an allowlist (`/plugins/*/` except the committed `account`/`console`/`launcher`) since they have their own repositories. `sovereign.plugins.json` ships with an empty list — the reference plugin repos (Tasks/Splitify) don't exist yet, so the doc's example config is documented schema rather than a config that would 404; the example/format lives in CONTRIBUTING. Verified live: empty config no-ops; a real repo clones then re-runs as skipped; an unreachable URL exits 1. Earlier notes retained._

_Version 1.9 — June 2026. Changes from v1.8 (Task 0.4.06 part 2 of 2, Account — Security tab): the Account plugin gains a Security tab — password change (ACC-04, current session preserved) and active-session list with revoke (ACC-05/06). `sdk.auth` is extended (published-contract minor, `sdk` → 0.4.0) with `changePassword`, `listSessions`, and `revokeSession`, which wrap better-auth's `change-password`/`list-sessions`/`revoke-session` server-side, forwarding the session cookie and sending the auth base URL as `Origin` (the CSRF requirement recorded in part 1). A pure `markCurrentSessions()` (`packages/sdk/src/sessions.ts`) flags the current session and orders it first (6 tests); `ActiveSession`/`ChangePasswordInput` types added. The plugin's `PasswordChangeForm` (useActionState) surfaces better-auth's message (e.g. "Invalid password"); `SessionList` shows a device/browser hint, IP, and last-active, with revoke on non-current sessions only. Verified live: wrong current password → 400 surfaced, correct → 200 with the current session preserved, second session revoked (2→1), and `/account/security` renders with the current session marked. **Fix during review:** `GET /list-sessions` is guarded by better-auth's `freshSessionMiddleware`, which returns `403 SESSION_NOT_FRESH` once a session is older than `freshAge` (default 1 day) — so the Security tab worked for fresh sessions but 403'd for a browser logged in a day+ earlier. Set `session.freshAge: 0` in `apps/auth/src/auth.ts` to disable the gate (self-hosted users stay signed in for weeks); regression-tested. This completes Task 0.4.06 and the v0.4 chrome-plugin trio (Console, Launcher, Account). `sdk` → 0.4.0, `plugins/account` → 0.2.0, `apps/auth` → 0.3.1. Earlier notes retained._

_Version 1.8 — June 2026. Changes from v1.7 (Task 0.4.06 part 1 of 2, Account plugin — Profile + Preferences): `plugins/account/` ships the per-user Profile tab (display name via better-auth `update-user`; avatar upload) and Preferences tab (IANA timezone + Light/Dark/System theme). `packages/db` gains an `account_prefs` table (user_id PK, tenant_id, timezone default UTC, theme default system) with `getAccountPrefs`/`setAccountPrefs` helpers (4 tests). The runtime adds session-gated `GET/PATCH /api/account/prefs` (validates timezone via Intl + theme enum), `POST /api/account/avatar` (validates type/size, writes `data/avatars/<user_id>.<ext>`, sets the user `image` via better-auth), and `GET /api/account/avatar/[userId]` to serve it; pure validators in `runtime/src/account.ts` have 7 tests. **Avatar storage** resolved per account.md Q1 (disk + Next route). **Theme/SSR** resolved per account.md Q4: the choice is written to `account_prefs` (authoritative) + an `sv-theme` cookie, and applied before first paint by an inline script in `runtime/app/layout.tsx` (cookie → `data-theme`; `system`/unset follows `prefers-color-scheme`). The shell's Account slot now renders the user's avatar image or a name/email monogram (PLT-11). **Gotcha recorded:** server-to-server better-auth POSTs must send an `Origin` header equal to the auth base URL or better-auth returns `MISSING_OR_NULL_ORIGIN` (403). Verified live: display-name change, avatar upload→serve (200 image/png) + rejection (400), timezone/theme persist + cookie set + invalid-timezone 400, `/` still serves the Launcher in place. **Part 2 (next):** the Security tab — password change + session list/revoke — which extends `sdk.auth` (published-contract change). `packages/db` → 0.4.0, `runtime` → 0.4.0; new `plugins/account` at 0.1.0. Earlier notes retained._

_Version 1.7 — June 2026. Changes from v1.6 (Task 0.4.05, Launcher plugin): the first non-Console platform plugin ships in `plugins/launcher/` — a home grid (LCH-01–05) that serves `/launcher` and, as the default `root_plugin_id`, now backs `/` (so the 0.4.04 root redirect resolves to a real plugin for the first time). Because the SDK boundary rule forbids a plugin importing the registry, the Launcher reads its tile list from a new **session-gated** `runtime/app/api/plugins/route.ts` (not under the `/api/admin` exclusion — middleware injects `x-sovereign-user-role`), forwarding the caller's cookie; the route role-filters via a pure `selectLauncherPlugins(plugins, disabledIds, role)` in `runtime/src/launcher-plugins.ts` (excludes the three **chrome** plugins `fs.sovereign.{launcher,account,console}` via the canonical `CHROME_PLUGIN_IDS` set, excludes disabled plugins, and hides `adminOnly` plugins from non-admins). The Launcher page renders a main grid plus an admin-only "Admin" section and an empty state (Console link for admins, contact-admin note otherwise). The sidebar middle section now also excludes chrome plugins (PLT-12); full root-plugin-first ordering (PLT-11–15) remains separate. Plugin components live under `app/_components/` (a private App Router folder) because the generate script composes only each plugin's `app/` tree. Tiles use a two-letter monogram — no icon-serving pipeline yet (launcher.md Q3). `/` now **serves the root plugin in place** rather than redirecting (revises the 0.4.04 redirect): the middleware rewrites `/` to the configured plugin's `routePrefix` (URL stays `/`, plugin still reachable at its prefix), resolving the prefix at request time via a new `GET /api/admin/root-plugin` route (Edge middleware can't read the DB — same fetch pattern as disabled-plugins); `resolveRootRoutePrefix()` in `runtime/src/root-plugin.ts` is unit-tested, and `(platform)/page.tsx` keeps its `redirect()` as a fallback. Verified live with a real session: `/` → 200 serving the Launcher in place, `/launcher` → 200 directly, `/api/plugins` → `{plugins:[]}` (only chrome installed), unauthenticated gating (307). `selectLauncherPlugins` has 7 unit tests, `monogram` 5, `resolveRootRoutePrefix` 4. `runtime` → 0.3.0; new `plugins/launcher` at 0.1.0. Earlier notes retained._

_Version 1.6 — June 2026. Changes from v1.5 (Task 0.4.04, Console settings + health + root plugin): `packages/db` gained a `platform_settings` table (composite PK `key`+`tenant_id`, PLT-15) and a `tenants` table, both bootstrapped and seeded by a new `getPlatformDb()` singleton that moved from `runtime/src/db.ts` into `packages/db/src/platform-db.ts` (the runtime now re-exports it). First run seeds the default tenant (`default`, name "Sovereign") and `root_plugin_id = fs.sovereign.launcher`. `sdk.platform.getConfig()` is now wired (PLT-06) — reads tenant name + `invite_only` from the platform DB and the platform version from the workspace-root `package.json`; the SDK took a `@sovereignfs/db` dependency for this. Console `/console/settings` exposes tenant name (CON-08), an invite-only toggle (CON-10), and a root-plugin selector (CON-11, eligible = installed + enabled + non-`adminOnly`, validated in `runtime/src/root-plugin.ts`). Invite-only is **dual-written**: the runtime PATCH writes the platform-DB copy and proxies to a new `apps/auth` `/api/admin/settings` route that writes the auth server's own `auth_settings` table — registration enforcement reads only the auth copy (a stored value overrides the `AUTH_INVITE_ONLY` env default; the create-hook resolves this per registration, no restart). `/console/health` (CON-09) renders runtime version, DB dialect + connection status + SQLite file size, auth-server reachability, and uptime from a new `runtime/api/admin/health` route; `apps/auth` gained an unauthenticated `/api/health` liveness probe. `runtime/app/(platform)/page.tsx` now redirects `/` to the configured root plugin's `routePrefix` (PLT-14), falling back to a placeholder while the Launcher is uninstalled. Verified live: settings GET/PATCH incl. validation rejections (admin-only/not-installed/empty-name), health report, invite-only dual-write reaching the auth server, admin-key gating. `packages/db` → 0.3.0, `packages/sdk` → 0.3.0, `apps/auth` → 0.3.0, `plugins/console` → 0.4.0, `runtime` → 0.2.0. Earlier notes retained._

_Version 1.5 — June 2026. Changes from v1.4 (Task 0.4.03, Console plugin management): the platform database is now actually opened by the runtime — `packages/db` gained a `plugin_status` table (plugin_id PK, tenant_id, enabled, updated_at; absence of a row = enabled; bootstrapped via CREATE TABLE IF NOT EXISTS in `runtime/src/db.ts` until drizzle-kit migrations land in 0.5.03). Console `/console/plugins` lists installed plugins with an enable/disable toggle. The middleware returns 404 for routes under a disabled plugin's `routePrefix`; because middleware runs on the Edge runtime (no SQLite access), it fetches disabled IDs from the Node-runtime route `/api/admin/plugins/disabled` — the same round-trip pattern as `/api/verify` — and fails open. Internal admin routes (`/api/admin/*`) are gated by `SOVEREIGN_ADMIN_KEY` and excluded from the middleware matcher; self-fetches to the runtime's own API use `http://localhost:3000` (the server always pins :3000), never the public URL. **New convention:** relative SQLite `file:` paths resolve against the workspace root (nearest `pnpm-workspace.yaml`), not the process cwd — all SQLite files land in the single root-level `data/` directory in native dev and Docker alike (this also fixed Docker persistence: DBs previously landed outside the `./data:/app/data` mount). `better-sqlite3` is a direct runtime dependency (pnpm strict node_modules requires it for webpack externalization) and is in `serverExternalPackages`. Both compose files now pass `SOVEREIGN_ADMIN_KEY` and `NEXT_PUBLIC_RUNTIME_URL` to the containers. `packages/db` → 0.2.0, `plugins/console` → 0.3.0. Earlier notes retained._

_Version 1.4 — June 2026. Changes from v1.3 (Task 0.4.02, Console user management): `sdk.auth` and `sdk.mailer` are now real implementations — `auth` reads `x-sovereign-user-*` headers injected by middleware via `next/headers`; `mailer` is a singleton `createMailer()` from `@sovereignfs/mailer`. The auth server gained three admin API routes (`GET /api/admin/users`, `PATCH /api/admin/users/[id]`, `POST /api/admin/invites`) gated by `SOVEREIGN_ADMIN_KEY` bearer token. The `user` model gained an `active` boolean field; `/api/verify` now gates inactive users and returns `name`, `image`, `expiresAt` for middleware header injection. The Console users page lists registered users and pending invites in a unified table — each invite row shows an "Invited" badge and expiry date, with no action controls. Multiple invites to the same email are deduplicated (most recent shown). Invite emails link to `runtime/app/register/route.ts` which redirects to the auth server's `/register` page. Platform `apps/auth` bumped to `0.2.0`; `packages/sdk` bumped to `0.2.0`; `plugins/console` bumped to `0.2.0`. Earlier notes retained._

_Version 1.3 — June 2026. Changes from v1.2 (Task 0.4.01, Console scaffold): the plugin route-composition model was settled. Plugins compose at their manifest `routePrefix` (not the source directory name) under a `shell`-selected route group — `shell: default` → `runtime/app/(platform)/(plugins)/<routePrefix>/`, inheriting the platform sidebar via App Router layout nesting (no rewrites); `shell: minimal` (a chrome-free group) is deferred and the generate script fails loudly on it. Composition uses **copies in every environment** (not symlinks in dev): Next's dev route watcher does not discover routes through symlinked directories, so a symlinked plugin route 404s under `next dev` even though `next build` follows symlinks. The runtime `dev` script is now `scripts/dev.ts` (compose once → generate `--watch` + `next dev`, torn down together), and the `resolve.symlinks: false` webpack workaround from 0.3.10 was removed. `adminOnly` routes are gated in the runtime middleware (403 for non-admins). The committed `runtime/generated/registry.ts` now tracks installed plugins (still Prettier/ESLint-excluded, regenerated deterministically). Platform version bumped to 0.4.0 (entering the v0.4 phase). These supersede the relevant 0.3.10/0.3.11 task-body details above (kept as the original plan of record). Earlier notes retained. Task breakdown covers platform only; plugin-specific breakdowns (Tasks, Splitify) live in their respective repositories._

_Version 1.2 — June 2026. Changes from v1.1: Tasks 0.3.10 (runtime scaffold) and 0.3.11 (generate script) were built together so the runtime dev pipeline works end to end. Deviations recorded: middleware lives at `runtime/middleware.ts` (Next requires it adjacent to `app/`); `SOVEREIGN_AUTH_SECRET` is deferred to v0.5 (the runtime verifies via `/api/verify`); `runtime/generated/registry.ts` is a committed empty placeholder while `runtime/app/plugins/` is gitignored. Earlier v1.1 changes (self-contained auth) retained. Task breakdown covers platform only. Plugin-specific task breakdowns (Tasks, Splitify) are maintained in their respective repositories._
