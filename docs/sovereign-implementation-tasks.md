# Sovereign — Implementation Task Breakdown

**Version:** 1.0\
**Date:** June 2026\
**Purpose:** Session-by-session task guide for Claude Code. Each task is a single PR. Reference `sovereign-proposal-plan-srs.md` for architectural decisions and rationale.

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

## Phase v0.3 — Foundation

### Task 0.3.01 — Monorepo scaffold

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

### Task 0.3.02 — Shared TypeScript config

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

### Task 0.3.03 — Code quality tooling

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

### Task 0.3.04 — `packages/db` — Drizzle client factory

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

### Task 0.3.05 — `packages/manifest` — schema and validation

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

### Task 0.3.06 — `packages/mailer` — SMTP abstraction

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

### Task 0.3.07 — `packages/ui` — Sovereign Design System scaffold

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

### Task 0.3.08 — `packages/sdk` — interface definitions

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

### Task 0.3.09 — `apps/auth` — better-auth server **[parallel with 0.3.10]**

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

### Task 0.3.10 — Runtime scaffold **[parallel with 0.3.09]**

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

### Task 0.3.11 — Generate script

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

### Task 0.3.12 — Docker Compose for local dev

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

## Phase v0.4 — Platform Plugins (Console, Launcher, Account)

### Task 0.4.01 — Console plugin scaffold

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

### Task 0.4.02 — Console: user management

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

### Task 0.4.03 — Console: plugin management

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

### Task 0.4.04 — Console: tenant settings, system health, and root plugin config

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

### Task 0.4.05 — Launcher plugin

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

### Task 0.4.06 — Account plugin

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

## Phase v0.5 — Polish and Self-Hosting

### Task 0.5.00 — `scripts/install-plugins.ts` — plugin install script

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

### Task 0.5.01 — PWA configuration

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

### Task 0.5.02 — Production Docker image

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

### Task 0.5.03 — Postgres validation

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

### Task 0.5.04 — `sv` CLI — core commands

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

### Task 0.5.05 — SDK implementations (db and platform)

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

### Task 0.5.05b — Local session verification in middleware (AUTH-05) **[split from 0.5.05; done]**

**Goal:** Replace the runtime middleware's per-request `/api/verify` round-trip to the auth server with **local** verification of the session, using the shared secret.

**Delivered:** The auth server enables better-auth's signed cookie cache (`session.cookieCache`, `maxAge` 300s), which sets a `session_data` cookie holding session+user HMAC-signed with `AUTH_SECRET`. The runtime middleware verifies it offline via `getCookieCache` (`better-auth/cookies`, Edge-safe) plus the pure `verifiedUserFromCache`/`resolveAuthSecret` helpers (`runtime/src/session-verify.ts`), using `SOVEREIGN_AUTH_SECRET ?? AUTH_SECRET` (local verify skipped when neither is set — no insecure default). On a cache miss it falls back to `/api/verify` (AUTH-06), which now re-emits better-auth's `Set-Cookie`, forwarded by the middleware so the cache self-refreshes. All prior behaviour is preserved (`/login` redirect, `x-sovereign-user-*` headers, `adminOnly` 403, disabled-plugin 404, root-plugin rewrite). Trade-off: role/active changes are stale for at most `maxAge`. Runtime services in all compose files now receive `AUTH_SECRET`.

**SRS reference:** AUTH-05

**Review checklist:**

- An authenticated request is verified with no network call to the auth server
- An invalid/expired/missing token redirects to `/login`
- Deactivated accounts are rejected (parity with the current `active === false` check)
- `SOVEREIGN_AUTH_SECRET` is required at startup (no insecure default)

---

### Task 0.5.06 — Documentation **[done]**

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

### Task 0.5.07 — CI pipeline

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

### Task 0.5.08 — Public `/api` namespace delegation **[parallel]**

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

### Task 0.5.09 — Overlay shell mode **[parallel]**

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

### Task 0.5.10 — Cross-plugin data sharing (consent-gated) **[future]**

**Goal:** Implement the consent-gated, pull-based, read-only cross-plugin data-sharing mechanism specified in RFC 0002 / SRS §3.13. The reserved `sdk.data` surface and the `data:provide`/`data:consume` permissions already exist as stubs; this task makes them real. Depends on `sdk.db` (Task 0.5.05).

**Deliverables:**

- Manifest: optional `data.provides[]` / `data.consumes[]` declarations (provider id, contract, version, scope) in `packages/manifest`, with validation + tests
- Platform DB: `consent_grants` (consumer, provider, contract, user, granted_at, revoked_at, scope) and `data_access_log` tables, both with `tenant_id`
- Runtime: provider-resolver registry, consent enforcement, tenant/user scoping, audit logging; routes `sdk.data.query` to the provider's registered resolver
- SDK: implement `sdk.data.query`/`provide` against the runtime (replace the stubs); raise `ConsentRequiredError` when no active grant exists
- UI: a consent-prompt dialog primitive in `packages/ui`; grant management in Account (own grants) and oversight in Console
- The mechanism is generic — no plugin is special-cased

**SRS reference:** RFC 0002, SRS §3.13, §5 (manifest `data.*`)

**Review checklist:**

- A consumer `query` without a grant raises `ConsentRequiredError` and surfaces a consent prompt; granting consent then returns the provider's data
- Reads are read-only, scoped to the requesting user + tenant, and recorded in the audit log
- Revoking a grant immediately blocks subsequent reads
- A consumer cannot reach a provider's raw tables — only its registered contract resolver
- Existing plugins (no `data.*` declared) are unaffected

---

### Task 1.0.01 — Registry contribution process

**Goal:** Define and document the process for submitting a community plugin to `registry/plugins.json`.

**Deliverables:**

- `registry/plugins.json` — initial structure with console as the only platform entry
- `registry/CONTRIBUTING.md` — submission requirements: manifest must be valid, repository must be public, must include LICENSE file, must target compatible platform version
- PR template for registry submissions
- `docs/plugin-development.md` updated with registry submission section

**SRS reference:** 2.7 Open Source Strategy, 3.8 Manifest System

**Review checklist:**

- `plugins.json` validates against manifest schema
- Submission requirements are clear and enforceable via manifest validation

---

### Task 1.0.02 — Stable SDK and semver commitment

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
