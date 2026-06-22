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

#### ✅ Task 0.3.1 — Monorepo scaffold

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

#### ✅ Task 0.3.2 — Shared TypeScript config

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

#### ✅ Task 0.3.3 — Code quality tooling

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

#### ✅ Task 0.3.4 — `packages/db` — Drizzle client factory

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

#### ✅ Task 0.3.5 — `packages/manifest` — schema and validation

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

#### ✅ Task 0.3.6 — `packages/mailer` — SMTP abstraction

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

#### ✅ Task 0.3.7 — `packages/ui` — Sovereign Design System scaffold

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

#### ✅ Task 0.3.8 — `packages/sdk` — interface definitions

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

#### ✅ Task 0.3.9 — `apps/auth` — better-auth server **[parallel with 0.3.10]**

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

#### ✅ Task 0.4.1 — Console plugin scaffold

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

#### ✅ Task 0.4.2 — Console: user management

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

#### ✅ Task 0.4.3 — Console: plugin management

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

#### ✅ Task 0.4.4 — Console: tenant settings, system health, and root plugin config

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

#### ✅ Task 0.4.5 — Launcher plugin

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

#### ✅ Task 0.4.6 — Account plugin

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

#### ✅ Task 0.5.0 — `scripts/install-plugins.ts` — plugin install script

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

#### ✅ Task 0.5.1 — PWA configuration

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

#### ✅ Task 0.5.2 — Production Docker image

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

#### ✅ Task 0.5.3 — Postgres validation

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

#### ✅ Task 0.5.4 — `sv` CLI — core commands

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

#### ✅ Task 0.5.5 — SDK implementations (db and platform)

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

#### ✅ Task 0.5.6 — Local session verification in middleware (AUTH-05) **[split from 0.5.05; done]**

**Goal:** Replace the runtime middleware's per-request `/api/verify` round-trip to the auth server with **local** verification of the session, using the shared secret.

**Delivered:** The auth server enables better-auth's signed cookie cache (`session.cookieCache`, `maxAge` 300s), which sets a `session_data` cookie holding session+user HMAC-signed with `AUTH_SECRET`. The runtime middleware verifies it offline via `getCookieCache` (`better-auth/cookies`, Edge-safe) plus the pure `verifiedUserFromCache`/`resolveAuthSecret` helpers (`runtime/src/session-verify.ts`), using `SOVEREIGN_AUTH_SECRET ?? AUTH_SECRET` (local verify skipped when neither is set — no insecure default). On a cache miss it falls back to `/api/verify` (AUTH-06), which now re-emits better-auth's `Set-Cookie`, forwarded by the middleware so the cache self-refreshes. All prior behaviour is preserved (`/login` redirect, `x-sovereign-user-*` headers, `adminOnly` 403, disabled-plugin 404, root-plugin rewrite). Trade-off: role/active changes are stale for at most `maxAge`. Runtime services in all compose files now receive `AUTH_SECRET`.

**SRS reference:** AUTH-05

**Review checklist:**

- An authenticated request is verified with no network call to the auth server
- An invalid/expired/missing token redirects to `/login`
- Deactivated accounts are rejected (parity with the current `active === false` check)
- `SOVEREIGN_AUTH_SECRET` is required at startup (no insecure default)

---

#### ✅ Task 0.5.7 — Documentation **[done]**

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

#### ✅ Task 0.5.8 — CI pipeline

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

#### ✅ Task 0.5.9 — Public `/api` namespace delegation **[parallel]**

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

#### ✅ Task 0.5.10 — Overlay shell mode **[parallel]**

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

#### ✅ Task 0.5.11 — Cross-plugin data sharing (consent-gated)

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

#### ✅ Task 0.5.12 — Logout / self sign-out

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

#### ✅ Task 0.5.13 — Activity log (RFC 0005)

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

#### ✅ Task 0.5.14 — Deployment & upgrade strategy (RFC 0006)

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

#### ✅ Task 0.5.15 — User data portability (RFC 0007)

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

#### ✅ Task 0.5.16 — Security hardening, Tier 0 + Tier 1 (RFC 0008)

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

#### ✅ Task 0.5.17 — Test organization (RFC 0010) **[parallel]**

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

#### ✅ Task 0.5.18 — Icon system (RFC 0011)

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

#### ✅ Task 0.5.19 — Registry contribution process

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

#### ✅ Task 0.5.20 — Stable SDK and semver commitment

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

#### ✅ Task 0.5.21 — SDK distribution & plugin isolation boundary (RFC 0023)

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

#### ✅ Task 0.5.22 — Plugin compatibility & versioning (RFC 0024)

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

#### ✅ Task 0.5.23 — Plugin-scoped environment variables (RFC 0018)

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

#### ✅ Task 0.5.24 — Test setup & seeding (RFC 0019)

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

#### ✅ Task 0.5.25 — Minimal shell mode (RFC 0014)

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

#### ✅ Task 0.5.26 — Mobile responsiveness & PWA hardening (RFC 0013)

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

#### ✅ Task 0.5.27 — Passkeys & TOTP MFA (RFC 0012)

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

#### ✅ Task 0.5.28 — Plugin starter template & example plugins (RFC 0017)

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

#### ✅ Task 0.5.29 — Accessibility audit & a11y contract (RFC 0025)

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

#### ✅ Task 0.5.30 — Non-Docker production deployment, Phase 1 — PM2 (RFC 0026)

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

#### ✅ Task 0.5.31 — Offline connectivity banner (PWA shell)

**Goal:** Surface connectivity status to users who are already in an authenticated session when their network drops. The hard-offline case (navigating to an uncached page) was already handled by the `/offline` fallback route; this task covers the soft-offline case — the network disappears while the user is on a page.

**Deliverables:**

- `@sovereignfs/ui` → **minor** (0.7.0): status colour tokens — `--sv-color-warning-surface/text/border` (amber) and `--sv-color-success-surface/text/border` (green); backed by new `--sv-amber-*` / `--sv-green-*` primitive swatches; documented in `docs/design-system.md` "Status colours" section
- `runtime` → **minor** (0.20.0): `OfflineBanner` client component (`runtime/app/(platform)/_components/OfflineBanner.tsx`) — initialises to `'online'` server-safely (avoids SSR hydration mismatch), then checks `navigator.onLine` in `useEffect`; listens to `window` `offline`/`online` events; amber "No internet connection" banner persists until reconnected; green "Back online" flash auto-dismisses after 3 s (coincides with `reloadOnOnline` SW reload); `position: fixed; top: 0; z-index: 200` (above the mobile header's `z-index: 101`); 200 ms slide-in animation; uses `alert-triangle` icon and `--sv-color-warning-*` / `--sv-color-success-*` tokens
- Wired into both `(platform)/layout.tsx` and `(minimal)/layout.tsx`; excluded from `/offline` (implicit there)
- `CLAUDE.md` gains the browser-API / `useState` hydration rule: never read `navigator`/`window`/`localStorage` in a `useState` initializer — initialise to a server-safe value and read in `useEffect`

**Dependencies:** Task 0.5.01 (PWA — `reloadOnOnline`), Task 0.5.17 (Icon — `alert-triangle`), Task 0.5.25 (mobile shell — z-index context)

**SRS reference:** SRS §3.11 (PWA)

**Review checklist:**

- DevTools → Network → Offline: amber banner slides in immediately; no hydration error in dev or production build
- DevTools → Network → Online: green "Back online" flash appears then dismisses after ~3 s; page reloads from SW
- Loading from SW cache while offline: amber banner present on mount (not deferred until a network event)
- Mobile (< 768 px): banner is above the sticky header; `z-index: 200` > header's `101`
- Dark mode: dark amber/green tokens render correctly

---

### Phase v0.6 — User roles & capabilities

#### ✅ Task 0.6.0 — Platform roles & capabilities (RFC 0021)

**Goal:** Grow the two-role model into a capability-based model with named role presets and a protected `platform:owner` — the SRS §3.4 "future version" with database-driven capability assignment.

**Deliverables:**

- Capabilities as the enforcement unit; built-in presets owner/admin/auditor/user (hardcoded defaults) + a DB-driven override layer
- `platform:owner`: the first user becomes owner (amends AUTH-08 + a migration for existing instances), sole holder of `role:assign`, protected (closes the missing last-admin guard)
- Centralize role/capability constants + a `hasCapability`/`requireCapability` resolver (replacing the ~6 binary `platform:admin` checks); carry effective capabilities in the signed session cache for the Edge gate; SDK helper; Console assignment UI (audited via RFC 0005)

**Dependencies:** Task 0.5.12 (audit), Task 0.5.05b (session cache)

**SRS reference:** RFC 0021, SRS §3.4

**Review checklist:**

- ✅ An auditor sees a read-only Console; the owner cannot be locked out; capability changes propagate within the cookie-cache window
- ✅ `adminOnly` maps to a capability gate
- ✅ All 355 tests pass; lint and typecheck clean

---

#### Task 0.6.1 — Plugin-declared capabilities (RFC 0022) ✅

**Goal:** Let plugins declare namespaced capabilities (`splitify:create-group`) enforced intra-plugin via the SDK.

**Deliverables:**

- ✅ Manifest `capabilities` field: optional record of `{ description?, defaultGrant?: 'all'|'none' }` (kebab-case keys), validated at build — `@sovereignfs/manifest` → 0.13.0
- ✅ `pluginCapabilityName(pluginId, capName)` helper in `@sovereignfs/manifest` for auto-namespacing to `<pluginId>:<capName>`
- ✅ Generate script emits `runtime/generated/plugin-capabilities.ts` with `PLUGIN_CAPABILITIES` and `ALL_GRANTED_PLUGIN_CAPS` (caps with `defaultGrant: 'all'`)
- ✅ Middleware appends `ALL_GRANTED_PLUGIN_CAPS` to the session capabilities array — `sdk.auth.hasCapability(session, '<pluginId>:<capName>')` works without a DB lookup for defaultGrant caps
- ✅ v1 storage model decided and documented: `defaultGrant: 'all'` = auto-granted by middleware; `'none'` = plugin manages grants via `sdk.db` + its own table
- ✅ `example-basic` plugin demonstrates the pattern: declares `view-advanced` with `defaultGrant: 'all'`, gates the UI section with `sdk.auth.hasCapability`
- ✅ `docs/plugin-development.md` — `capabilities` manifest field table row + full `### capabilities (RFC 0022)` section (storage model, code example, constraint note that enforcement is inside the plugin)

**Dependencies:** Task 0.6.01 (platform roles & capabilities — the `hasCapability` infrastructure this extends)

**SRS reference:** RFC 0022

**Review checklist:**

- ✅ A plugin gates a feature on its own capability via the SDK; the platform route gate does not enforce plugin capabilities
- ✅ 364 tests pass; lint, typecheck, and format clean

---

### Phase v0.7 — Notifications

#### ✅ Task 0.7.0 — Notification Center (RFC 0015)

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

#### ✅ Task 0.7.1 — Web Push notifications (RFC 0016)

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

#### ✅ Task 0.8.0 — Plugin monetization (RFC 0003)

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

#### ✅ Task 0.8.1 — Per-plugin database (RFC 0004)

**Goal:** Let a plugin opt into a dedicated database (`database: "isolated"`) rather than sharing the platform DB. RFC 0004 accepted.

**Deliverables:**

- SQLite: dedicated file per isolated plugin (`data/plugins/<pluginId>.db`) via `createClient`; per-plugin client registry (lazy, keyed by id); per-store migration-tracking table
- Postgres: schema-per-plugin (`CREATE SCHEMA`, `search_path`); provision on first use, `DROP SCHEMA … CASCADE` on uninstall; no extra pool (single connection)
- Migration runner routes each plugin's migrations to its resolved store (shared → platform DB; isolated → dedicated store)
- `sdk.db.getClient()` transparently returns the shared or dedicated client per the plugin's `database` setting
- Plugin lifecycle hooks: provision on first `getClient()`, drop on uninstall/purge (`sv plugin remove` with `--keep-data` opt-out)
- SRS §3.7/§4.6/§5 updated ("not implemented" → "opt-in isolated model")

**Dependencies:** Task 0.5.03 (Postgres), Task 0.5.05 (`sdk.db`)

**SRS reference:** RFC 0004

**Review checklist:**

- `database: "isolated"` plugin gets its own SQLite file; uninstall drops it entirely; `shared` plugin is unaffected; Postgres schema-per-plugin provisions and drops cleanly

---

#### ✅ Task 0.8.2 — E2E golden-path test suite (Playwright)

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

#### ✅ Task 0.8.3 — Production dev-mode & diagnostics (RFC 0020)

**Goal:** Validate features on a production instance against a mock database without touching real data, plus local no-telemetry diagnostics.

**Deliverables:**

- A request-scoped dev-mode switch (`AsyncLocalStorage`, never global) → the mock DB for the toggled request only; env-gated off by default, secret-authenticated, visibly flagged, audited (RFC 0005); the mock DB seeded by `sv seed`
- Resolve the auth-server mock-DB crux (or scope v1 to data-only mock)
- Structured logging (`LOG_LEVEL`, stdout only) + a richer admin `/api/admin/health` — reconciled with the no-telemetry guarantee

**Dependencies:** Task 0.5.23 (seed), Task 0.5.12 (audit)

**SRS reference:** RFC 0020

**Review checklist:**

- ✅ A dev-mode request reads only the mock DB; concurrent real requests are unaffected; nothing egresses

---

#### ✅ Task 0.8.4 — White-labeling, Phase 1 — Brand DB + shell injection (RFC 0027)

**Goal:** Let operators replace Sovereign's visual identity with their own brand. Phase 1 ships the data layer, CSS token namespace, runtime injection, and the Console branding form. Depends on the `tenant_branding` table and `BrandProvider` being in place before Phases 2 and 3.

**Deliverables:**

- `packages/db` → minor: `tenant_branding` table (dialect-aware DDL, bootstrapped by `bootstrapPlatformDb()` alongside the default-tenant seed); `getTenantBranding(pdb, tenantId)` (merges DB values over `BRAND_*` env defaults); `setTenantBranding(pdb, tenantId, partial)` (upsert; validates `brand_primary` as `/^#[0-9a-fA-F]{6}$/` before writing — raw user input must never reach a `<style>` block unchecked)
- `packages/ui` → minor: `--sv-brand-logo`, `--sv-brand-logo-dark`, `--sv-brand-favicon` tokens added to `semantic.css` (separate namespace from `--sv-color-*` — brand tokens hold URLs, not colours; they are set once by the operator and do not change with dark mode or user prefs); documented in `docs/design-system.md`
- `runtime` → minor: `BrandProvider` server component (`runtime/src/brand-provider.tsx`) — reads `tenant_branding`, merges env defaults, renders a `<style>` block setting `--sv-brand-*` tokens and (if `brandPrimary` set) `--sv-color-accent` / `--sv-color-accent-hover` (HSL lightness delta, `ACCENT_HOVER_LIGHTNESS_DELTA = 8`, clamped to stay in range); passes `brandName` as a React prop to children; called from `(platform)/layout.tsx`
- `runtime` (continued): `GET /api/brand/logo[?dark=1]` and `GET /api/brand/favicon` routes serving uploaded files from `data/brand/` (MIME type validated, 2 MB cap); `POST /api/brand/logo` / `POST /api/brand/favicon` upload routes (admin-gated); all three excluded from the middleware session gate (must load on the login page)
- `runtime` (continued): `GET /api/admin/tenant-branding` route — returns merged brand config (DB + env defaults) for the auth server proxy in Phase 2
- `@sovereignfs/sdk` → minor: `sdk.platform.getConfig()` gains `brandName` (falls back to `tenantName`) and `brandPrimaryColor?` (validated hex or undefined), documented in `docs/plugin-development.md`
- `plugins/console` → minor: new **Branding** section under `/console/settings/branding` — brand name input, logo upload (light + dark) or external URL, primary colour picker (validated hex client + server), favicon upload, email sender name, email logo URL; live preview panel (client-side CSS variable swap); PATCH writes to `tenant_branding`
- New `BRAND_*` env vars added to `.env.example` and `docs/self-hosting.md`; `docs/plugin-development.md` documents `--sv-brand-*` token usage and the `getConfig()` branding fields

**Dependencies:** Task 0.5.03 (Postgres), Task 0.5.05 (`sdk.platform`), Task 0.5.15 (CSP — `/api/brand/*` must be in the middleware exclusion list alongside `/api/health` and PWA assets)

**SRS reference:** RFC 0027, SRS §3.18

**Review checklist:**

- Brand name set in Console renders in the sidebar header and login page instead of "Sovereign"
- Uploading a logo serves it from `/api/brand/logo` on the login page (pre-auth, session gate excluded)
- `brand_primary` write rejects any non-hex value; valid hex sets `--sv-color-accent` via `BrandProvider`
- `sdk.platform.getConfig()` returns `brandName` and `brandPrimaryColor` (or undefined when unset)
- `pnpm lint`, `pnpm format:check`, `pnpm typecheck`, and docs-parity test pass

---

#### ✅ Task 0.8.5 — Storybook for the design system and app shell

**Goal:** Give component authors, plugin developers, and designers a live, isolated environment to develop and inspect every `@sovereignfs/ui` component and its token context. Storybook 8 is the choice — it has native CSS Modules support (via `@storybook/nextjs`), the best a11y addon ecosystem, and wide team familiarity. No RFC is warranted: this is developer tooling with no runtime surfaces, no SDK changes, and no architectural trade-offs that need RFC-level documentation. The decision rationale is recorded in the SRS decision log.

**Scope:**

Phase 1 (this task) targets `packages/ui` exclusively. The `runtime` App Router shell uses React Server Components heavily — Storybook's RSC support is immature as of mid-2026; RSC stories are a follow-on tracked under "Optional extensions" below.

**Deliverables:**

- **Storybook installation (`packages/ui`):**
  - `@storybook/nextjs` (Vite builder) + `storybook` CLI as devDependencies in `packages/ui/package.json`; versions pinned in the pnpm catalog (new `"storybook"` catalog entry, referenced as `"catalog:"`)
  - `.storybook/main.ts` — framework: `@storybook/nextjs`, addons (see below), `stories` glob targeting `src/**/*.stories.tsx`
  - `.storybook/preview.ts` — global decorator importing the full token stack (`primitives.css`, `semantic.css`); `data-theme` parameter wired so the themes addon toggles dark mode correctly
  - `packages/ui/package.json` gains `"storybook": "storybook dev -p 6006"` and `"build-storybook": "storybook build --output-dir storybook-static"` scripts
  - `packages/ui/.storybook/` added to `.prettierignore` (generated config files should not be linted)

- **Addons:**
  - `@storybook/addon-a11y` — accessibility panel; every story must pass WCAG 2.1 AA checks; a11y failures treated as errors in CI
  - `@storybook/addon-viewport` — responsive preview (mobile 375px, tablet 768px, desktop 1280px presets matching the shell breakpoints)
  - `@storybook/addon-themes` — single decorator toggles `[data-theme="dark"]` on the canvas root; eliminates the need for per-story dark variants
  - `@storybook/addon-docs` — auto-generates prop tables from TypeScript types; used for `ComponentName.stories.tsx` `meta.parameters.docs` entries

- **Token Gallery story (`src/stories/TokenGallery.stories.tsx`):**
  - One story per token tier — Colour (semantic, both themes side-by-side), Space scale, Typography scale, Radius scale, Shadow scale, Icon sizes
  - Reads CSS custom properties at render time via `getComputedStyle(document.documentElement)` — always reflects the actual loaded CSS, not a hardcoded snapshot
  - Dark mode toggle shows both themes on the same canvas for comparison

- **Component stories (one `*.stories.tsx` per component):**
  - `Button` — all `variant` × `size` combinations; loading state; disabled; icon-only
  - `Card` — default, with header/footer slots, interactive (clickable)
  - `Input` — text/email/password types; error state; disabled; with label
  - `Badge` — all variants
  - `Dialog` — `sm`/`md`/`lg` sizes; `open`/`closed`; trigger interaction (Storybook `play` function using `@storybook/test`)
  - `Drawer` — mobile breakpoint (viewport addon at 375px); open/closed; with list items
  - `Icon` — full icon grid (all 26 names from `IconName`); `sm`/`md`/`lg` sizes; `aria-label` vs `aria-hidden` variants

- **Monorepo integration:**
  - `turbo.json`: add `"build-storybook"` to the `pipeline` with `dependsOn: ["^build"]` and `outputs: ["storybook-static/**"]`; Storybook dev (`pnpm storybook`) is not a Turborepo task — it runs ad-hoc
  - Root `package.json` gains `"storybook": "pnpm --filter @sovereignfs/ui storybook"` and `"build-storybook": "pnpm --filter @sovereignfs/ui build-storybook"` scripts for convenience
  - `storybook-static/` added to root `.gitignore`

- **CI (`storybook-build` job in `.github/workflows/ci.yml`):**
  - Runs `pnpm build-storybook` — catches stories that fail to compile or reference missing tokens
  - Fails on a11y errors via `--test` flag (Storybook 8 CLI test mode)
  - Runs on the same draft-PR exclusion logic as the existing jobs
  - Uploads `storybook-static/` as a CI artifact (7-day retention) for PR preview inspection without deploying a Storybook hosting service

- **Documentation:**
  - `docs/design-system.md` gains a "Component stories (Storybook)" section: how to run (`pnpm storybook`), what the Token Gallery shows, how to add a story for a new component, the a11y policy
  - `docs/plugin-development.md` notes that `@sovereignfs/ui` ships with Storybook stories developers can run locally to explore the component API

**Optional extensions (follow-on tasks, not in scope here):**

- **Visual regression testing (Chromatic):** requires a paid Chromatic account; added as a follow-on when the team is ready. The `build-storybook` CI artifact enables manual visual comparison in the interim.
- **`runtime` client-component stories:** once Storybook's RSC story support matures, extend to `runtime/app/_components/` client components (avatar popover, `ActivePluginTitle`, `MobileNav`, etc.). Tracked as a future task.
- **Plugin developer guide stories:** example stories shipped in `plugins/fs.sovereign.example-basic/` demonstrating how a plugin consumes `@sovereignfs/ui` components in Storybook.

**Dependencies:** Task 0.3.07 (`packages/ui` scaffold must exist — ✅ already merged), Task 0.5.17 (Icon system — all `IconName` values needed for the Icon story — ✅ already merged)

**Version impact:** `packages/ui` → **minor** (adds a new developer-facing capability; no breaking changes to the published component API)

**SRS reference:** SRS §3.19 (design system tooling), NFR-10 (documentation completeness)

**Review checklist:**

- `pnpm storybook` starts the dev server at `:6006` with all stories rendering; Token Gallery correctly reads both light and dark theme token values
- `pnpm build-storybook` exits 0; a11y check passes on all stories
- Dialog and Drawer stories: the `play` function opens and dismisses the component; keyboard navigation works (Tab, Esc); focus trap confirmed in the a11y panel
- Icon story renders all 26 icons with correct sizes; `aria-hidden` icons have no accessible name; `aria-label` icons are announced correctly
- Dark mode toggle in the Storybook toolbar applies `[data-theme="dark"]` to the canvas root and all semantic colour tokens update immediately
- CI `storybook-build` job is green; artifact is uploaded

---

### Phase v0.9 — pre-release hardening

Tasks that ship before the public `v1.0.0` release. These tasks were originally
scoped as post-v1 but pulled forward into the pre-release cycle as the platform
matured ahead of schedule.

#### Task 0.9.0 — Instance identity rename (RFC 0032)

**Goal:** Rename every `brand/Brand` identifier introduced in Task 1.0.03 (RFC 0027
Phase 1) to `instance/Instance` across the full platform. Pure rename — no new
functionality. Ships first so Task 0.9.1 (email templates) and all subsequent work
adopt the correct naming from day one. No production users means zero migration burden.

**Deliverables:**

- `.env.example`, `docker-compose.yml`, `docker-compose.prod.yml`: `BRAND_*` →
  `INSTANCE_*` (seven env vars).
- `packages/ui` → minor (`0.10.0` → `0.11.0`): `--sv-brand-logo` / `--sv-brand-logo-dark` /
  `--sv-brand-favicon` renamed to `--sv-instance-logo` / `--sv-instance-logo-dark` /
  `--sv-instance-favicon` in `tokens/semantic.css`.
- `packages/sdk` → minor (`1.10.0` → `1.11.0`): `PlatformConfig.brandName` →
  `instanceName`; `brandPrimaryColor?` → `instancePrimaryColor?`.
- `packages/db` → minor: `tenant_branding` table renamed to `instance_config` via
  drizzle-kit migration (`ALTER TABLE … RENAME TO`); `TenantBrandingValue` →
  `InstanceConfig`; `getTenantBranding()` → `getInstanceConfig()`; `setTenantBranding()`
  → `setInstanceConfig()`; bootstrap DDL parity test updated.
- `runtime` → minor: `brand-provider.tsx` → `instance-provider.tsx` (`BrandProvider` →
  `InstanceProvider`, `BrandContext` → `InstanceContext`); `runtime/app/api/brand/` →
  `runtime/app/api/instance/` (all seven logo/favicon routes); `RESERVED_API_SEGMENTS`
  replaces `'brand'` with `'instance'`; dir-parity test passes.
- `plugins/console` → patch: Settings "Branding" → "Instance identity"; field labels
  updated; `PATCH /api/admin/tenant-branding` → `PATCH /api/admin/instance-config`.
- `apps/auth` → patch: env var reads updated.
- `docs/upgrade.md`: v0.28 → v0.29 migration notes (env var rename table, CSS token
  rename note, SDK field rename note).
- All doc references updated: `docs/self-hosting.md`, `docs/design-system.md`,
  `docs/plugin-development.md`, `docs/rfcs/0027-white-labeling.md`.

**Root version bump:** `0.9.3` → `0.9.4`

**Dependencies:** Task 1.0.03 (Phase 1 — renames what Phase 1 introduced)

**SRS reference:** RFC 0032

**Review checklist:**

- `grep -r "BRAND_\|--sv-brand\|brandName\|brandPrimary\|BrandProvider\|getTenantBranding\|tenant_branding\|/api/brand/" packages/ runtime/ apps/ plugins/ .env.example` → zero matches
- RESERVED_API_SEGMENTS contains `'instance'` and not `'brand'`; dir-parity test passes
- Console Settings → Instance identity section renders; logo/favicon upload/remove still work
- `sdk.platform.getConfig()` returns `instanceName`; existing Console usage updated
- DB migration runs on both SQLite and Postgres; data preserved
- `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test` all pass

---

#### Task 0.9.1 — Email template system + White-labeling Phase 2 — Email + auth login page (RFC 0031 + RFC 0027)

**Goal:** Introduce the email template infrastructure (RFC 0031) — React Email–based
templates with branding injection, standalone locale support, and operator copy/subject
overrides — then use it to deliver RFC 0027 Phase 2: branded emails and the auth server's
branded login/registration page. RFC 0031 is the prerequisite; both ship in this task.

**Deliverables:**

- `packages/mailer` → minor (RFC 0031): `@react-email/components` + `@react-email/render`
  added; new `templates/` subtree with `EmailLayout`, `EmailHeader`, `EmailFooter`
  components, `locales/{en,de,si,ta}.json`, `PasswordResetEmail.tsx`, `InviteEmail.tsx`;
  exported `renderPasswordResetEmail()`, `renderInviteEmail()`, `renderSubject()`,
  `EmailBranding` and `EmailLocale` types; `email:dev` preview script on port 3003.
- `packages/db` → minor (RFC 0031): `getEmailCopy()` / `setEmailCopy()` helpers using
  `platform_settings` key pattern `email_copy_<templateId>_<locale>_<field>`.
- `packages/sdk` → minor (RFC 0031): `PlatformConfig` gains `emailFromName?`, `emailLogo?`,
  `instanceUrl`; `sdk.platform.getConfig()` returns these fields.
- `runtime` → minor (RFC 0031 + RFC 0027 Phase 2):
  - New `GET /api/admin/instance-config` route (admin-key-gated; returns merged
    `InstanceConfig`; used by `apps/auth` and Console invite action).
  - New Console → Settings → **Email Templates** section: template selector, locale
    selector, subject + body copy override fields, live preview panel (`<iframe>`), and
    test-send button (`POST /api/admin/email-templates/test`).
  - API routes: `GET/PATCH /api/admin/email-templates`, `GET /api/admin/email-templates/preview`.
  - (RFC 0027 Phase 2) Auth login/registration page: `apps/auth` root layout fetches
    `/api/admin/instance-config` (60 s in-process cache; graceful fallback to Sovereign
    defaults); `InstanceProvider` duplicated into `apps/auth/src/instance-provider.tsx`
    (same pattern as `security.ts` duplication).
- `apps/auth` → minor (RFC 0031 + RFC 0027 Phase 2):
  - `sendResetPassword` hook calls `renderPasswordResetEmail()` + `renderSubject()` with
    fetched instance config and resolved locale.
  - `apps/auth/src/email-branding.ts` — 60 s cached `getBranding()` fetching from
    `SOVEREIGN_RUNTIME_INTERNAL_URL` (new env var, default `http://localhost:3000`).
- `plugins/console` → minor:
  - Invite action calls `renderInviteEmail()` + `renderSubject()` with instance identity
    from `sdk.platform.getConfig()` and locale from request headers.
  - Email Templates Console section (see runtime deliverable above).
- New env var: `SOVEREIGN_RUNTIME_INTERNAL_URL` — added to `.env.example` and
  `docs/self-hosting.md`; Docker compose files set this to the internal service name.
- Docs: `docs/plugin-development.md` — note that `sdk.mailer.send()` accepts pre-rendered
  HTML; React Email is available for plugin authors. `docs/self-hosting.md` — email
  template customisation section.

**Dependencies:** Task 0.9.0 (RFC 0032 rename must be complete — this task uses
`InstanceConfig`, `INSTANCE_*` env vars, and `--sv-instance-*` tokens throughout);
Task 1.0.03 (Phase 1 — `instance_config` table must exist)

**SRS reference:** RFC 0031, RFC 0027 Phase 2, SRS §3.18

**Review checklist:**

- `pnpm email:dev` starts preview server on `:3003`; all templates render with sample instance identity
- Password reset email arrives with instance logo, instance name in subject, CTA button in `instancePrimaryColor`
- Images blocked in email client → instance name appears as `alt` text; email remains readable
- Console → Settings → Email Templates: override invite subject → test-send → arrives with custom subject
- Locale set to Tamil → invite email body renders in Tamil script
- Auth server offline → password reset sends with graceful Sovereign defaults
- A configured instance shows the operator's logo and name on the login/register page
- Auth server login page falls back to Sovereign defaults if the runtime is unreachable

---

#### Task 0.9.2 — White-labeling, Phase 3 — Dynamic PWA manifest + favicon route (RFC 0027)

**Goal:** Extend instance identity to the PWA manifest and favicon so the installed PWA shows the operator's app name and icons. Depends on Phase 1 (instance config DB and serving routes) and the rename in Task 0.9.0.

**Deliverables:**

- `runtime` → minor: `GET /manifest.webmanifest` route — when instance identity is configured reads `instance_config` and returns a dynamic manifest with the operator's `name`, `short_name`, and icon URLs; when unconfigured the static `runtime/public/manifest.json` continues to be served. Route is excluded from the middleware session gate (required for PWA installability)
- `runtime` (continued): `GET /favicon.ico` route — returns the instance's configured favicon when set, falling back to `runtime/public/favicon.ico`; `runtime/app/layout.tsx` `<head>` metadata updated to point to the dynamic route unconditionally so the fallback is transparent
- Document in `docs/self-hosting.md`: when identity changes, cached service-worker users see the old name/icons until the SW updates (known limitation, acceptable for v1)

**Dependencies:** Task 0.9.0 (RFC 0032 rename — `instance_config` table name); Task 1.0.03 (Phase 1 — instance logo served from `/api/instance/logo`)

**SRS reference:** RFC 0027 Phase 3, SRS §3.18

**Review checklist:**

- `GET /manifest.webmanifest` returns the operator's instance name and icon URLs when configured; returns the static Sovereign manifest when unconfigured
- `GET /favicon.ico` returns the operator's favicon when configured; falls back to the committed favicon
- PWA installation on a configured instance shows the operator's name and icons in the OS launcher

---

#### Task 0.9.3 — Non-Docker production deployment, Phase 2 — systemd (RFC 0026)

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

#### Task 0.9.4 — Operator fork model & upstream sync (RFC 0028)

**Goal:** Publish the operator fork model documentation and add the "Maintaining a fork" section to `docs/self-hosting.md`. This is a documentation-only task — no code, no version bumps.

**Deliverables:**

- `docs/rfcs/0028-operator-fork-model.md` — the RFC (already drafted)
- `docs/self-hosting.md` — "Maintaining a fork" section: two-track summary (config-only vs fork-and-track), `operator/` directory convention, upstream sync command sequence, isolation principle, asset management guidance
- `docs/sovereign-proposal-plan-srs.md` — §2.7 pointer + decision-log row (already added in RFC documentation pass)
- `docs/rfcs/README.md` — RFC 0028 row updated from Draft to Accepted

**Optional follow-on (separate task):** `sv fork check` CLI command — reads `operator/UPSTREAM`, compares against the latest upstream tag, and warns if the fork is behind.

**Dependencies:** None hard. RFC 0027 (Task 1.0.03) should ship first so the "Post-RFC 0027 asset management" recommendation in the RFC is actionable.

**SRS reference:** RFC 0028, SRS §2.7

**Review checklist:**

- `docs/self-hosting.md` "Maintaining a fork" section is self-contained; a reader can follow it from fork setup through first upstream sync without consulting the RFC
- The two-track model, isolation principle, AGPL table, and rebase workflow are consistent between the RFC and the self-hosting doc
- RFC 0028 status in `docs/rfcs/README.md` updated to Accepted

#### Task 0.9.5 — User data deletion (RFC 0033)

**Goal:** Let users permanently delete all their data from Account → Data, and give
admins a "Delete" action in Console → Users. The platform cascades the deletion across
all platform tables and delegates to installed plugins via a new SDK hook. Companion to
RFC 0007 (data portability): export first, then delete.

**Deliverables:**

- `packages/sdk` → minor (`1.12.0`): `sdk.portability.provideDelete(handler)` — stable
  surface. Handler receives `{ userId, tenantId, db }` and returns
  `{ deleted: number; errors?: string[] }`.
- `packages/db` → patch: `deleteUserData()` helper (deletes all platform-table rows for
  a user in dependency order); `logDeletion()` helper for the admin activity entry.
- `runtime` → minor:
  - `runtime/src/user-deletion.ts` — `deleteUser(userId, tenantId)` cascade function:
    collect plugin handlers, run in parallel (30 s timeout per handler), delete platform
    rows (`consent_grants` → `data_access_log` → `activity_log` → `notifications` →
    `notification_prefs` → `push_subscriptions` → `entitlements` → `account_prefs` →
    avatar file on disk), then call better-auth admin API to remove the user record.
    Returns `DeletionSummary`.
  - `DELETE /api/account` — session-gated, requires password re-verification
    (server-to-server call to better-auth), 409 if sole `platform:owner`, clears
    session cookies on success, returns `{ deletedAt }`.
  - `DELETE /api/admin/users/[id]?deleteData=true` — extends the existing route,
    requires `user:manage` capability, rejects `platform:owner` targets.
  - Login page: `?accountDeleted=1` notice (same pattern as `?signedout=1`).
- `plugins/account` → minor: **Account → Data** tab gains a "Delete your account"
  section below Export/Import: danger-button opens a `<dialog>` with password
  confirmation field; calls `DELETE /api/account`; redirects on success.
- `plugins/console` → patch: Users page gains a **Delete…** action per row (disabled
  for `platform:owner` rows); opens native `<dialog>` with named confirmation; calls
  `DELETE /api/admin/users/[id]?deleteData=true`.
- `docs/plugin-development.md` — `sdk.portability.provideDelete` documented alongside
  `provideExport`/`provideImport`; note that plugins without a handler leave orphaned
  rows (operator responsibility).
- `docs/upgrade.md` — v0.x → v0.9.5 notes (new `DELETE /api/account` route; new SDK
  method; plugin authors should register a handler).

**Root version bump:** `0.9.8` → `0.9.9`

**Dependencies:** Task 0.5.14 (RFC 0007 — `sdk.portability` interface to extend);
Task 0.6.01 (capabilities — `user:manage` gate on the admin route)

**SRS reference:** RFC 0033

**Review checklist:**

- `DELETE /api/account` with wrong password → 403; with correct password → 200,
  cookies cleared, `?accountDeleted=1` notice on login page
- Sole `platform:owner` attempting self-delete → 409; Console "Delete" disabled for owner rows
- Plugin with `provideDelete` handler: rows removed; handler result in `DeletionSummary`
- Plugin without handler: cascade proceeds; summary notes the missing handler (no crash)
- `account.self_deleted` / `account.deleted` activity log entry present after deletion
- Avatar file removed from `data/avatars/`; all platform-table rows for user absent
- `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test`

---

#### Task 0.9.6 — Notification Center: pluggable pub/sub transport (RFC 0034)

**Goal:** Replace the Notification Center's DB-polling SSE backend with a real
event-driven pub/sub broker. Polling stays the default (`NOTIFICATION_TRANSPORT=polling`);
operators opt in to instant push delivery via `sse` (in-process EventEmitter, no new
infra) or `redis` (Redis Pub/Sub, for multi-process/clustered deployments). Resolves
RFC 0015's deferred transport decision.

**Deliverables:**

- `runtime/src/notification-broker.ts` — `NotificationBroker` interface + singleton
  `initBroker()` / `getBroker()` accessors.
- `runtime/src/brokers/in-process.ts` — `InProcessBroker` (Node.js `EventEmitter`,
  `setMaxListeners(0)`, no deps).
- `runtime/src/brokers/redis.ts` — `RedisBroker` (`ioredis` PUBLISH/SUBSCRIBE, two
  dedicated connections); loaded via dynamic `import()` so `ioredis` is truly optional.
- `ioredis` added as `optionalDependencies` in `runtime/package.json`.
- `runtime/instrumentation.ts` — `register()` reads `NOTIFICATION_TRANSPORT` and
  `REDIS_URL`, initialises broker, calls `broker.close()` on `SIGTERM`.
- `runtime/src/sdk-host.ts` — `notifications.send()` calls `broker.publish()` after DB
  write (no-op when broker is null / polling mode).
- `runtime/app/api/account/notifications/stream/route.ts` — rewired to subscribe to the
  broker; 503 when `NOTIFICATION_TRANSPORT=polling`; 25 s heartbeat comment line to beat
  proxy idle timeouts; `X-Accel-Buffering: no` header.
- `runtime/app/api/account/notifications/route.ts` — response gains `transport:
'polling' | 'sse'` field (Node.js runtime reads env at request time).
- `plugins/account` — bell component reads `transport` from initial fetch: in `sse`
  mode, connects `EventSource` instead of polling; three-error fallback to polling.
- `GET /api/admin/health` — `notifications: { transport, brokerConnected }` section.
- New env vars: `NOTIFICATION_TRANSPORT` (default `polling`), `REDIS_URL`, optional
  `NOTIFICATION_HEARTBEAT_INTERVAL` (default `25000`) — added to `.env.example` and
  `docs/self-hosting.md`.
- `docker-compose.prod.yml` — commented-out `redis` service block; commented
  `NOTIFICATION_TRANSPORT=redis` + `REDIS_URL` lines for operators to activate.
- `docs/self-hosting.md` — new "Notification transport" section (proxy config table for
  nginx / Caddy / Traefik / AWS ALB; SSE vs polling tradeoffs; Redis setup steps).
- Deprecates: RFC 0015's planned `notification_transport` key in `platform_settings`
  (never written; replaced by the env var).

**Root version bump:** `0.9.9` → `0.9.10`

**Dependencies:** Task 0.7.01 (Notification Center — `sdk.notifications.send()` and the
existing SSE route shape this task rewires)

**SRS reference:** RFC 0034, RFC 0015 (open question 2 resolved)

**Review checklist:**

- `NOTIFICATION_TRANSPORT=polling` (default): SSE endpoint returns 503; bell polls at
  user's configured interval; behaviour identical to pre-RFC baseline
- `NOTIFICATION_TRANSPORT=sse`: `EventSource` connection opens; `sdk.notifications.send()`
  delivers notification to bell in < 1 s (no poll wait); multiple tabs all receive
- `NOTIFICATION_TRANSPORT=redis` + `REDIS_URL` set: cross-process delivery verified
  (send from process A, client on process B receives)
- `NOTIFICATION_TRANSPORT=redis`, Redis down: notification written to DB; SSE push
  degrades gracefully; health reports `brokerConnected: false`
- `GET /api/admin/health` returns correct `notifications.transport` and `brokerConnected`
- `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test`

---

### Phase v1.0+ — Post-release / future

> Work scheduled **after** the v1.0 public release. Items here are post-v1 regardless of when their reserved-stub groundwork lands.

#### Task 1.0.1 — Encryption at rest & field-level, Tier 2–4 (RFC 0008) **[post-v1]**

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

#### Task 1.0.2 — Phase 2 payment integration (RFC 0003 Phase 2) **[post-v1]**

**Goal:** Automate the payment → entitlement flow that Phase 1 (Task 0.8.01) leaves
manual. Three sub-tracks, independently deliverable:

**Sub-track A — Bank transfer + admin confirmation**

- New `payment_requests` table (both dialects; drizzle-kit migration).
- Console **Pending Payments** sub-section under Entitlements — lists pending requests with subscriber, plugin, tier, amount, and requested-at.
- Admin **Confirm** / **Reject** actions: confirm auto-creates an entitlement row (`source: 'bank_transfer'`); reject optionally sends a notification email.
- `sdk.billing.requestSubscription({ pluginId, tierId })` (currently `NotImplementedError` stub → implemented) creates the request row and returns configured bank details.
- Console Settings gains a `bank_transfer_details` field (IBAN / instructions).

**Sub-track B — Stripe webhook**

- No platform adapter code — integration lives in the plugin.
- `sdk.billing.grantEntitlement({ userId, pluginId, tierId, expiresAt })` (new) lets a plugin's webhook handler write an entitlement server-side without a signed token.
- Example Stripe webhook handler in `plugins/example-monetized/` or docs.

**Sub-track C — PayPal webhook**

- Same pattern as Stripe; same `sdk.billing.grantEntitlement()` seam.

**Dependencies:** Task 0.8.01 (Phase 1 must be in production), Task 1.0.01 (encryption at rest — payment request records contain PII)

**SRS reference:** RFC 0003 Phase 2

**Review checklist:**

- Bank transfer: user submits request → Console "Pending Payments" shows it → admin confirms → user's next request passes the paywall without re-importing a token
- Bank transfer: admin rejects → user receives notification email (when SMTP configured)
- Stripe: plugin webhook verifies signature, calls `sdk.billing.grantEntitlement()`, user gains access
- `sdk.billing.requestSubscription()` throws `EntitlementRequiredError` when called from a non-plugin context

---

#### Task 1.0.3 — Internationalization, Phase 1 — Infrastructure (RFC 0029) **[post-v1]**

**Goal:** Wire the i18n infrastructure end-to-end: manifest field, platform config, transparent locale cookie, middleware injection, next-intl integration, generate script message merging, `sdk.i18n` surface, DB migration, Console Languages section, and Account Language preference.

**Deliverables:**

- `packages/manifest`: optional `i18n.supportedLocales` field in schema; validation (English required; missing locale file → build fail); `manifestFieldNames` update for docs-parity test. Minor bump.
- `packages/db`: new nullable `locale TEXT` column on `account_prefs` + drizzle-kit migration for both dialects; `PlatformConfig` type gains `enabledLanguages`/`defaultLanguage`. Minor bump.
- `packages/sdk`: new experimental `sdk.i18n` module (`getLocale`, `getEnabledLanguages`, `getDefaultLanguage`); `SdkHost` `i18n` key; marked experimental in `docs/sdk-stability.md`. Minor bump.
- `scripts/generate-registry.ts`: `composeMessages()` step merges plugin `messages/<locale>.json` into `runtime/generated/messages/<locale>.ts` (namespaced by plugin ID + `platform` key for shell strings); generated files gitignored.
- `runtime`: new `GET /api/admin/i18n` route (admin-key-authed); `RESERVED_API_SEGMENTS` gains `'i18n'`; middleware locale resolution (`sv-locale` cookie → enabled_languages → default_language → `'en'`) + `x-sovereign-user-locale` header injection; `runtime/i18n/request.ts`; `next.config.ts` wrapped with `createNextIntlPlugin`; root layout `NextIntlClientProvider` + dynamic `lang={locale}` attribute. Minor bump.
- `plugins/console`: Languages section in Settings (enable/disable checkboxes, default language dropdown, plugin coverage table). Minor bump.
- `plugins/account`: Language preference in Preferences tab (dropdown of enabled languages; save writes `account_prefs.locale` + clears `sv-locale` cookie). Minor bump.
- `docs/plugin-development.md`: "Internationalization" section (manifest field, `messages/` convention, `sdk.i18n`, next-intl usage pattern).
- `docs/self-hosting.md`: "Language config" section (enabled languages, default language).
- New dep: `next-intl` in `runtime/package.json`.

**Dependencies:** None (independent post-v1 task)

**SRS reference:** RFC 0029

**Review checklist:**

- `pnpm generate` emits `runtime/generated/messages/en.ts` with correct namespace structure
- Plugin with no `i18n` field is unaffected; generates cleanly with zero i18n output
- Middleware injects `x-sovereign-user-locale` on all requests; verify with `curl -H "Cookie: sv-locale=de"` and check response header
- Console Settings shows Languages section; English pre-checked and disabled
- Account Preferences shows Language dropdown; selecting a language persists and `sv-locale` cookie is set
- `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test` all pass
- Docs-parity test passes: `i18n` manifest field and `sdk.i18n` surface documented

---

#### Task 1.0.4 — Internationalization, Phase 2 — Platform shell adoption (RFC 0029) **[post-v1]**

**Goal:** Extract all platform chrome strings into `messages/en.json` files and ship four built-in translations — English (`en`), German (`de`), Sinhala (`si`), Tamil (`ta`) — for the runtime shell, Console, Account, and auth app. Sinhala and Tamil use non-Latin scripts, validating the full stack beyond ASCII.

**Deliverables:**

- `runtime/messages/{en,de,si,ta}.json`: all platform chrome strings (sidebar nav, offline banner, error messages, health page labels, etc.)
- `plugins/console/messages/{en,de,si,ta}.json`: all Console UI strings; `manifest.json` gains `i18n: { supportedLocales: ["en","de","si","ta"] }`
- `plugins/account/messages/{en,de,si,ta}.json`: all Account UI strings; same manifest update
- `apps/auth/messages/{en,de,si,ta}.json`: login, register, 2FA, password-reset strings; `apps/auth/i18n/request.ts`; `apps/auth/next.config.ts` wrapped with `createNextIntlPlugin`. Minor bump.
- RFC 0017 plugin starter template (`packages/create-plugin`): scaffold includes `messages/en.json` stub + next-intl usage example.
- E2E test: language switch to German (Latin) and Tamil (non-Latin) → Console/Account strings render in the selected language.

**Dependencies:** Task 1.0.3

**SRS reference:** RFC 0029

**Review checklist:**

- User selects Tamil (`ta`) in Account → Console and Account strings render in Tamil script
- User selects German (`de`) → Latin-script translation renders correctly
- Plugin without `i18n` field (e.g. Launcher) renders English unchanged
- Auth login page renders in correct locale
- `pnpm generate` runs without error with all four locale message files present
- `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test` all pass

---

#### Task 1.0.5 — Analytics, Phase 1 — Plugin scaffold + server-side infrastructure (RFC 0030) **[post-v1]**

**Goal:** Introduce a self-hosted, operator-controlled analytics system as a new
**platform plugin** (`plugins/analytics/`, id `fs.sovereign.analytics`). All data stays
on the instance. Page views are recorded server-side by the middleware (hard DNT/GPC
block). Plugins can emit custom analytics events via `sdk.analytics.track()`. Admins view
aggregate usage data in the Analytics plugin's Dashboard. Data collection is **off by
default** — enabled explicitly in Analytics → Settings. Operators who want no analytics
at all can disable the plugin in Console → Plugin Management.

**Deliverables:**

- `plugins/analytics/` scaffold: `manifest.json` (`type: platform`, `shell: default`,
  `routePrefix: /analytics`, `adminOnly: true`, `database: shared`, `permissions:
["auth:session", "db:readWrite"]`), `icon.svg`, `app/layout.tsx` (Dashboard / Settings
  nav), `app/page.tsx` (Dashboard), `app/settings/page.tsx` (collection toggle, retention
  dropdown, export, clear-all), empty `db/schema.ts`, `package.json`.
- `packages/db`: `analytics_page_views` + `analytics_events` table schemas for both
  SQLite and Postgres dialects; drizzle-kit migrations; DB helpers `recordPageView()`,
  `recordAnalyticsEvent()`, `queryAnalyticsAggregates()`, `cleanupOldAnalyticsRows()`;
  bootstrap seeds four new `platform_settings` keys: `analytics_collection_enabled`
  (`'false'`), `analytics_retention_days` (`'90'`), `analytics_daily_salt`
  (auto-generated), `analytics_salt_date` (today).
- `packages/manifest`: new `analytics:write` permission string in the manifest schema.
- `packages/sdk`: `sdk.analytics.track(event, properties?)` and
  `sdk.analytics.isEnabled()` in the experimental group; `SdkHost` gains `analytics` key.
- `runtime`:
  - `GET /api/analytics/config` — edge-cached (60 s); reads analytics plugin's
    `plugin_status.is_enabled` AND `analytics_collection_enabled` platform setting.
    Returns `{ enabled: bool, salt, saltDate, retentionDays }`.
  - Middleware page-view recording: fetch analytics config at request start, check
    `DNT`/`Sec-GPC` headers (hard block on either), compute daily-rotating session hash
    (`SHA-256(session_token + daily_salt)`), fire-and-forget
    `POST /api/analytics/internal/page-view` (non-blocking).
  - `POST /api/analytics/internal/page-view` — Node-runtime write route (admin-key-authed).
  - `GET /api/admin/analytics` — aggregate query endpoint (`health:view`-gated); supports
    `?range=7d|30d|90d` and `?type=pageviews|events|sessions`.
  - `'analytics'` added to `RESERVED_API_SEGMENTS`; dir-parity test passes.
  - Cleanup runner in `runtime/instrumentation.ts` `register()`: `cleanupOldAnalyticsRows()`.
  - SDK host `analytics` implementation: 60 s in-process cache for enabled state; checks
    plugin status + collection flag + DNT header; namespaces event to `<pluginId>.<event>`.
- `plugins/analytics/app/page.tsx`: Dashboard with active sessions/day bar chart, page
  views by plugin bar chart, top pages table, custom events table. Native `<canvas>`
  charts — no charting library dependency.
- `plugins/analytics/app/settings/page.tsx`: collection toggle (writes
  `analytics_collection_enabled`), retention dropdown (30/60/90/180 days), export button
  (`GET /api/admin/analytics?format=csv`), clear-all destructive button.
- `plugins/console`: Health page gains a "View analytics →" link to `/analytics`.
- Docs:
  - `plugin-development.md`: `sdk.analytics` surface documented; `analytics:write`
    permission in manifest reference table; plugin custom-event pattern + PII warning.
  - `self-hosting.md`: `analytics_collection_enabled`, `analytics_retention_days` settings
    documented.
  - `sdk-stability.md`: `sdk.analytics` added to the experimental-implemented group.
  - `packages/sdk/CHANGELOG.md`: minor entry.
  - Docs-parity test must pass for `analytics:write` permission and `sdk.analytics`.

**Dependencies:** None (independent post-v1 task)

**SRS reference:** RFC 0030

**Review checklist:**

- `GET /analytics` (admin session) → Dashboard renders
- `GET /analytics` (platform:user session) → 403
- Analytics plugin visible in Console → Plugin Management with enable/disable toggle
- Collection off by default: visit pages → no rows in `analytics_page_views`
- Enable collection in Analytics → Settings; visit plugin page → row in `analytics_page_views`
- `curl -H "DNT: 1" http://localhost:3000/launcher` → no row inserted (hard block)
- `curl -H "Sec-GPC: 1" http://localhost:3000/launcher` → no row inserted (hard block)
- Plugin WITH `analytics:write` permission: `sdk.analytics.track('feature.used', {})` → row in `analytics_events` with namespaced `event_name`
- Plugin WITHOUT `analytics:write` permission: `sdk.analytics.track()` → silent no-op, no row, no error
- Disable analytics plugin in Console → Plugin Management: `GET /analytics` → 404; `GET /api/analytics/config` → `{ enabled: false }`; `sdk.analytics.track()` from any plugin → no-op
- Retention cleanup: set `analytics_retention_days` to `1`, restart → old rows deleted at startup
- `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test` all pass
- Docs-parity test passes: `analytics:write` + `sdk.analytics` documented

---

#### Task 1.0.6 — Analytics, Phase 2 — Client-side click tracking + heatmaps (RFC 0030) **[post-v1]**

**Goal:** Extend the analytics plugin with client-side click and scroll tracking (collected
by a self-hosted JS snippet served from the runtime — never a third-party CDN) and a
heatmap visualization in the Analytics plugin's Heatmap tab. The client script checks
`navigator.doNotTrack` and `navigator.globalPrivacyControl` before initializing — hard
block if either is set.

**Deliverables:**

- `packages/db`: `analytics_click_events` + `analytics_scroll_events` table schemas for
  both dialects; drizzle-kit migrations; DB helpers for batch insert and heatmap aggregate
  queries.
- `runtime`:
  - `POST /api/analytics/event` — client-side event receiver: session-cookie-authed,
    re-checks DNT/GPC, computes session hash, batch-inserts click and scroll rows.
  - `GET /api/analytics/script.js` — self-hosted analytics client script: returns empty
    200 when analytics is disabled or collection is off; otherwise returns the minified
    tracking script (~3 KB). Checks `navigator.doNotTrack` / `navigator.globalPrivacyControl`
    before attaching any listeners — exits immediately if either is truthy.
  - Root layout (`runtime/app/layout.tsx`): `<Script src="/api/analytics/script.js"
strategy="afterInteractive">` (excluded from session gate).
  - `GET /api/admin/analytics?type=clicks&path=<pathname>` and `?type=scroll` —
    heatmap aggregate queries.
- `plugins/analytics/app/heatmap/page.tsx`: **Heatmap** tab added to Analytics plugin:
  - Plugin selector + path input.
  - Click heatmap rendered on `<canvas>` as radial-gradient density overlay (blue → yellow → red).
  - Optional `<iframe sandbox="allow-same-origin allow-scripts" style="pointer-events:none">` for live page background.
  - Scroll depth segmented bar (% of sessions reaching 25/50/75/100%).
  - Date range filter.
- CSP: `connect-src 'self'` already covers `/api/analytics/event` — no change needed.

**Dependencies:** Task 1.0.5

**SRS reference:** RFC 0030

**Review checklist:**

- Load a plugin page, click several elements, scroll to bottom; navigate away; confirm rows appear in `analytics_click_events` and `analytics_scroll_events`
- Form field clicks (`<input>`, `<textarea>`) produce no `element_selector` recording
- Browser with `navigator.doNotTrack = '1'`: reload — no network request to `/api/analytics/event` (verify in DevTools Network tab)
- `GET /api/analytics/script.js` with analytics disabled → empty body, 200 OK
- Analytics plugin Heatmap tab: select a plugin + path → canvas renders click density gradient
- Scroll depth bar: reflects actual scrolling depth from test session
- `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test` all pass

---

_Version 1.25 — June 2026. Several unnumbered ad-hoc tasks completed and merged (tracked in CLAUDE.md Status). (1) **Console license generator + operator key management** (RFC 0003 Phase 1 follow-up): in-browser Ed25519 keypair generation via `crypto.subtle`; server-side private-key storage in `platform_settings`; field source indicators. `@sovereignfs/db` → 1.4.0, `plugins/console` → 0.11.0. (2) **RFC 0003 Phase 2 docs**: `docs/rfcs/0003-plugin-monetization.md` extended with bank-transfer + webhook integration patterns and `sdk.billing.grantEntitlement()` seam. Task 1.0.09 added to roadmap. (3) **License generator bug fixes + DB-first key resolution**: fixed silent signing failure on Chrome (empty DOMException message), stale-public-key warning, and key inaccessibility after panel dismiss; `resolvePluginPublicKey` now resolves from `platform_settings` first (enables operator key rotation without rebuild); example-monetized plugin reads live entitlement. `runtime` → 0.25.1, `plugins/console` → 0.12.0. (4) **Fix: `generate-registry.ts` copy-first compose order**: eliminated intermittent dev 404s caused by the clear-then-copy sequence leaving a window where Next's route scanner found routes absent; now copies first, then prunes stale dirs. No version bump. (5) **Console plugin install/remove UX** (final pre-v1 console polish): replaced copy-CLI-command pattern with a two-step server-side flow — URL → "Check" fetches and validates the manifest preview, "Install" clones; "Remove" shows a native confirm dialog. Platform-plugin guard switched from a hardcoded ID set to `plugin.type === "platform"`. Earlier notes retained._

_Version 1.24 — June 2026. **Task 0.5.30 — Offline connectivity banner** completed and merged. Thin fixed banner surfaces connectivity status (soft-offline case — hard-offline was already covered by the `/offline` SW fallback). `@sovereignfs/ui` → 0.7.0 (warning/success status colour tokens); `runtime` → 0.20.0. CLAUDE.md gains the browser-API / `useState` SSR hydration rule. SRS v0.29. Earlier notes retained._

_Version 1.23 — June 2026. Planning change (no task completed, no version bumps): (1) Corrected duplicate task numbering — RFC 0028 operator fork model task renumbered from 1.0.06 to 1.0.07 (1.0.06 is already occupied by Non-Docker/systemd deployment, RFC 0026). (2) Added Task 1.0.08 — Storybook for `@sovereignfs/ui` design system (no RFC needed — developer tooling; Storybook 8 + `@storybook/nextjs`, Token Gallery, all component stories, a11y addon, CI build job). SRS decision-log row added (v0.28). Earlier notes retained._

_Version 1.22 — June 2026. Planning change (no task completed, no version bumps): Operator fork model (RFC 0028) incorporated as a documentation-only post-v1 task (originally numbered 1.0.06; corrected to 1.0.07 in v1.23). Mirrored in SRS v0.27 (§2.7 pointer + decision-log row). Earlier notes retained._

_Version 1.21 — June 2026. Planning change (no task completed, no version bumps): White-labeling / tenant branding (RFC 0027) incorporated as three post-v1 tasks (1.0.03–1.0.05) in Phase v1.0+. Phase 1 ships the data layer + shell injection + Console branding form + SDK extension; Phase 2 adds branded email templates and auth login page branding; Phase 3 adds dynamic PWA manifest and favicon route. Mirrored in SRS v0.26 (§3.18, §4.6, decision-log row). Earlier notes retained._

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
