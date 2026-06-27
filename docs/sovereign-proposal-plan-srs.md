# Sovereign

## Project Concept · Project Plan · Software Requirements Specification

**Version:** 0.6\
**Date:** June 2026\
**Status:** Signed Off

---

## Table of Contents

1. [Project Concept](#1-project-concept)
   - 1.1 [Overview](#11-overview)
   - 1.2 [Problem Statement](#12-problem-statement)
   - 1.3 [Solution](#13-solution)
   - 1.4 [Goals and Non-Goals](#14-goals-and-non-goals)
   - 1.5 [Target Users](#15-target-users)
   - 1.6 [Positioning](#16-positioning)
   - 1.7 [Guiding Principles](#17-guiding-principles)

2. [Project Plan](#2-project-plan)
   - 2.1 [Iteration History](#21-iteration-history)
   - 2.2 [Tech Stack](#22-tech-stack)
   - 2.3 [Monorepo Structure](#23-monorepo-structure)
   - 2.4 [Phased Roadmap](#24-phased-roadmap)
   - 2.5 [Plugin Roadmaps](#25-plugin-roadmaps)
   - 2.6 [MVP Scope](#26-mvp-scope)
   - 2.7 [Open Source Strategy](#27-open-source-strategy)

3. [Architecture](#3-architecture)
   - 3.1 [Deployment Model](#31-deployment-model)
   - 3.2 [Layer Overview](#32-layer-overview)
   - 3.3 [Auth Layer](#33-auth-layer)
   - 3.4 [Runtime Layer](#34-runtime-layer)
   - 3.5 [Plugin System](#35-plugin-system)
   - 3.6 [SDK](#36-sdk)
   - 3.7 [Database Layer](#37-database-layer)
   - 3.8 [Manifest System](#38-manifest-system)
   - 3.9 [Plugin Loading Model](#39-plugin-loading-model)
   - 3.10 [Shared Login State](#310-shared-login-state)
   - 3.11 [PWA](#311-pwa)
   - 3.12 [Native Mobile App (post-v1 plan)](#312-native-mobile-app-post-v1-plan)
   - 3.13 [Cross-Plugin Data Sharing (RFC 0002)](#313-cross-plugin-data-sharing-rfc-0002-implemented-in-task-0510)
   - 3.14 [Activity Log (RFC 0005)](#314-activity-log-rfc-0005)
   - 3.15 [Deployment & Upgrade Strategy (RFC 0006)](#315-deployment--upgrade-strategy-rfc-0006)
   - 3.16 [User Data Portability (RFC 0007)](#316-user-data-portability-rfc-0007)
   - 3.17 [Security & Encryption Architecture (RFC 0008)](#317-security--encryption-architecture-rfc-0008)
   - 3.18 [White-labeling (RFC 0027)](#318-white-labeling-rfc-0027-phase-1-implemented-in-task-1003)

4. [Software Requirements Specification](#4-software-requirements-specification)
   - 4.1 [User Roles and Capabilities](#41-user-roles-and-capabilities)
   - 4.2 [Functional Requirements — Platform](#42-functional-requirements--platform)
   - 4.3 [Functional Requirements — Auth](#43-functional-requirements--auth)
   - 4.4 [Functional Requirements — Console Plugin](#44-functional-requirements--console-plugin)
   - 4.5 [Non-Functional Requirements](#45-non-functional-requirements)
   - 4.6 [Out of Scope (v1)](#46-out-of-scope-v1)

5. [Plugin Manifest Reference](#5-plugin-manifest-reference)

6. [Decision Log](#6-decision-log)

---

## 1. Project Concept

### 1.1 Overview

Sovereign is a modular, self-hostable workspace runtime. It provides a shared platform foundation — authentication, data access, email, shared UI — on top of which installable plugins run as first-class applications. The runtime acts as a launcher and host for these plugins, eliminating the need to rebuild common infrastructure every time a new tool is needed.

Sovereign is open source, privacy-first, and designed to be owned entirely by the person or organisation running it.

### 1.2 Problem Statement

**For individuals and small teams:**

- Productivity tools are scattered across many services, most of them owned by large companies with no meaningful privacy commitment.
- Paid licenses accumulate quickly. Closed-source tools offer no auditability.
- Developers who want to build personal tools face the same bootstrapping cost every time: auth, user management, database setup, email, deployment.

**For developers specifically:**

- Building a new app from scratch requires repeating the same platform layer — auth, sessions, storage abstractions, mailer — for every project.
- Deploying independent tools separately leads to fragmented infrastructure with no shared identity or unified interface.

### 1.3 Solution

Sovereign provides a self-hosted workspace runtime with:

- A single auth server handling identity for all plugins
- A shared runtime (Next.js, App Router) that hosts plugins as route segments under a unified shell
- A plugin SDK abstracting platform services so plugins never re-implement infrastructure
- A manifest-driven plugin system that defines capabilities, permissions, and routing
- A core plugin set covering the most common personal workspace needs, extensible by the community

### 1.4 Goals and Non-Goals

**Goals (v1):**

- Working self-hostable runtime with auth, plugin loading, and SDK
- Three platform plugins shipping in the monorepo: Console (admin), Launcher (home screen), Account (user profile)
- Three sovereign reference plugins in separate repos: Tasks, Splitify, Plainwrite
- SQLite by default, Postgres-ready
- PWA installable from the browser
- Clean plugin developer experience with manifest schema and SDK types

**Non-Goals (v1):**

- Multi-tenancy (multiple independent workspaces on one deployment)
- Plugin sandboxing or process isolation
- Native mobile app — deferred to post-v1. Planned as a universal Capacitor
  shell app: one app on the App Store/Play Store, user enters their instance URL
  on first launch. See §3.11 for the full planned approach.
- Real-time collaboration
- Federated identity or multi-instance linking
- Public plugin marketplace

### 1.5 Target Users

**Primary (v1):** The developer themselves and a small circle of trusted users sharing one deployed instance.

**Secondary:** Technically capable individuals who want to self-host their own workspace and are comfortable with a Docker or Node deployment.

**Future:** Anyone who wants to host their own apps, Organisations wanting a self-hosted internal tooling platform; developers wanting to build and distribute Sovereign plugins.

### 1.6 Positioning

Sovereign is not a Notion alternative, not a homelab dashboard (Homarr, Dashy), and not a no-code platform builder. It sits closest to a self-hosted OS-like runtime for web applications — the analogy is closer to a personal cloud OS than a productivity suite.

The distinguishing characteristic is that Sovereign is a platform for running apps, not an app that has been extended with plugins. The plugin system is the product.

### 1.7 Guiding Principles

- **Self-hostability is non-negotiable.** No cloud dependency for core functionality.
- **Vendor lock-in is a defect.** Every infrastructure choice must have a clear self-hosted path.
- **The SDK is the contract.** Plugins interact with the platform through the SDK only, never through internal imports.
- **Simplicity over premature flexibility.** Defer complexity until there is a concrete reason to add it.
- **Open source core.** The runtime and all core plugins are AGPL-3.0. Third-party plugins may use any license.

---

## 2. Project Plan

### 2.1 Iteration History

Sovereign v3 is a clean rewrite. Two prior iterations existed:

**Sovereign Legacy (v1):** Node.js / Express / Handlebars monolith, SQLite, Prisma. Technology-agnostic plugin aspiration. Reached meaningful maturity (481 commits, Docker, PM2, CLI, migrations) but the architecture ceiling was low and the stack made a capable plugin system difficult to build.

**Sovereign v2:** Clean architectural reset. Next.js App Router, manifest system, capability-based permissions, multiple runtime types (`route-source`, `iframe-local`, `iframe-remote`, `external`). Better conceptual clarity but stalled at ~47 commits due to overly ambitious architecture relative to available bandwidth.

**v3 decision:** Retain the best ideas from v2 (manifest system, capability model, Next.js runtime, SDK contract) while making pragmatic choices that allow the project to actually ship. Build-time plugin composition instead of runtime dynamic loading. Drizzle instead of Prisma. better-auth for the auth layer. Turborepo for monorepo orchestration.

### 2.2 Tech Stack

| Layer               | Choice                                                                                       | Rationale                                                                                                                                                                                                                                         |
| ------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime framework   | Next.js 15 (App Router)                                                                      | SSR, server actions, API routes, PWA support — single framework for the whole runtime                                                                                                                                                             |
| Language            | TypeScript                                                                                   | Type safety across monorepo; SDK types are the plugin contract                                                                                                                                                                                    |
| Monorepo tooling    | Turborepo + pnpm workspaces                                                                  | Task orchestration, build caching, clean package boundaries. pnpm enforces strict dependency declarations — no phantom dependencies across plugins.                                                                                               |
| Auth                | better-auth (wrapped in `apps/auth`)                                                         | Comprehensive, self-hostable, actively maintained                                                                                                                                                                                                 |
| Database ORM        | Drizzle                                                                                      | Supports SQLite and Postgres with the same API; lightweight; good migration story                                                                                                                                                                 |
| Database default    | SQLite (better-sqlite3)                                                                      | Zero config for self-hosters; adequate for personal/small-team use                                                                                                                                                                                |
| Database production | PostgreSQL                                                                                   | Config change, not a code change                                                                                                                                                                                                                  |
| Email               | Custom `packages/mailer` (SMTP)                                                              | Self-hostable, no third-party email dependency                                                                                                                                                                                                    |
| UI components       | `packages/ui` (shared component library)                                                     | Consistent design system across runtime and plugins                                                                                                                                                                                               |
| CLI                 | `citty` + `consola`, TypeScript via `tsx`                                                    | `citty` is lightweight, TypeScript-first, handles nested subcommands cleanly. `consola` pairs naturally for consistent terminal output. `tsx` avoids a separate CLI compile step. Monorepo-internal in v1.                                        |
| Code quality        | ESLint 9 (flat config) + `typescript-eslint` + Prettier + `simple-git-hooks` + `lint-staged` | ESLint for lint rules including the SDK import boundary; Prettier for formatting (separate concerns). `simple-git-hooks` + `lint-staged` enforce both on staged files at commit time. No Biome — ESLint is required for the custom boundary rule. |
| Package bundler     | `tsup` (esbuild-based)                                                                       | Consistent build tool across all TypeScript packages. ESM output only. TypeScript declarations included. CSS files treated as external in `packages/ui` so the consuming Next.js app processes them.                                              |
| PWA                 | @ducanh2912/next-pwa                                                                         | Service worker, installable shell                                                                                                                                                                                                                 |
| Containerisation    | Docker + Docker Compose                                                                      | Standard self-hosting deployment path                                                                                                                                                                                                             |

### 2.3 Monorepo Structure

```
sovereign/
├── apps/
│   └── auth/                   # better-auth wrapper — the only separate Next.js app
│
├── packages/
│   ├── sdk/                    # Plugin ↔ platform contract (types + implementations)
│   ├── ui/                     # Shared component library
│   ├── mailer/                 # SMTP email abstraction
│   ├── db/                     # Drizzle client factory + migration runner
│   └── manifest/               # Manifest schema, validation, types
│
├── runtime/                    # Sovereign Core (Next.js, App Router)
│   ├── app/                    # App Router surface
│   │   └── (platform)/         # Shell, launcher, navigation
│   │       └── (plugins)/      # Composed plugin route segments (generated copies)
│   ├── src/                    # Platform internals (middleware, registry, permissions)
│   ├── generated/              # Built from manifests — never edited by hand
│   │   ├── registry.ts         # Aggregated plugin registry
│   │   └── routes.ts           # Route map
│   ├── next.config.ts
│   └── package.json
│
├── plugins/                    # All plugins — source or cloned by install script
│   ├── console/                # Core: admin, user management, settings, system health
│   ├── launcher/               # Core: home screen plugin grid — serves "/" by default
│   └── account/                # Core: per-user profile, preferences, sessions
│                               # tasks/, splitify/, and plainwrite/ are cloned here by the
│                               # install script from their respective external repositories
│
├── registry/
│   └── plugins.json            # Canonical list of known community plugins
│
├── scripts/
│   ├── install-plugins.ts      # Clones external plugins defined in config
│   ├── generate-registry.ts    # Reads manifests → writes runtime/generated/
│   └── dev.ts                  # Orchestrates local dev (runtime + auth)
│
├── bin/
│   └── sv                      # CLI entry point
│
├── docs/                       # Architecture docs, plugin developer guide, ADRs
├── data/                       # SQLite database files (gitignored)
├── docker-compose.yml
├── turbo.json
└── package.json
```

**Plugin internal structure:**

```
plugins/tasks/
├── manifest.json               # Plugin identity, permissions, routing
├── app/                        # Next.js route segment
│   ├── page.tsx
│   └── [...slug]/
├── db/
│   └── schema.ts               # Drizzle schema (tasks_* prefix)
├── migrations/                 # Drizzle migration files
├── components/                 # Plugin-scoped UI components
├── lib/                        # Plugin business logic
└── package.json
```

### 2.4 Phased Roadmap

> This roadmap covers the Sovereign platform and runtime only. Plugin roadmaps are maintained separately — see [2.5 Plugin Roadmaps](#25-plugin-roadmaps).

**v0.3 — Foundation**

- Monorepo scaffolding (Turborepo, packages, apps)
- Auth server (`apps/auth`) with better-auth: login, logout, register, session
- Runtime shell: layout, three-section sidebar, navigation, root placeholder page
- SDK skeleton: `auth`, `db`, `mailer` interfaces defined and typed
- Manifest schema and validation (`packages/manifest`)
- Pre-build script: manifest aggregation → `runtime/generated/`
- Plugin route injection mechanism
- Docker Compose for local dev

**v0.4 — Platform plugins (Console, Launcher, Account)**

- User management (list, invite, role assignment, deactivate)
- Plugin management (installed plugins, enable/disable)
- Workspace settings (name, branding basics, root plugin)
- System health dashboard
- Launcher plugin — home screen plugin grid, serves `/` by default
- Account plugin — per-user profile, credentials, preferences, active sessions

**v0.5 — Polish and self-hosting**

- PWA shell
- Docker production image
- Self-hosting documentation
- Postgres validation (switch DATABASE_URL, run migrations, confirm parity)
- `sv` CLI: `install`, `build`, `serve`, `plugin add/remove`

**v1.0 — Public release**

- Full documentation
- Plugin developer guide
- `registry/plugins.json` structure and contribution process
- Stable SDK API with semver commitment

### 2.5 Plugin Roadmaps

#### Platform plugins (monorepo, `type: platform`)

Console, Launcher, and Account ship inside the monorepo and are maintained by
the Sovereign team. Their roadmaps track the platform milestones directly. Specs
in `docs/plugins/`.

**Console** — admin-only platform administration (user management, plugin
management, workspace settings, system health, root plugin config). Target:
v0.4.

**Launcher** — default home screen served at `/`. Lists all installed,
accessible plugins. Admin can promote any plugin to serve `/` instead.
Target: v0.4, alongside Console.

**Account** — per-user self-service (display name, avatar, password, timezone,
appearance, active sessions). Target: v0.4, alongside Console.

#### Sovereign reference plugins (separate repos, `type: sovereign`)

Tasks, Splitify, and Plainwrite are maintained in separate repositories under the
Sovereign project. They are the primary reference implementations demonstrating
how third-party plugins integrate with the Sovereign SDK. Their development
tracks loosely alongside the platform but on independent timelines.

**sovereign-plugin-tasks**

- v0.1 — Task CRUD, list management, subtasks, list sharing, basic task assignment
- v0.2 — Due dates + times, filtering, cross-list search, keyboard shortcuts, bulk actions
- v0.3 — Full recurrence (daily/weekly/monthly/yearly/custom patterns; generate-next-instance model)
- v1.0 — Stable, documented reference plugin

**sovereign-plugin-splitify**

- v0.1 — Groups (default currency, debt simplification), guest members, expense CRUD with all split methods, multi-payer, balance calculation, in-app + browser push notifications
- v0.2 — Settlements, CSV export, expense comments
- v0.3 — Multi-currency entry with manual exchange rates (conversion deferred)
- v0.4 — Email notifications (expense alerts, settlement summary)
- v1.0 — Stable, documented reference plugin

**sovereign-plugin-plainwrite**

- v0.1 — Project management (GitHub repo connection, per-user OAuth connect with PAT fallback, project sharing), file listing and sync, Markdown editor, frontmatter editor (structured + raw YAML toggle), draft/commit/publish workflow, conflict detection
- v0.2 — Rich text editor (WYSIWYG → Markdown), Jekyll support, image upload
- v0.3 — Conflict resolution UI (diff view), advisory file locking, custom SSG support
- v1.0 — Stable, documented reference plugin for credential management and third-party API integration

**sovereign-plugin-apicomposer**

- v0.1 — GUI API builder: project/resource/method editing, managed JSON storage, project sharing, hashed API keys with per-method public toggle, generated REST API at `/api/<project-slug>/*` (filtering, sorting, pagination, schema validation, reference expansion), record browser
- v0.2 — OpenAPI 3.1 generation, request logs, per-key rate limiting, many-to-many relationships, unique constraints, import/export
- v0.3 — GraphQL protocol adapter, sandboxed custom logic hooks, webhooks
- v1.0 — Stable, documented reference plugin for public, key-authenticated APIs under the `/api` namespace

**sovereign-plugin-papertrail** (repo: `kasunben/PaperTrail` — adapted from the legacy-architecture plugin)

- v0.1 — Evidence-mapping canvas (React Flow): plugin-owned projects containing boards, owner/editor/viewer sharing, text/image/link nodes, styled edges, tags + search, offline-first snapshot sync with conflict detection, image upload pipeline, hardened link previews, JSON export/import (also the legacy migration bridge)
- v0.2 — Story mode walkthroughs, frames, undo/redo, board duplication and templates
- v0.3 — Live presence/collaboration (gated on a post-v1 platform real-time surface) and public read-only share links (gated on a public-route mechanism)
- v1.0 — Stable, documented reference plugin for canvas-heavy, offline-first plugins

Tasks, Splitify, Plainwrite, and PaperTrail target SDK compatibility with Sovereign v0.4+ (once Console ships and the SDK `db` implementation is stable). API Composer targets v0.5+ — its generated APIs depend on the `/api` namespace delegation (PLT-16).

### 2.6 MVP Scope

The platform MVP is v0.3 through v0.5 — a working, self-hostable Sovereign instance with the three platform plugins (Console, Launcher, Account), a stable SDK, and production deployment tooling.

A complete reference deployment (platform + Tasks + Splitify + Plainwrite) requires both the platform reaching v0.5 and the reference plugins reaching their respective v0.1 milestones. These can be developed in parallel once the SDK `db` interface is stable at v0.4.

### 2.7 Open Source Strategy

- **Runtime and core plugins:** AGPL-3.0
- **SDK and shared packages:** MIT (lower barrier for plugin developers)
- **Third-party plugins:** Any license, declared in `manifest.json`
- **Contributor License Agreement:** Required before merging PRs (as per v1 precedent)
- **Dual licensing:** Commercial license available for organisations needing to operate the runtime privately without AGPL obligations (contact maintainer)

**Fork model:** Operators who need custom compiled-in plugins or who are building
a commercial OEM derivative should follow the fork model documented in RFC 0028
(`docs/rfcs/0028-operator-fork-model.md`). The key principle: never modify
upstream-owned files; add only to the fork-safe zone (`operator/`,
`plugins/<operator-id>/`). This keeps `git rebase upstream/main` conflict-free.
AGPL triggers on distribution, not private self-hosted use; community plugins
(`plugins/<operator-*>/`) are MIT-SDK-bound and carry no AGPL copyleft.

---

## 3. Architecture

### 3.1 Deployment Model

**v1: Single-tenant, multi-user.**

One deployment = one tenant. All users of that deployment share one identity pool, one database, and one set of installed plugins. There is no concept of separate tenants within a single instance.

Multi-tenancy is a future concern. The auth and data layers must not actively prevent it — user records should carry a `tenant_id` foreign key from day one even if only one tenant ever exists — but no multi-tenant logic is built in v1.

**Deployment topology.**

Two long-running Node processes: the **runtime** (`runtime`) and the **auth
server** (`apps/auth`). Both are Next.js applications built with
`output: 'standalone'` and run as plain `node server.js` — no in-container
process manager. Canonical deployment is **Docker Compose** orchestrating both
as separate containers on a shared internal network.

- The **runtime** is the only externally exposed service. It faces the
  reverse proxy / public internet.
- The **auth server** is **not** published on a host port. It is reachable only
  on the internal Docker network at `http://auth:<port>`; the runtime reaches it
  via the `SOVEREIGN_AUTH_URL` env var. This keeps the auth surface off the
  public network entirely.

Containers always listen on fixed **internal** ports; the **host** mapping
differs by environment and is overridable via env. Defaults:

| Service | Internal (container) | Dev (host) | Prod (host) | Env override   |
| ------- | -------------------- | ---------- | ----------- | -------------- |
| Runtime | 3000                 | 3000       | 4000        | `RUNTIME_PORT` |
| Auth    | 3001                 | 3001       | not exposed | `AUTH_PORT`    |

In dev, `next dev` runs the two apps directly on 3000/3001. In production, the
containers listen on 3000/3001 internally and the runtime is mapped to host
4000 (auth is internal-only, never host-mapped). All ports are configurable;
the table lists defaults only.

Process supervision is delegated to Docker (`restart: unless-stopped`) in the
canonical deployment. Two supported non-Docker paths are available for
environments where Docker is unavailable:

- **PM2 (RFC 0026 Phase 1):** `sv setup pm2` generates a PM2 ecosystem config
  pointing to the standalone `server.js` outputs. The auth server is bound to
  loopback (`127.0.0.1:3001`); the runtime is bound to `0.0.0.0:3000`. PM2's
  auto-restart handles the startup race between auth and runtime. `sv serve`
  uses a 30-second health-gate so operators running without PM2 are also
  protected. See `docs/self-hosting.md`.
- **systemd (RFC 0026 Phase 2, post-v1):** Native Linux supervision with no
  extra dependencies. Planned for Task 1.0.06.

### 3.2 Layer Overview

```
┌─────────────────────────────────────────────────┐
│                   Browser / PWA                  │
└──────────────────────┬──────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────┐
│              Sovereign Runtime                   │
│         (Next.js App Router shell)               │
│   Navigation · Launcher · Middleware · Layout    │
├──────────────────────────────────────────────────┤
│                  Plugin Routes                   │
│    /console    /tasks    /splitify    /...       │
├──────────────────────────────────────────────────┤
│                  Sovereign SDK                   │
│         sdk.auth · sdk.db · sdk.mailer          │
├──────────────┬───────────────┬───────────────────┤
│  Auth Server │   Drizzle DB  │  Mailer (SMTP)   │
│ (apps/auth)  │ SQLite/Postgres│  packages/mailer │
└──────────────┴───────────────┴───────────────────┘
```

### 3.3 Auth Layer

A self-contained Next.js application (`apps/auth`) wrapping better-auth. It is the only process besides the runtime that runs in production.

**Self-contained.** The auth server owns identity end to end: better-auth manages its own database (its standard `user` / `session` / `account` / `verification` schema, plus a small `invites` table) and the auth server hosts its own login and registration UI. It does **not** depend on `packages/db` — that package is for the runtime and plugins. Of the shared workspace packages it uses only `@sovereignfs/ui` (the design system), so the auth screens match the rest of the platform. This keeps the auth surface (passwords, credentials) isolated from application data.

**Responsibilities:**

- User login, logout, registration (with invite-only toggle), and the login/registration UI
- Session management via httpOnly cookies
- Session verification endpoint consumed by the runtime
- JWT issuance signed with a shared secret

**What it is not:**

- An OAuth provider (future consideration)
- A store of application data — only identity (users, sessions, credentials, invites) lives here; everything else lives in the runtime/plugin database (`packages/db`)

The auth server and runtime share a `SOVEREIGN_AUTH_SECRET` environment variable.

**Session verification strategy (phased):**

- **v0.3:** The runtime middleware calls the auth server's `/api/verify` endpoint on each request. Simpler to implement and easier to reason about during early development.
- **v0.5 target:** Local JWT verification using the shared secret — the runtime verifies tokens without a round-trip to the auth server. This is the correct long-term approach for performance and resilience.

AUTH-05 describes the v0.5 target state. The `/api/verify` endpoint (AUTH-06) remains available for explicit verification scenarios after the local strategy is implemented.

**First-user role assignment:** the user's `role` is a custom field on the auth server's own `user` table (set via better-auth `additionalFields`, not user-editable). A better-auth `databaseHooks.user.create` hook checks whether this is the first user; if so it assigns `platform:admin`, otherwise `platform:user`. The runtime reads the role from the verified session (`/api/verify`); `tenant_id` and all application data remain a runtime/plugin concern in `packages/db`.

### 3.4 Runtime Layer

The runtime is the Sovereign Core — a Next.js 15 application using the App Router.

**Responsibilities:**

- Platform shell: navigation, layout, root plugin routing
- Request middleware: session verification, permission enforcement, plugin route protection
- Plugin registry: reads `runtime/generated/registry.ts` to know which plugins are installed
- SDK bridge: implements the SDK interfaces consumed by plugins
- PWA shell

The runtime never contains plugin business logic. It knows plugins exist and where to route them, but plugins are self-contained.

### 3.5 Plugin System

Plugins are the primary unit of functionality in Sovereign. Everything beyond the shell — including admin tooling — is a plugin.

**Plugin types:**

| Type      | Meaning                                                                | Location                                     | `type` value  |
| --------- | ---------------------------------------------------------------------- | -------------------------------------------- | ------------- |
| Platform  | Ships in the monorepo, maintained by the Sovereign team                | `/plugins/[id]/` (in repo)                   | `"platform"`  |
| Sovereign | Separate repo, maintained by the Sovereign team (e.g. Tasks, Splitify) | `/plugins/[id]/` (cloned by install script)  | `"sovereign"` |
| Community | Third-party, any maintainer, any source                                | `/plugins/[id]/` (cloned or manually placed) | `"community"` |

**Plugin activation:**
A plugin is active if its directory exists under `/plugins`, its manifest validates successfully, and it appears in the generated registry. Adding a plugin requires running the install script (or manual placement) followed by a rebuild. Removing a plugin means removing its directory and rebuilding.

There is no hot-swap or dynamic loading in v1. This is an intentional simplicity choice.

### 3.6 SDK

The SDK (`packages/sdk`) is the only permitted interface between a plugin and the platform. Plugins must not import from `runtime/src` directly. This boundary is enforced by ESLint import rules.

**v1 SDK surface:**

```typescript
// Auth
sdk.auth.getSession(): Promise<Session | null>
sdk.auth.requireSession(): Promise<Session>  // throws if unauthenticated

// Database
sdk.db.getClient(): DrizzleClient  // scoped Drizzle instance

// Mailer
sdk.mailer.send(options: MailOptions): Promise<void>

// Platform config
sdk.platform.getConfig(): PlatformConfig
```

**Declared but unimplemented in v1 (stub throws NotImplementedError):**

```typescript
sdk.storage.put(key: string, value: Buffer): Promise<void>
sdk.storage.get(key: string): Promise<Buffer | null>
sdk.notifications.send(userId: string, message: string): Promise<void>
sdk.events.publish(event: string, payload: unknown): Promise<void>
sdk.events.subscribe(event: string, handler: Function): void
```

Plugins declare which SDK capabilities they use in their manifest under `"permissions"`. This serves as documentation and forward-compatibility signalling, not runtime enforcement in v1.

### 3.7 Database Layer

**Default:** SQLite via better-sqlite3, file stored at `data/sovereign.db`.

**Production:** PostgreSQL. Switching requires only changing `DATABASE_URL` in environment config and a dialect flag. No application code changes.

**Plugin schema isolation:** Plugins choose between two isolation models via the manifest `database` field:

- **`shared` (default):** Plugin tables live in the platform database, namespaced by slug prefix (e.g. `tasks_lists`, `tasks_items`). One connection, simple deployment.
- **`isolated` (opt-in, RFC 0004):** The plugin gets its own dedicated store — a separate SQLite file (`data/plugins/<pluginId>.db`) or a Postgres schema (`plugin_<slug>`, provisioned with `CREATE SCHEMA IF NOT EXISTS`). The store is provisioned lazily on first `sdk.db.getClient()` call, and dropped entirely on uninstall. Migrations run against the dedicated store at startup. No slug prefix is required inside an isolated store. `sdk.db.getClient()` is transparent to the caller — isolation is handled by the runtime.

**Migrations:** Each plugin maintains its own migration files under `plugins/[id]/migrations/`. The `packages/db` migration runner aggregates and applies all plugin migrations in deterministic order at startup. Platform migrations (users, tenants, sessions) run first, then plugins in alphabetical order.

**Future-proofing for multi-tenancy:** The `users` and `tenants` tables include a `tenant_id` column from day one. Plugin tables that contain user-scoped data include `tenant_id` as well, even if only one tenant exists. No multi-tenant query logic is implemented.

### 3.8 Manifest System

Every plugin contains a `manifest.json` at its root. The `packages/manifest` package provides the schema, TypeScript types, and validation utilities.

**Full manifest schema:**

```json
{
  "schemaVersion": 1,
  "id": "io.openfs.sovereign.tasks",
  "name": "Tasks",
  "version": "1.0.0",
  "description": "Task and list management for Sovereign.",
  "type": "sovereign",
  "runtime": "native",
  "routePrefix": "/tasks",
  "permissions": ["auth:session", "db:readWrite"],
  "adminOnly": false,
  "database": "shared",
  "shell": "default",
  "icon": "icon.svg",
  "compatibility": {
    "minPlatformVersion": "0.1.0"
  },
  "repository": "https://github.com/sovereignfs/sovereign-plugin-tasks"
}
```

For `sovereign` and `community` plugins, `"repository"` is required. The install script uses it to clone the plugin. For `platform` plugins the field is omitted.

**Community plugin registry** (`registry/plugins.json`) is a flat list of known plugin manifests. Adding a plugin to the registry requires a pull request. Self-hosters may modify this file freely on their own deployments.

**Shell layout control:** Plugins can customise the runtime shell via the `shell` field. The shell consists of a sidebar and content area on desktop, collapsing to a header, content area, and footer launcher on mobile. Three modes are supported:

- `"default"` — full shell chrome visible. Applied when the field is omitted.
- `"minimal"` — all shell chrome hidden. Content area fills the full viewport. Useful for immersive plugins, dashboards, or full-bleed layouts.
- `"overlay"` — the plugin renders as a dismissable dialog **over** the current page rather than navigating away from it (a quick, interruption-style layer for settings-like or quick-capture plugins; Console and Account are the motivating cases). URLs are real and unchanged; a hard/direct load renders the plugin as a full page (the `default`-shell fallback). Implemented via App Router parallel + intercepting routes — the plugin's `app/` tree composes twice (an interception copy for soft navigation, a full-page fallback for hard loads). The runtime owns the dialog chrome; plugins write ordinary pages and flip one manifest field. The dialog size is plugin-declared via `shellConfig.overlaySize` (`sm`/`md`/`lg`, default `lg`) and is a fixed box that does not resize with its content. Dismissal is a single `router.back()`, so a plugin's intra-overlay navigation (tabs/sections) must use `replace` to keep the overlay on one history entry. See RFC 0001.

The runtime reads the active plugin's `shell` value from the registry on each navigation and applies the appropriate layout. The shell mode is per-plugin — navigating between plugins transitions the layout accordingly.

**Sidebar structure (desktop):** The `default` shell sidebar has three fixed sections:

```
┌──────────────────────────┐
│  [Logo / Tenant name]     │  Top — branding header, links to "/"
├──────────────────────────┤
│  [●] Root plugin (first)  │
│  [●] Tasks                │  Middle — all accessible plugins
│  [●] Splitify             │  First icon = configured root plugin, always visible
│  [●] Plainwrite           │  v1.1: user can pin/unpin/reorder
│  [●] ...                  │
├──────────────────────────┤
│  [⚙] Console  (admin)    │  Bottom — hardcoded shell chrome (not plugin icons)
│  [👤] Account avatar      │
└──────────────────────────┘
```

- **Top section:** branding header; clicking navigates to `/`.
- **Middle section:** the first icon always represents the configured root plugin and points to `/`; it cannot be hidden or reordered by users. This slot may show a chrome plugin — the Launcher is the default root. The remaining icons are one per accessible, enabled, non-chrome plugin, excluding the root plugin itself (a plugin promoted to root is never duplicated as a second icon). Chrome plugins (`fs.sovereign.launcher`, `fs.sovereign.account`, `fs.sovereign.console`) never appear among the remaining icons — Console and Account live in the bottom section. **Exception:** when the Launcher is _not_ the configured root plugin, it appears in the middle section as a regular icon (linking to `/launcher`) so it always remains reachable; it is the only chrome plugin that can appear there. v1: fixed install order. v1.1: user can pin, unpin, and reorder.
- **Bottom section:** hardcoded shell chrome. Console icon (the Console plugin's manifest `icon.svg`) visible to `platform:admin` only. Account slot renders the user's avatar image (or generated monogram from initials) and links to `/account`.

**Mobile layout:** The mobile shell uses a header (branding logo left, Account avatar right), a content area, and a footer launcher. The footer launcher mirrors the middle sidebar section (same plugin icons, same order). Console icon appears in the footer launcher for admin users only.

**Root plugin:** The platform has a configurable `root_plugin_id` (default: `fs.sovereign.launcher`). Navigating to `/` **serves the root plugin in place** — the runtime rewrites `/` to the root plugin's `routePrefix`, so the URL stays `/` while the plugin renders, and the plugin remains reachable at its own prefix. An admin can change this to any installed, enabled, non-adminOnly, non-overlay plugin via Console (CON-11) — an `overlay` plugin serves `/` as a full page only and so is ineligible as root. The first middle-section sidebar icon always resolves the current root plugin's icon and routes to `/`.

### 3.9 Plugin Loading Model

**v1: Build-time composition.**

Plugins are Next.js route segments. A pre-build script (`scripts/generate-registry.ts`) reads all manifest files under `/plugins`, validates them, and:

1. Writes `runtime/generated/registry.ts` — the runtime's source of truth for installed plugins
2. Injects each `plugins/[id]/app/` directory into the runtime App Router at the plugin's `routePrefix`, under a route group chosen by the manifest `shell` value, so the plugin is served at its public path with the correct chrome. Default-shell plugins compose into `runtime/app/(platform)/(plugins)/<routePrefix>/`, which inherits the platform sidebar shell; the `(plugins)` route group is URL-transparent, so a plugin with `routePrefix: /console` is served at `/console`. (A chrome-free group for `shell: minimal` plugins lands when the first one ships.) `shell: overlay` plugins compose **twice** (RFC 0001): an interception copy under the `(platform)/@modal/(.)<routePrefix>/` parallel-route slot (soft navigation renders the plugin layered over the current page) plus the ordinary full-page fallback copy under `(platform)/(plugins)/<routePrefix>/` (hard loads, deep links, the login redirect). The composed segment's directory name is the `routePrefix`, not the source directory name — so `routePrefix` is the single source of truth for a plugin's URL.

**Injection uses copies in every environment.** Next's dev route watcher does
not discover routes through symlinked directories, so a symlinked plugin route
is never registered under `next dev` (it 404s) — even though `next build` _does_
follow symlinks. Copying avoids that dev/prod divergence and keeps the two
identical:

| Environment     | Strategy     | Notes                                                                                                                         |
| --------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| Development     | Copy + watch | The dev orchestrator (`scripts/dev.ts`) runs the generate script in `--watch` mode, so edits under `/plugins` re-copy and HMR |
| Production / CI | Copy         | Hermetic, Docker-safe                                                                                                         |

An earlier design used symlinks in dev for zero-copy live editing; it was
dropped because Next's dev server does not discover routes through symlinked
directories (the `resolve.symlinks: false` webpack workaround addressed module
HMR, not route discovery). The Turborepo build pipeline runs in production mode;
Docker builds compose copies the same way.

The composed plugin segments under each route group (e.g.
`runtime/app/(platform)/(plugins)/`) are entirely generated artifacts. The
source of truth is always `plugins/[id]/app/`. A `.gitignore` inside each route
group ignores its composed contents (while keeping the group folder tracked so
the App Router can compose into it), and the contributor guide notes that
generated files must never be committed.

**CI validation:** a dedicated CI step runs the generate script in production
mode and validates the output before the Docker build stage.

Adding a plugin: place or clone directory → run `pnpm generate` → run `pnpm build` (or `pnpm dev`).
Removing a plugin: remove directory → run `pnpm generate` → run `pnpm build` (or `pnpm dev`).

There is no hot-swap or dynamic loading in v1. This is an intentional simplicity choice.

**Runtime types** (only `native` implemented in v1):

| Type            | Description                                                                                                         | SDK Access       |
| --------------- | ------------------------------------------------------------------------------------------------------------------- | ---------------- |
| `native`        | Next.js route segment, build-time composed into the runtime                                                         | Full SDK package |
| `static`        | Pre-built SPA bundle (Vite, Vue, Angular, etc), served as static assets by the runtime, iframe-mounted in the shell | REST API         |
| `iframe-local`  | Separate local server process, iframe-mounted in the shell                                                          | `postMessage`    |
| `iframe-remote` | Remotely hosted app, iframe-mounted in the shell                                                                    | `postMessage`    |
| `external`      | Deep link only, no embedding. Sovereign acts purely as a launcher entry point                                       | None             |

> **Note:** `native` is the only runtime type implemented in v1. All other runtime types are declared for forward-compatibility and architectural planning purposes. Their specifications, behaviour, and SDK access mechanisms are subject to change before implementation.

### 3.10 Shared Login State

The runtime and all plugins are built into a single Next.js application (build-time composition), so they share one origin. All plugin routes inherit the session automatically — no per-plugin authentication, no token passing, no SSO configuration required.

The auth server is a separate app, but the session cookie is still shared with the runtime because **cookies are scoped by host, not by port**: better-auth sets an httpOnly cookie for the host, so a cookie set by the auth server (e.g. `localhost:3001` in dev) is sent to the runtime (`localhost:3000`) too. In production the auth server and runtime sit behind one reverse proxy on the same domain, so the cookie is shared there as well. (The reverse-proxy/exposure topology for this is settled in the deployment tasks.)

The runtime's middleware reads the session cookie and verifies it (v0.3: a call to the auth server's `/api/verify`; v0.5: local JWT verification), then injects user context into the request. Plugins access this context via `sdk.auth.getSession()`, which reads from request context, not from a remote call.

### 3.11 PWA

`@ducanh2912/next-pwa` is added to the runtime. The PWA shell is installable from the browser. The service worker caches the shell and static assets for offline availability. Plugin data is not cached offline in v1.

**Offline connectivity banner (Task 0.5.31):** When a user is already in an authenticated session and the network drops, a thin fixed banner (`position: fixed; top: 0; z-index: 200`) slides in with an amber "No internet connection" state. On reconnection it flashes green "Back online" for 3 s, after which the service worker's `reloadOnOnline` triggers a full page reload to restore fresh content. The banner uses `navigator.onLine` + `window` `offline`/`online` events. SSR safety: the component always initialises to `'online'` (matching the server render) and reads the real state in `useEffect` — reading browser APIs during render or in a `useState` initializer causes a hydration mismatch. The banner is wired into both `(platform)` and `(minimal)` shell layouts; the `/offline` fallback page is excluded (it is the hard-offline landing).

### 3.12 Native Mobile App (post-v1 plan)

Native mobile support is deferred to post-v1 but the approach is decided:

**Model: universal shell + instance URL.**
One app published to the App Store (iOS) and Play Store (Android). On first
launch the user enters the URL of their self-hosted Sovereign instance. The app
loads that URL in a WebView. All Sovereign functionality — auth, plugins, shell
layout — is served by the user's own instance and runs inside the WebView
unchanged. Switching between multiple instances is supported (personal + work
etc.). This is the same distribution pattern used by Nextcloud, Bitwarden, and
Element (Matrix).

**Shell technology: Capacitor.**
A single TypeScript codebase for both iOS and Android. The shell's logic is
minimal: instance URL configuration on first launch, persistent URL storage,
WebView loading, and native permission declarations. Capacitor is chosen over
Hotwire Native (Swift + Kotlin) because:

- Single codebase — no native language required from contributors
- Rich plugin ecosystem (`@capacitor/camera`, `@capacitor/push-notifications`,
  `@capacitor/biometric-auth` etc.) covering device APIs beyond Web standards
- TypeScript throughout — consistent with the rest of the stack
- Standardised bridge pattern — easier to expose through the SDK than
  hand-rolled Hotwire bridges

**Device API strategy — three tiers:**

| Tier              | Technology                                                 | Examples                                                                                | Works in browser too?      |
| ----------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------- | -------------------------- |
| Web APIs          | Standard browser APIs, work natively in WebView            | GPS (`navigator.geolocation`), camera/mic (`getUserMedia`), accelerometer, Web Push     | ✅                         |
| Capacitor plugins | JS bridge to native code, richer access and better UX      | Native photo picker, APNs/FCM push, Face ID / fingerprint, background location, haptics | ❌ (native shell only)     |
| SDK abstraction   | `sdk.device.*` detects environment, routes to correct tier | `sdk.device.getLocation()`, `sdk.device.capturePhoto()`                                 | ✅ (falls back to Web API) |

Plugin developers use `sdk.device.*` only — they never call Web APIs or
Capacitor plugins directly. The SDK implementation picks the right tier based
on the runtime environment. This keeps plugins portable across browser, PWA,
and native shell without code changes.

The shell app lives in a separate repository (`sovereign-mobile`) under
the Sovereign project, not in this monorepo. It is developed and versioned
independently of the platform.

### 3.13 Cross-Plugin Data Sharing (RFC 0002; implemented in Task 0.5.11)

Plugins are isolated behind the SDK boundary — a plugin may not import another
plugin's internals or read its tables. Some user-desired flows, however, want one
plugin to enrich itself from another's data (so the user doesn't re-enter it).
Sovereign supports this through a **consent-gated, pull-based, read-only**
mechanism — specified in **RFC 0002 — Cross-plugin data sharing** — without
relaxing isolation.

Model: a **provider** plugin exposes named, versioned, read-only **data
contracts**; a **consumer** plugin requests a contract via `sdk.data.query(...)`
and a provider registers resolvers via `sdk.data.provide(...)`. Access is
permitted only when the user holds an explicit, revocable **consent grant** for
`(consumer, provider, contract)`; otherwise the call raises
`ConsentRequiredError`. Every read is platform-mediated (no direct cross-plugin
table access), tenant- and user-scoped, read-only, and audited. Consumers manage
their own grants from Account; Console provides oversight.

Two manifest permissions gate participation — `data:provide` and `data:consume`;
the SDK surface (`sdk.data`) is implemented. The `consent_grants` and
`data_access_log` tables are created by migration on startup. See
`docs/plugin-development.md` for provider/consumer code examples.

### 3.14 Activity Log (RFC 0005)

A scoped, durable audit/activity record. The platform — and, later, plugins —
emit events that the runtime records with actor and tenant context in an
`activity_log` table. Visibility is **by view**: a **personal feed** (Account →
Activity, available to every user including admins) shows the viewer's own
actions plus actions about them (`visibility = 'user' AND (actor_id = self OR
subject_user_id = self)`); a **platform-wide feed** (Console, admin-only) shows
the whole tenant. Auth lifecycle (login/session) is captured at the runtime
verify boundary, so `apps/auth` never writes the platform DB. A reserved
`sdk.activity.log()` surface and the `activity:write` permission let plugins
record their own scoped events (runtime-mediated — a plugin cannot forge actor
identity). The table, capture points, and views are deferred per RFC 0005.

### 3.15 Deployment & Upgrade Strategy (RFC 0006)

A tiered, low-downtime upgrade model for the single-machine Compose deployment
(NFR-01). The canonical upgrade unit is **pull-based versioned images** (CI-built,
semver-tagged; operators pull then recreate — build-from-source kept as a
fallback). Cutover is tiered: **graceful restart** by default (SIGTERM draining +
reverse-proxy retry) with **blue-green** as an advanced zero-downtime path.
Schema evolution moves to **drizzle-kit migrations** under an **expand-contract**
discipline (backward-compatible within a release; migrations ledger, single-writer
advisory lock, fail-fast). Backups become first-class — `sv backup`/`restore`
plus an automatic pre-upgrade snapshot — enabling **tag-pinned rollback**.
Deferred per RFC 0006; image publishing depends on the CI pipeline (Task 0.5.8).

### 3.16 User Data Portability (RFC 0007)

User-facing, self-service data ownership — distinct from the operator backup of
§3.15. A user exports their own data to a **versioned ZIP**, restores it, or
migrates it to another Sovereign instance. Because per-user data is scattered
across heterogeneously-owned plugin tables, plugins contribute their slice
through a reserved `sdk.portability` surface (`provideExport`/`provideImport`),
runtime-mediated so a plugin only ever touches the current user's own data.
Reserved `data:export`/`data:import` permissions gate participation; the Account
plugin gains a Data tab. Bundle format, flows, and UI are deferred per RFC 0007.

### 3.17 Security & Encryption Architecture (RFC 0008)

A layered, threat-model-driven roadmap. **Hardening** (security headers,
transport/TLS enforcement, Postgres SSL) and **at-rest encryption** (operator
disk/volume, app-level SQLCipher DB, encrypted backups/exports, avatar/blob
encryption) under a **local-keyfile envelope key hierarchy** (master KEK → wrapped
DEKs; no external dependency, fail-fast when enabled — the operator owns the key,
and losing it loses the data). **Field-level encryption** is specified behind a
reserved `sdk.crypto` surface + `crypto:use` permission; **zero-knowledge E2EE**
is charted honestly as the post-v1 direction (it breaks server-side search, SSR,
and server-side plugin processing). At-rest with server-held keys protects data
off the host (theft, backups) but **not** a curious operator or an RCE attacker —
only the zero-knowledge tier does. Amends §3.15 (encrypted backups) and §3.16
(encrypted exports). **Phasing:** Tier 0 (hardening) and Tier 1 (transport) target
**v1** (Task 0.5.16); at-rest encryption, field-level `sdk.crypto`, and
zero-knowledge E2EE (Tiers 2–4) are **post-v1** (Task 1.0.01). Deferred per
RFC 0008.

### 3.18 White-labeling (RFC 0027; Phase 1 implemented in Task 1.0.03)

Let any Sovereign operator replace Sovereign's visual identity with their own
brand. An operator deploys Sovereign as the core and customises the logo, app
name, favicon, colours, and email sender identity per tenant. The same
infrastructure enables the dual-licensing model (AGPL + commercial) where a
closed-source derivative ships under an operator's own brand.

**Config layering:** env-var defaults merged with per-tenant DB overrides. Env
vars define the baseline at deploy time; the `tenant_branding` table stores
per-tenant overrides. Single-tenant operators get a pure env-var experience;
multi-tenant operators configure each tenant in Console.

**New `BRAND_*` env vars (all optional, Sovereign defaults apply when unset):**
`BRAND_NAME`, `BRAND_LOGO`, `BRAND_LOGO_DARK`, `BRAND_FAVICON`,
`BRAND_PRIMARY_COLOR` (sets `--sv-color-accent`), `BRAND_EMAIL_FROM_NAME`,
`BRAND_EMAIL_LOGO`.

**`tenant_branding` table** (`packages/db`): dialect-aware DDL bootstrapped
alongside the default-tenant seed. Written via `setTenantBranding()` (upsert);
read via `getTenantBranding()` which merges DB values over env defaults.
`brand_primary` is validated hex `/^#[0-9a-fA-F]{6}$/` at write time — a
malformed value injected into a `<style>` block would be CSS injection.

**`--sv-brand-*` token namespace** (separate from `--sv-color-*` semantic
tokens): `--sv-brand-logo`, `--sv-brand-logo-dark`, `--sv-brand-favicon`. Brand
tokens carry URLs, not colours; they are set by the operator once and do not
change with dark mode. The brand name is a React prop from `BrandProvider`, not
a CSS custom property — CSS `content:` cannot supply rendered text content.

**`BrandProvider`** (`runtime/src/brand-provider.tsx`): React server component.
Reads `tenant_branding` from the platform DB, merges with env defaults, renders
a `<style>` block setting `--sv-brand-*` tokens and (if `brandPrimary` is set)
`--sv-color-accent` / `--sv-color-accent-hover` (HSL lightness delta derivation,
`ACCENT_HOVER_LIGHTNESS_DELTA = 8`). Called from `(platform)/layout.tsx` and
the auth server root layout. No in-process brand cache — the per-request render
boundary provides isolation; brand values change rarely.

**Logo serving and CSP:** uploaded logos stored at `data/brand/<tenant_id>.<ext>`
(same volume as `data/avatars/`), served by `GET /api/brand/logo[?dark=1]` and
`GET /api/brand/favicon` — excluded from the middleware session gate (must load
on the login page). MIME type validated + 2 MB cap at upload. External URLs
entered by the operator are stored as-is; the preferred approach for CSP
compliance is proxying through `/api/brand/proxy?url=…` (keeps `img-src 'self'`
strict) rather than widening `img-src`.

**Auth server login page:** obtains brand values by fetching
`GET <runtime>/api/admin/tenant-branding` at render time (proxy approach — one
store, no dual-write). Fails gracefully to Sovereign defaults if the runtime is
unreachable. An in-memory TTL cache (60 s) prevents a brand fetch on every login
render.

**Email templates:** `packages/mailer` `MailOptions` gains an optional
`branding?: { name, logoUrl? }` parameter. Hosted URL (not `data:` URI — Gmail
and most webmail strip base64 URIs); template degrades gracefully with text
fallback when images are blocked.

**PWA manifest:** becomes a served route (`GET /manifest.webmanifest`) when
branding is configured. Cached SW users see the old name/icons until the SW
updates — acceptable for v1; documented in `docs/self-hosting.md`.

**`sdk.platform.getConfig()` extension:** gains `brandName` (falls back to
`tenantName`) and `brandPrimaryColor?` (validated hex or undefined), enabling
plugins to display the instance name and primary colour without reading CSS
variables.

**Phasing (post-v1):** Phase 1 — `tenant_branding` table, env vars,
`--sv-brand-*` tokens, `BrandProvider`, Console branding form, `getConfig()`
extension. Phase 2 — branded email templates, auth login page branding via
runtime proxy. Phase 3 — dynamic PWA manifest route, dynamic favicon route.
Published packages (`@sovereignfs/ui`, `@sovereignfs/sdk`) receive additive
minor bumps only. See RFC 0027 (`docs/rfcs/0027-white-labeling.md`) for the
full design and security analysis.

### 3.19 Desktop App Shell (RFC 0038; post-v1 plan)

Desktop support is deferred to post-v1 but the approach is decided.

**Model: universal shell + instance URL.**
A single app distributed as a direct download for macOS (`.dmg`), Windows
(`.exe`/`.msi`), and Linux (`.AppImage`/`.deb`). On first launch the user enters
the URL of their self-hosted Sovereign instance. The shell loads that URL in a
WebView. All Sovereign functionality — auth, plugins, shell layout — is served by
the user's own instance and runs inside the WebView unchanged. Switching between
multiple instances is supported. This is the same pattern as the mobile shell
(§3.12) and the same distribution model used by Nextcloud, Bitwarden, and Element
for their desktop clients.

**Shell technology: Tauri 2.x.**
A single TypeScript codebase for macOS, Windows, and Linux. The shell's logic is
minimal: instance URL onboarding on first launch, persistent URL storage, WebView
loading, and native permission declarations. Tauri is chosen over Electron because:

- System WebView (WKWebView on macOS, WebView2 on Windows, WebKitGTK on Linux) —
  no bundled Chromium; ~5 MB binary vs ~150 MB
- TypeScript throughout — consistent with the rest of the stack
- Rust only required for deep native APIs; all shell logic is TypeScript
- Tauri plugin system mirrors Capacitor's pattern exactly — native capabilities
  added incrementally without architectural rework

**Device API strategy — same three tiers as mobile:**

| Tier            | Technology                                                 | Examples                                                          | Works in browser?     |
| --------------- | ---------------------------------------------------------- | ----------------------------------------------------------------- | --------------------- |
| Web APIs        | Standard browser APIs, work natively in WebView            | `navigator.geolocation`, `getUserMedia`, Web Notifications        | ✅                    |
| Tauri plugins   | JS bridge to native OS capabilities                        | System tray, OS notifications, keychain, deep links, auto-updater | ❌ (shell only)       |
| SDK abstraction | `sdk.device.*` detects environment, routes to correct tier | `sdk.device.notify()`, `sdk.device.secureStore.*`                 | ✅ (Web API fallback) |

Plugin developers use `sdk.device.*` only — identical contract to mobile. The SDK
gains a `"desktop"` environment check alongside `"browser"` / `"native"` (mobile).
No plugin code changes required when the desktop shell launches.

**Capability roadmap:**

| Capability                                    | Task | Phase   |
| --------------------------------------------- | ---- | ------- |
| Scaffold, onboarding, WebView, multi-instance | 17.1 | post-v1 |
| System tray + OS notifications                | 17.2 | post-v1 |
| Deep link scheme (`sovereign://`)             | 17.3 | post-v1 |
| Keychain credential storage                   | 17.4 | post-v1 |
| Auto-updater                                  | 17.5 | post-v1 |
| Mac App Store distribution                    | 17.6 | post-v1 |

**Distribution:** Direct download via GitHub Releases for all platforms. Mac App
Store distribution is deferred (requires sandboxing entitlements and App Review).
macOS direct-download `.dmg` requires code signing and Gatekeeper notarization even
outside the App Store (macOS 10.15+); Tauri's CI pipeline handles this.

The shell app lives in a separate repository (`sovereign-desktop`) under the
Sovereign project, not in this monorepo. It is developed and versioned
independently of the platform.

See RFC 0038 (`docs/rfcs/0038-desktop-app-shell.md`) for the full design,
alternatives considered, and open questions.

---

## 4. Software Requirements Specification

### 4.1 User Roles and Capabilities

**Roles** follow a namespaced pattern: `platform:` prefix for platform-level roles. This scales to plugin-level roles in the future (`tasks:admin`, `splitify:owner` etc.) without naming conflicts.

| Role             | Description                                                                                     |
| ---------------- | ----------------------------------------------------------------------------------------------- |
| `platform:user`  | Assigned to every user by default on registration. Access to installed plugins and own profile. |
| `platform:admin` | Full platform access. Manages users, plugins, and tenant configuration.                         |

The first user to register on a fresh instance is automatically assigned `platform:admin`. All subsequent users receive `platform:user` by default and can be promoted by an admin via Console.

**Capability matrix:**

Capabilities are hardcoded per role in v1 — defined in the runtime, not stored in the database. The data model is designed to support database-driven capability assignment in a future version without requiring a schema change.

| Capability                                                    | `platform:user` | `platform:admin` |
| ------------------------------------------------------------- | --------------- | ---------------- |
| `plugin:access` — access installed and enabled plugins        | ✓               | ✓                |
| `profile:manage` — manage own profile and credentials         | ✓               | ✓                |
| `console:access` — access the Console plugin                  | ✗               | ✓                |
| `user:manage` — invite, deactivate, and assign roles to users | ✗               | ✓                |
| `plugin:manage` — install, remove, enable, disable plugins    | ✗               | ✓                |
| `tenant:configure` — configure tenant settings                | ✗               | ✓                |

Capabilities use the same namespaced pattern as roles and connect directly to the manifest system — a plugin declaring `"adminOnly": true` in its manifest maps to requiring `console:access` capability at the middleware level.

Granular per-user capability overrides and per-plugin role assignments are explicitly deferred to a future version.

### 4.2 Functional Requirements — Platform

| ID     | Requirement                                                                                                                                                                                                                                                                                                                                                                                        |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PLT-01 | The platform must serve a home experience at `/` listing all installed and enabled plugins the current user has access to. Provided by the Launcher plugin (LCH-01) by default; `/` resolves to the configured root plugin (PLT-14).                                                                                                                                                               |
| PLT-02 | The runtime must enforce session authentication on all plugin routes. Unauthenticated requests redirect to the login page.                                                                                                                                                                                                                                                                         |
| PLT-03 | The runtime must enforce `platform:admin` role on all Console routes. Non-admin authenticated requests receive a 403.                                                                                                                                                                                                                                                                              |
| PLT-04 | The runtime must read installed plugins from `runtime/generated/registry.ts` at startup.                                                                                                                                                                                                                                                                                                           |
| PLT-05 | The runtime must apply all pending database migrations (platform + plugins) on startup before accepting requests.                                                                                                                                                                                                                                                                                  |
| PLT-06 | The runtime must expose platform config (tenant name, feature flags) via `sdk.platform.getConfig()`.                                                                                                                                                                                                                                                                                               |
| PLT-07 | The pre-build generate script must validate all plugin manifests and fail the build if any manifest is invalid.                                                                                                                                                                                                                                                                                    |
| PLT-08 | The platform shell must include a consistent navigation component showing the active plugin and links to all accessible plugins.                                                                                                                                                                                                                                                                   |
| PLT-09 | The runtime must be installable as a PWA from a supported browser.                                                                                                                                                                                                                                                                                                                                 |
| PLT-10 | Plugin SDK boundary violations (direct imports from `runtime/src`) must be caught by ESLint at CI.                                                                                                                                                                                                                                                                                                 |
| PLT-11 | The desktop sidebar must have three sections: (1) top branding header, (2) middle plugin icon area, (3) bottom fixed chrome with Console (admin only) and Account avatar (all users).                                                                                                                                                                                                              |
| PLT-12 | The middle sidebar section must show one icon per accessible, enabled, non-chrome plugin. The first icon is always the configured root plugin, points to `/`, and cannot be removed or reordered by users in v1. The root plugin is not duplicated among the remaining icons. When the Launcher is not the root plugin, it appears in the middle section as a regular icon linking to `/launcher`. |
| PLT-13 | The mobile footer launcher must mirror the middle sidebar section. The Account avatar appears in the mobile header; the Console icon appears in the footer launcher (admin only).                                                                                                                                                                                                                  |
| PLT-14 | The platform must maintain a configurable `root_plugin_id` setting (default: `fs.sovereign.launcher`). Navigating to `/` serves the root plugin in place — the runtime rewrites `/` to the root plugin's `routePrefix` (the URL stays `/`; the plugin is also reachable at its own prefix).                                                                                                        |
| PLT-15 | A `platform_settings` table in `packages/db` stores key-value platform configuration scoped by `tenant_id`. Initial key: `root_plugin_id`.                                                                                                                                                                                                                                                         |
| PLT-16 | The runtime reserves the top-level `/api/*` namespace for plugin-served public APIs. Requests under `/api/*` are exempt from session-redirect middleware (the serving plugin owns authentication); the runtime rewrites `/api/<segment>/*` to the registered API-provider plugin's serve route. One provider per instance in v1; with no provider installed, `/api/*` returns 404.                 |

### 4.3 Functional Requirements — Auth

| ID      | Requirement                                                                                                                                                                                                                                     |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AUTH-01 | Users must be able to log in with email and password.                                                                                                                                                                                           |
| AUTH-02 | Users must be able to log out, invalidating their session and clearing the session-cache cookie so logout takes effect immediately (not after the cache TTL).                                                                                   |
| AUTH-03 | Registration must support an invite-only toggle. When enabled, only users with a valid invite token can register. When disabled, open registration is permitted.                                                                                |
| AUTH-04 | Sessions must be persisted via httpOnly cookies.                                                                                                                                                                                                |
| AUTH-05 | The runtime middleware must call `/api/verify` on the auth server for session verification in v0.3. From v0.5, the runtime must verify session tokens locally using the shared secret without a round-trip to the auth server on every request. |
| AUTH-06 | The auth server must expose a `/api/verify` endpoint for explicit token verification when needed.                                                                                                                                               |
| AUTH-07 | Password reset via email must be supported.                                                                                                                                                                                                     |
| AUTH-08 | The first user to register on a fresh instance must receive the `platform:admin` role automatically. All subsequent users receive `platform:user` by default.                                                                                   |

### 4.4 Functional Requirements — Console Plugin

| ID     | Requirement                                                                                                                                                                         |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CON-01 | Console is accessible only to users with the `platform:admin` role (`console:access` capability).                                                                                   |
| CON-02 | Admin must be able to view a list of all registered users with their role, status, and join date.                                                                                   |
| CON-03 | Admin must be able to invite new users by email (generates an invite token, sends invite email).                                                                                    |
| CON-04 | Admin must be able to deactivate and reactivate user accounts.                                                                                                                      |
| CON-05 | Admin must be able to change a user's role between `platform:admin` and `platform:user`.                                                                                            |
| CON-06 | Admin must be able to view all installed plugins, their version, and their enabled/disabled status.                                                                                 |
| CON-07 | Admin must be able to enable or disable an installed plugin (disabling hides it from the launcher and blocks its routes).                                                           |
| CON-08 | Admin must be able to configure tenant settings: tenant name.                                                                                                                       |
| CON-09 | Console must display a system health summary: runtime version, database type and connection status, auth server status, disk usage (SQLite file size or Postgres connection).       |
| CON-10 | Admin must be able to toggle invite-only registration from Console without editing environment config.                                                                              |
| CON-11 | Admin must be able to view the current root plugin and change it to any installed, enabled, non-adminOnly, non-overlay plugin. The change takes effect immediately without restart. |

### 4.5 Non-Functional Requirements

| ID     | Requirement                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| NFR-01 | The full stack must be self-hostable on a single machine with Docker Compose.                                                                                                                                                                                                                                                                                                                                                |
| NFR-02 | No external service dependency for core functionality. Email is optional (SMTP config).                                                                                                                                                                                                                                                                                                                                      |
| NFR-03 | Database must be switchable between SQLite and PostgreSQL via environment configuration with no code changes.                                                                                                                                                                                                                                                                                                                |
| NFR-04 | The SDK public API must be stable across patch versions. Breaking changes require a minor version bump and a migration note.                                                                                                                                                                                                                                                                                                 |
| NFR-05 | All plugin manifests must be validated at build time. An invalid manifest must fail the build.                                                                                                                                                                                                                                                                                                                               |
| NFR-06 | Plugin code must not import from `runtime/src` directly. ESLint enforces this.                                                                                                                                                                                                                                                                                                                                               |
| NFR-07 | The runtime must start and be ready to serve requests within 10 seconds on modest hardware (2-core VPS, 1GB RAM).                                                                                                                                                                                                                                                                                                            |
| NFR-08 | Authentication tokens must use signed JWTs. Secrets must be configurable via environment variables and must not have default values.                                                                                                                                                                                                                                                                                         |
| NFR-09 | All user passwords must be hashed with a strong adaptive algorithm (bcrypt or argon2, as provided by better-auth).                                                                                                                                                                                                                                                                                                           |
| NFR-10 | The project must include a documented upgrade path between versions (migration guide in docs).                                                                                                                                                                                                                                                                                                                               |
| NFR-11 | All platform-owned UI (runtime shell, `apps/auth`, Console, Launcher, Account) must meet WCAG 2.1 AA. Automated enforcement via `eslint-plugin-jsx-a11y` (recommended ruleset, no inline suppressions). `@sovereignfs/ui` components must expose `:focus-visible` outlines via `--sv-color-focus-ring` and honour `prefers-reduced-motion`. Plugin developers must follow the a11y contract in `docs/plugin-development.md`. |

### 4.6 Out of Scope (v1)

- Multi-tenancy
- Plugin sandboxing or process isolation
- Runtime dynamic plugin loading (module federation, iframes)
- OAuth provider functionality (Sovereign as an IdP)
- Per-plugin isolated database (`"database": "isolated"`) — **implemented (RFC 0004)**; see §3.7
- End-to-end encryption
- Native mobile app (planned post-v1 — see §3.12 for the decided approach)
- Real-time features (WebSockets, live collaboration)
- Per-plugin permission assignment for individual users
- Public-facing plugin marketplace or install UI
- Federated instances
- White-labeling / tenant branding Phase 2–3 (branded email + auth page + dynamic PWA manifest — see §3.18; Phase 1 is implemented)

---

## 5. Plugin Manifest Reference

```typescript
interface SovereignManifest {
  // Schema version for forward compatibility
  schemaVersion: number;

  // Unique identifier. Format varies by plugin type:
  // platform:  fs.sovereign.*         — project-defined prefix (e.g. fs.sovereign.console)
  // sovereign: io.openfs.sovereign.*  — domain-backed via openfs.io (e.g. io.openfs.sovereign.tasks)
  // community: reverse-DNS of a domain the author controls (e.g. com.acme.myplugin)
  //            Authors without a domain may use io.github.<org>.* as a legitimate fallback.
  id: string;

  // Display name
  name: string;

  // Semver
  version: string;

  // Optional human-readable description
  description?: string;

  // Database isolation preference (RFC 0004)
  // "shared"   — uses the platform database, slug-prefixed tables (default)
  // "isolated" — dedicated SQLite file or Postgres schema; provisioned on first use, dropped on uninstall
  database?: 'shared' | 'isolated';

  // Plugin type — determines origin and trust level
  // "platform"  — ships in the monorepo, maintained by the Sovereign team
  // "sovereign" — separate repo, maintained by the Sovereign team (e.g. Tasks, Splitify)
  // "community" — third-party, any maintainer, any source
  type: 'platform' | 'sovereign' | 'community';

  // How the plugin is rendered (only "native" implemented in v1)
  // All types except "native" are subject to change before implementation
  runtime: 'native' | 'static' | 'iframe-local' | 'iframe-remote' | 'external';

  // URL prefix for the plugin under the runtime
  routePrefix: string;

  // SDK capabilities the plugin uses
  permissions: Permission[];

  // Shell layout preference
  // "default" — full shell (sidebar on desktop, header + footer on mobile). Applied when field is omitted.
  // "minimal" — shell chrome hidden entirely, content area only. Useful for immersive or full-bleed plugins.
  // "overlay" — renders as a dismissable dialog over the current page; full-page fallback on hard navigation (RFC 0001).
  shell?: 'default' | 'minimal' | 'overlay';

  // Per-shell tuning. Only valid when shell is "overlay" (validation rejects it otherwise).
  // overlaySize sets the dialog size: "lg" (default) fills the viewport minus a fixed margin;
  // "md"/"sm" are progressively smaller fixed, centred boxes. Sizes are fixed (never content-driven).
  shellConfig?: {
    overlaySize?: 'sm' | 'md' | 'lg';
  };

  // Path to an SVG icon file within the plugin directory (e.g. "icon.svg").
  // Used in the sidebar middle section and the Launcher grid.
  // If omitted, the runtime generates a monogram from the plugin name's initials.
  icon?: string;

  // If true, plugin requires platform:admin role (console:access capability)
  adminOnly?: boolean;

  // If true, this plugin serves the public /api/* namespace (PLT-16). At most
  // one provider per instance; the runtime rewrites /api/<slug>/* to the
  // provider's serve route (<routePrefix>/serve/<slug>/*), exempt from the
  // session gate. With no provider installed, /api/* returns 404.
  apiProvider?: boolean;

  // Minimum Sovereign platform version required
  compatibility: {
    minPlatformVersion: string;
  };

  // Required when type is "sovereign" or "community"
  repository?: string;
}

type Permission =
  | 'auth:session'
  | 'db:readWrite'
  | 'db:readOnly'
  | 'mailer:send'
  | 'storage:readWrite' // not implemented v1
  | 'notifications:send' // not implemented v1
  | 'events:publish' // not implemented v1
  | 'events:subscribe' // not implemented v1
  | 'data:provide' // cross-plugin data sharing — expose contracts (RFC 0002); reserved, not implemented v1
  | 'data:consume' // cross-plugin data sharing — consume contracts (RFC 0002); reserved, not implemented v1
  | 'activity:write' // activity log — record scoped events via sdk.activity (RFC 0005); reserved, not implemented v1
  | 'data:export' // user data portability — contribute to a user's export (RFC 0007); reserved, not implemented v1
  | 'data:import' // user data portability — accept imported user data (RFC 0007); reserved, not implemented v1
  | 'crypto:use' // field-level encryption — encrypt/decrypt fields via sdk.crypto (RFC 0008); reserved, not implemented v1
  | 'admin:*'; // grants admin-only routes. Equivalent to declaring adminOnly: true in the manifest — the middleware maps adminOnly to this capability check. Prefer adminOnly in the manifest; admin:* in permissions is for future fine-grained plugin-level admin scopes.
```

---

## 6. Decision Log

| Date     | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Rationale                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Jun 2026 | Plugin type field renamed from `source` to `type`; values changed to `platform`, `sovereign`, `community`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | `source` described origin mechanics, not plugin classification. `type` is semantically cleaner. `sovereign` distinguishes Sovereign-maintained external plugins from true third-party community plugins. `workspace` reserved as a future user-facing concept — likely an organisational layer within a tenant (one tenant may have multiple workspaces), distinct from the deployment/tenant boundary.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Jun 2026 | Drizzle ORM over Prisma                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Lighter, supports SQLite and Postgres with same API, better fit for Next.js server actions.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Jun 2026 | Single-tenant per deployment in v1                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Target use case is personal/small-group. Multi-tenancy adds complexity with no near-term benefit. `tenant_id` included in schema for future path.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Jun 2026 | Console as core plugin, not a separate app                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Consistent with plugin architecture. Avoids running a third Next.js process. Admin scope enforced by middleware.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Jun 2026 | SQLite default, Postgres optional                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Zero-config for self-hosters. Postgres switch is an environment config change only.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Jun 2026 | SDK packages under MIT, runtime under AGPL-3.0                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Lowers barrier for plugin developers while protecting the core runtime.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Jun 2026 | Code formatting: Prettier; linting: ESLint 9 flat config + typescript-eslint; pre-commit: simple-git-hooks + lint-staged                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | ESLint is required for the custom `no-restricted-imports` SDK boundary rule — Biome has no equivalent plugin system yet, making a hybrid setup necessary. Prettier and ESLint handle separate concerns (formatting vs correctness); `eslint-config-prettier` resolves conflicts. `simple-git-hooks` is chosen over Husky — no install script, no shell files, single `package.json` entry. `lint-staged` scopes hooks to staged files only for speed. `.editorconfig` provides editor-level baseline independent of tooling.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Jun 2026 | Native mobile app deferred to post-v1; approach decided                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | PWA covers the install-from-browser use case for v1. Native app is planned post-v1 as a universal Capacitor shell — one App Store binary, user enters their instance URL on first launch. Same pattern as Nextcloud, Bitwarden, Element. Deferred due to scope, not technical dead end.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Jun 2026 | Capacitor chosen over Hotwire Native for mobile shell                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Capacitor provides a single TypeScript codebase for iOS + Android, a rich plugin ecosystem for device APIs, and a standardised bridge pattern that integrates cleanly with the SDK. Hotwire Native gives a better raw native feel but requires Swift + Kotlin, no plugin ecosystem, and every device API integration is a custom bridge. For a minimal shell (URL config + WebView) the cross-platform and ecosystem benefits of Capacitor outweigh the native-feel advantage of Hotwire Native.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Jun 2026 | Device APIs exposed via `sdk.device.*`; three-tier implementation strategy                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Web APIs (geolocation, getUserMedia etc.) work natively in WebViews and cover most cases. Capacitor plugins cover the remainder (native photo picker, APNs/FCM push, biometric auth, haptics). Plugin developers use `sdk.device.*` only — the SDK detects the environment and routes to the correct tier. Plugins are portable across browser, PWA, and native shell without changes.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Jun 2026 | Plugin schema isolation via table name prefix                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Simpler than Postgres schemas. One migration runner, one connection, no cross-plugin query complexity.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Jun 2026 | `packages/ui` uses CSS custom properties + CSS Modules; no Tailwind                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Tailwind creates ongoing content-scan config maintenance across all plugins, cannot ship pre-built CSS from a shared library, and fights component abstraction. CSS custom properties (plain `.css` files) are universally consumable — plugin developers reference tokens from any CSS without a JS import. CSS Modules are built into Next.js with no extra deps, RSC-safe, and familiar. Two-tier token architecture: primitives (raw scale) + semantic (contextual meaning, `--sv-color-surface` etc.). All tokens prefixed `--sv-*` — consistent with `sv` CLI identity, short, unambiguous. Semantic layer is the tenant-theming surface (CON-08); primitives stay fixed.                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Jun 2026 | `sv` CLI built with `citty` + `consola`, TypeScript via `tsx`; monorepo-internal in v1                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | `citty` is lightweight, TypeScript-first, and maps cleanly to the `sv plugin add/remove` nested command structure. `consola` is the natural pairing for consistent terminal output (info/success/warn/error). Running via `tsx` keeps the CLI consistent with `scripts/` and avoids a separate compile step. CLI is not distributed as a standalone npm package in v1 — self-hosters run it from their cloned repo. Global install deferred.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Jun 2026 | Three-tier build model: tsup for packages, `next build` for apps, generate script for plugin composition                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Packages (db, manifest, mailer, ui, sdk) are compiled with `tsup` — fast, consistent, ESM output with TypeScript declarations. Apps (runtime, auth) use `next build`. Plugins are not compiled independently — the generate script source-composes them into the runtime, and they are compiled as part of the runtime's `next build`. Turborepo orchestrates the correct order.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Jun 2026 | ESM only for all package output                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Next.js 15, Vite, and current tooling handle ESM natively. CJS compat shims add complexity with no benefit for this stack. All packages output ESM.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Jun 2026 | Plugin id namespace: three-tier by type — `fs.sovereign.*` / `io.openfs.sovereign.*` / community reverse-DNS                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | `com.sovereign.*` squatted a domain the project does not own. Three tiers: (1) `platform` plugins use `fs.sovereign.*` — a project-defined prefix, no collision risk as they are fully in-monorepo; (2) `sovereign` plugins use `io.openfs.sovereign.*` — domain-backed via openfs.io which the project controls; (3) `community` plugins use the reverse-DNS of a domain the author controls, with `io.github.<org>.*` as a legitimate fallback for authors without a domain.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Jun 2026 | npm-published packages: `@sovereignfs/sdk` and `@sovereignfs/ui` only                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | `sdk` is the plugin↔platform contract — external plugin developers must install it. `ui` is the design system — plugin developers install it to use components and tokens. All other packages (db, manifest, mailer, tsconfig) are workspace-internal infrastructure; publishing them would expose platform internals with no benefit. They are marked `"private": true`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Jun 2026 | Single owned npm scope `@sovereignfs/*` for all packages                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | A split scope was considered (public `@commonsengine/sovereign-*` + internal `@sovereign/*`) and rejected: the internal `@sovereign/*` alias references an npm scope owned by a third party, which is a latent dependency-confusion footgun (safe only while every internal dependency stays `workspace:*` and `private`). Owning one scope and using it everywhere closes that gap. `@sovereign` is taken on npm and `@sovereignos`/`-stack`/`-core` collide with existing products, so `@sovereignfs` is the owned scope (`fs` = _federated systems_, signalling the project's long-term federated direction; federation itself remains a post-v1 non-goal per §1.4). One scope means one mental model, simpler tooling globs, and no rename if an internal package is ever published. The publish/no-publish boundary is enforced by `"private": true` in each package's `package.json`, not by the scope name.                                                                                                                                                                                     |
| Jun 2026 | `packages/ui` CSS strategy: CSS Modules marked external in tsup; token CSS shipped as plain files                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | tsup (esbuild) does not process CSS Modules — class name scoping requires the consuming bundler. All consumers of `packages/ui` are Next.js apps (the runtime and plugin route segments compiled by the runtime), so Next.js handles CSS Modules natively. Token CSS files (`.css`, not `.module.css`) are plain CSS and are shipped as-is; the runtime shell imports them globally so tokens are available everywhere without a per-plugin import.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Jun 2026 | Plugin developers install `@sovereignfs/sdk` and `@sovereignfs/ui` from npm; all other packages are unreachable                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Plugin developers add `@sovereignfs/sdk` and `@sovereignfs/ui` as dependencies in their plugin's `package.json`. They never interact with db, mailer, manifest, or tsconfig directly (those are `private`). This enforces the plugin contract boundary at the package level, complementing the ESLint `no-restricted-imports` rule.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Jun 2026 | Dev DX: `transpilePackages` replaces `tsup --watch`; packages export TypeScript source for workspace consumption                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | In dev, all workspace packages expose their TypeScript source via `exports: { ".": "./src/index.ts" }`. The consuming Next.js apps (runtime and apps/auth) list all workspace packages in `transpilePackages` in their `next.config.ts`. Next.js/SWC compiles package source directly as part of its own compilation pass — no intermediate `dist/` build, no watch process. Changes to any package trigger HMR in the consuming app instantly. tsup is production-only (generates `dist/` for npm publish and Docker builds).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Jun 2026 | `resolve.symlinks: false` in runtime webpack config for plugin HMR                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | In dev, plugins are symlinked into `runtime/app/plugins/[id]/` by the generate script. Webpack's default behaviour resolves symlinks to their real filesystem path before setting up file watchers, which breaks HMR — changes to `plugins/[id]/app/` are not detected. Setting `config.resolve.symlinks = false` makes webpack use the symlink path as-is; file changes in the plugin source directory propagate through the symlink and trigger HMR correctly.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Jun 2026 | Generate script runs once on dev startup (sync) then enters watch mode; no manual `pnpm generate` needed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | The runtime's `dev` script runs `tsx scripts/generate-registry.ts` synchronously on startup to create/update plugin symlinks, then starts the Next.js dev server. The generate script also supports a `--watch` flag for ongoing plugin directory monitoring. Developers never need to run `pnpm generate` manually during a dev session — the startup sequence handles it. Adding a new plugin directory during a running dev session triggers automatic re-linking.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Jun 2026 | Docker Compose is the canonical deployment path; PM2 added as the supported non-Docker alternative (RFC 0026 Phase 1)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Two containers (runtime + auth) on one Compose file. Docker's own restart policy supervises processes — no in-container PM2. PM2 was initially dropped to keep the supported surface small, but was reinstated in Task 0.5.30 (RFC 0026 Phase 1) for operators who cannot use Docker. `sv setup pm2` generates a PM2 ecosystem config pointing to the standalone server.js outputs; `sv serve` gains a 30-second auth health-gate. systemd is the planned post-v1 Linux alternative (Task 1.0.06). Next.js `output: 'standalone'` makes each app a self-contained `node server.js`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Jun 2026 | Auth server is internal-only; runtime is the only externally exposed service                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | The auth container is never host-mapped — it is reachable only on the internal Docker network via `SOVEREIGN_AUTH_URL` (`http://auth:3001`). The runtime is the single public entry point, facing the reverse proxy. This removes the auth surface from the public network.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Jun 2026 | Fixed internal ports (3000 runtime / 3001 auth); host ports differ by env (4000/4001 default in prod)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Containers always listen on 3000/3001 internally; the dev-vs-prod distinction is a host port mapping concern, not an app config change. Production host defaults are 4000 (runtime) and 4001 (auth, though auth is not host-mapped). Overridable via `RUNTIME_PORT` / `AUTH_PORT`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Jun 2026 | Shell sidebar is three sections: top branding, middle plugin icons (fixed order v1; user-customisable v1.1), bottom hardcoded chrome (Console + Account avatar). Root plugin is admin-configurable via Console; default is `fs.sovereign.launcher`. Platform maps `/` to the root plugin's `routePrefix` via a `platform_settings` table (`root_plugin_id` key). Launcher and Account are platform plugins (`type: platform`) shipping in the monorepo, not sovereign/community plugins. Manifest gains an optional `icon` field (SVG path relative to plugin root; runtime generates a monogram if absent). | Launcher and Account were missing from the original spec. The three-section sidebar and root plugin configurability are load-bearing for the shell scaffold (Task 0.3.10) and Console (Task 0.4.1). The `icon` field is required for sidebar and Launcher grid rendering.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Jun 2026 | npm publishing: per-package version tags trigger a CI publish job                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | `@sovereignfs/sdk` and `@sovereignfs/ui` have independent release cycles (SDK changes can be breaking; UI is mostly additive), so they are released on per-package tags (`sdk-v*`, `ui-v*`) rather than a single repo-wide tag. A GitHub Actions job builds the tagged package with tsup and runs `pnpm publish` using a `NODE_AUTH_TOKEN` secret. No other packages are published.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Jun 2026 | Dev email capture via Mailpit (Docker service + native binary); mailer needs no mock-mode                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | The mailer speaks standard SMTP, so "where mail goes in dev" is config-only — no special test transport in the package. Mailpit (a single-binary SMTP server with a web inbox, successor to MailHog) is the standard: a `mailpit` service in `docker-compose.yml` for Docker dev, or the native `mailpit` binary (brew / install script / `go install`) for non-Docker dev — both expose SMTP on 1025 and the inbox on 8025, so `.env` is identical across modes. Email is off by default (SMTP_HOST unset → `send()` no-ops); developers opt in by pointing SMTP_HOST at Mailpit. Ethereal (nodemailer test accounts, preview URL per message) is the no-install fallback. Unit tests mock nodemailer.                                                                                                                                                                                                                                                                                                                                                                                                |
| Jun 2026 | Design system identity is monochrome; dark mode ships via `[data-theme]`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | The v1 visual identity is a neutral grey scale with a single near-black/near-white accent — restraint over decoration; a tenant adds colour by overriding `--sv-color-accent`. Dark mode ships in `semantic.css` as a `[data-theme='dark']` block that swaps only semantic token values, validating the core theming claim: themes (dark and tenant) change CSS variables at `:root`/`[data-theme]`, never components. Scale tokens (space/radius/type) are theme-stable and used directly; only the semantic colour layer is the theming surface.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Jun 2026 | `packages/ui` builds with tsup externalising CSS and React                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | tsup/esbuild can't scope-hash CSS Modules, so both CSS Modules and token CSS are marked external; the consuming Next.js app processes the CSS — via `transpilePackages` (the `src` tree) in v1, or its own bundler when installed from npm. React is external too and esbuild uses the automatic JSX runtime. An earlier note proposing `external` + a copy loader together was dropped (they conflict in esbuild). Full npm-publish CSS packaging (resolving the externalised `.css` imports inside `dist/`) is finalised in Task 0.5.8.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Jun 2026 | React pinned via the pnpm catalog; component tests use Vitest + Testing Library + jsdom                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | `react`, `react-dom`, and their `@types` join the pnpm `catalog:` (alongside typescript/tsup) since runtime, auth, and plugins all depend on them — one version repo-wide. React is a `peerDependency` of `@sovereignfs/ui`. Component tests run under Vitest with the jsdom environment (opted in per-file via `// @vitest-environment jsdom`) and `@testing-library/react`; `vitest.config` resolves CSS Module class names non-scoped so tests can assert on them.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Jun 2026 | SDK is interface stubs in v1; runtime injects the real implementations; `DrizzleClient` is opaque                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | `packages/sdk` defines the v1 surface (`auth`, `db`, `mailer`, `platform`) as stubs that throw `NotImplementedError` — the Sovereign runtime supplies the concrete implementations at call time (wired in later tasks). Post-v1 surfaces (`storage`, `notifications`, `events`) throw with an explicit "not implemented in Sovereign v1" message. `DrizzleClient` is typed opaque (`unknown`) at the contract level so the published SDK takes no dependency on a dialect; the runtime provides the concrete instance (refined when `sdk.db` is wired). The published SDK has no runtime dependencies.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Jun 2026 | `apps/auth` is self-contained; owns its identity database and login UI; does not use `packages/db`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | The auth server isolates the identity surface (passwords, credentials) from application data. better-auth manages its own database (its standard `user`/`session`/`account`/`verification` schema + a small `invites` table) — `packages/db` is for the runtime and plugins only. The auth server hosts its own login/registration UI and consumes only `@sovereignfs/ui` from the workspace, so the screens match the platform. `role` is a non-editable `additionalField`; first-user-admin runs in a `databaseHooks.user.create` hook. Session sharing works because cookies are host-scoped (not port-scoped): the cookie set by the auth server reaches the runtime on the same host (dev) or same domain behind one reverse proxy (prod). This supersedes the earlier "user records live in `packages/db` via the auth server" note; the reverse-proxy exposure topology is settled in the deployment tasks.                                                                                                                                                                                     |
| Jun 2026 | Runtime verifies sessions in middleware via `/api/verify` and injects the user as request headers; `SOVEREIGN_AUTH_SECRET` deferred to v0.5                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | The runtime's middleware forwards the request cookie to the auth server's `/api/verify`; on success it injects `x-sovereign-user-{id,email,role}` request headers (read by server components, e.g. the shell's admin-only Console icon), on 401 it redirects to `/login` (which redirects to the auth login UI). This is the v0.3 approach (AUTH-05); local JWT verification with `SOVEREIGN_AUTH_SECRET` arrives at v0.5, so that secret is not required by the runtime yet (the "no secret defaults" rule applies once it is used).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Jun 2026 | `runtime/generated/registry.ts` is a committed empty placeholder; `runtime/app/plugins/` is gitignored                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | The generate script (`scripts/generate-registry.ts`) writes the typed plugin registry and symlinks (dev) / copies (prod) each plugin's `app/` into `runtime/app/plugins/`. The composed plugin tree is gitignored (source of truth is `plugins/[id]/app/`), but the registry file is committed as an empty placeholder — byte-identical to the generator's empty output — so the runtime typechecks and builds without a pre-generate step. Both paths are excluded from Prettier/ESLint. Tasks 0.3.10 and 0.3.11 were built together so the dev pipeline (generate → `next dev`) works end to end.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Jun 2026 | Plugins compose at their `routePrefix` under a `shell`-selected route group; `routePrefix` is the URL source of truth; `adminOnly` routes are gated in middleware                                                                                                                                                                                                                                                                                                                                                                                                                                            | The generate script injects each plugin's `app/` at `runtime/app/(platform)/(plugins)/<routePrefix>/` for `shell: default`, so the plugin inherits the platform sidebar through normal App Router layout nesting — no rewrites and no per-request layout branching. The route segment is the manifest `routePrefix` (not the source directory name), making `routePrefix` the single source of truth for a plugin's URL; the `(plugins)` route group is URL-transparent, so `routePrefix: /console` serves at `/console`. A chrome-free group for `shell: minimal` plugins lands with the first such plugin (the generate script fails loudly on `minimal` until then, rather than mis-composing one). `adminOnly` plugins are gated in the runtime middleware (SRS §3.4): a request under an admin-only `routePrefix` from a non-`platform:admin` user returns 403. This supersedes the "committed empty placeholder" framing — the committed registry now tracks installed plugins (still Prettier/ESLint-excluded and regenerated deterministically). Established in Task 0.4.1 (Console scaffold). |
| Jun 2026 | Plugins compose as **copies** in every environment (dev included); the runtime dev server runs via `scripts/dev.ts` (generate `--watch` + `next dev`)                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Supersedes the "symlinks in dev" and `resolve.symlinks: false` decisions. Next's dev route watcher does not discover routes through symlinked directories, so a symlinked plugin route 404s under `next dev` even though `next build` follows symlinks — the symlink approach silently failed for the first real plugin route (Console). Composing copies in dev too gives dev/prod parity; the `scripts/dev.ts` orchestrator runs the generate watcher (re-copies on any change under `plugins/`, preserving HMR) alongside `next dev` and tears both down together on exit. The `resolve.symlinks: false` webpack workaround was removed — it only addressed module-graph HMR for symlinked source, not route discovery, which is moot now that composed routes are real files. Established in Task 0.4.1.                                                                                                                                                                                                                                                                                           |
| Jun 2026 | API Composer plugin: managed JSON storage, protocol adapters, API keys; platform reserves the `/api/*` public namespace (PLT-16)                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Generated-API records live as JSON documents in one shared `apicomposer_records` table — no runtime DDL, fully dialect-agnostic, fits the file-based migration model; constraints are enforced by the engine, an accepted trade-off at small-API scale. The metadata model (projects/resources/methods) is protocol-neutral behind a `ProtocolAdapter` interface — REST in v0.1, GraphQL later without core changes (same seam pattern as Plainwrite). External callers cannot present a session cookie, so generated APIs use per-project hashed API keys (Bearer header, reveal-once) plus a per-method public toggle; `/api/*` is therefore exempt from the session-redirect middleware and rewritten to the provider plugin's serve route (PLT-16, one provider per instance in v1). Declarative CRUD only in v0.1 — custom logic is deferred to a sandboxed-hooks milestone, consistent with deferring plugin sandboxing in v1.                                                                                                                                                                   |
| Jun 2026 | PaperTrail adapted from the legacy architecture: plugin-owned projects containing boards; owner/editor/viewer roles; JSON export/import as the legacy migration bridge                                                                                                                                                                                                                                                                                                                                                                                                                                       | The legacy plugin (Vite SPA + Express router + Prisma extension + `plugin.json` capabilities) maps cleanly onto the v3 native model: canvas becomes a client component, the Express router becomes plugin route handlers under `/papertrail/api/*` (session-protected — no public-route dependency), Prisma models carry over to Drizzle with `tenant_id` added. The old platform-owned "project" concept no longer exists, so PaperTrail owns a projects→boards hierarchy (lifting the legacy one-board-per-project limit); the five legacy capability roles collapse to owner/editor/viewer as data-scoped membership. No automated data migration across architectures — the existing JSON board export/import is the bridge. Repo stays `kasunben/PaperTrail`, adapted in place. New-vs-legacy hardening: server-side markup sanitisation and private-address SSRF blocking on link previews.                                                                                                                                                                                                      |
| Jun 2026 | Shell gains a third mode, `overlay`: a plugin renders as a dismissable dialog over the current page, with a full-page fallback on hard navigation (RFC 0001 accepted)                                                                                                                                                                                                                                                                                                                                                                                                                                        | Some plugins are interruptions, not destinations (Console, Account, quick-capture/settings-like plugins) — a user mid-task wants a quick layer that dismisses back to where they were, not a context-destroying navigation. Implemented with App Router parallel + intercepting routes: the generate script composes an `overlay` plugin's `app/` tree twice — an interception copy under `(platform)/@modal/(.)<routePrefix>/` (soft nav → dialog over the current page) and the ordinary full-page fallback under `(platform)/(plugins)/<routePrefix>/` (hard load, deep link, login redirect). URLs stay real and unchanged, so `adminOnly` gating and the login redirect keep working; the underlying page stays mounted; plugins write ordinary pages and flip one manifest field (the runtime owns the dialog chrome via a `@modal` slot + a `Dialog` primitive in `packages/ui`). Kept as one mutually-exclusive `shell` enum value, not a separate `presentation` field. `overlay` plugins serve `/` as a full page only, so they are ineligible as the root plugin (CON-11).                  |
| Jun 2026 | Cross-plugin data sharing is consent-gated, pull-based, read-only, and platform-mediated (RFC 0002); reserved `sdk.data` surface + `data:provide`/`data:consume` permissions land now as stubs                                                                                                                                                                                                                                                                                                                                                                                                               | Plugin isolation (the SDK boundary) must hold, but users legitimately want one plugin to read another's data without re-entry. The mechanism: a provider exposes named, versioned read-only **data contracts**; a consumer calls `sdk.data.query(...)` and a provider registers `sdk.data.provide(...)`. Access requires an explicit, revocable user **consent grant** for `(consumer, provider, contract)`, else `ConsentRequiredError`; reads are tenant/user-scoped, read-only, and audited. Push-via-`events` and write-through were rejected as the primary model (out of scope / too large). The reserved SDK stub + permissions are additive (SDK/manifest minor bumps) with no behaviour change; the consent model, manifest `data.*` declarations, runtime resolution, and consent UI are deferred per RFC 0002. The mechanism is generic — any plugin may be provider or consumer.                                                                                                                                                                                                           |
| Jun 2026 | Logout (AUTH-02) UI flow: a shell avatar popover menu (Account + Log out) plus a Log out action on the current-session row in the Account → Security tab; `sdk.auth` gains `signOut()`; logout calls better-auth `/api/auth/sign-out` (with `Origin`), clears both `better-auth.session_data` and `__Secure-better-auth.session_data` cache cookies (`maxAge 0`), then redirects to `/login`. Scheduled as Task 0.5.12 (ACC-11)                                                                                                                                                                              | AUTH-02 was specified but never implemented: the shell exposed the avatar only as a link to `/account` with no sign-out control, `sdk.auth` had no `signOut`, and session revoke (ACC-06) excludes the current session. Clearing the `session_data` cache cookie is load-bearing — the middleware verifies sessions offline from that signed cookie (Task 0.5.6), so without clearing it logout would not take effect for up to `cookieCache` `maxAge` (300s); this mirrors the existing "profile self-mutations invalidate the session-cache cookie" rule. The avatar popover is the only new interactive chrome; the Account-page control is a progressive-enhancement form POST.                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Jun 2026 | Activity log (RFC 0005) incorporated (§3.14): scoped audit/activity record; view-based visibility (personal feed in Account, platform-wide in Console); auth events captured at the runtime verify boundary; reserved `sdk.activity.log()` + `activity:write`. Task 0.5.13                                                                                                                                                                                                                                                                                                                                   | The platform had no audit trail — admins couldn't see who changed what, and users had no record of actions concerning them. View-based scoping (`visibility` + `subject_user_id`) keeps the user feed a single indexed query and avoids leaking events between users; capturing auth events in the runtime preserves `apps/auth`'s isolation from the platform DB. The reserved surface + permission are additive stubs; the table, capture points, and views are deferred per RFC 0005.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Jun 2026 | Deployment & upgrade strategy (RFC 0006) incorporated (§3.15): pull-based versioned images; tiered graceful-restart/blue-green cutover; drizzle-kit + expand-contract migrations; `sv backup`/`restore` + auto pre-upgrade snapshot; tag-pinned rollback. Task 0.5.14                                                                                                                                                                                                                                                                                                                                        | `git pull && up --build` builds on the host, drops in-flight requests, has no real migrations, no tooled backups, and no rollback. This operationalizes NFR-10 (documented upgrade path) and NFR-04 (breaking-change discipline). Multi-node orchestration is out of scope (NFR-01); image publishing depends on CI (Task 0.5.8). Expand-contract is what makes blue-green overlap and rollback safe.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Jun 2026 | User data portability (RFC 0007) incorporated (§3.16): self-service export/import/migration as a versioned ZIP; plugins contribute via reserved `sdk.portability` (`provideExport`/`provideImport`); reserved `data:export`/`data:import`; Account gains a Data tab. Task 0.5.15                                                                                                                                                                                                                                                                                                                             | Sovereign's premise is data ownership, yet users could not get their data out. Per-user data is scattered across heterogeneously-owned plugin tables, so a faithful export needs plugin participation (runtime-mediated, own-slice only). Distinct from the operator backup (§3.15). Reserved surface + permissions are additive; format, flows, and UI are deferred per RFC 0007.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Jun 2026 | Security & encryption architecture (RFC 0008) incorporated (§3.17) and **phased**: Tier 0 (hardening) + Tier 1 (transport) in **v1** (Task 0.5.16); at-rest encryption (disk / SQLCipher / backups / avatars) under a local-keyfile envelope KEK→DEK, field-level via reserved `sdk.crypto` + `crypto:use`, and zero-knowledge E2EE (Tiers 2–4) **post-v1** (Task 1.0.01)                                                                                                                                                                                                                                    | Nothing was encrypted at rest, no security headers, plaintext backups/exports. Tier 0/1 are cheap, no-crypto-machinery wins (headers + threat-model doc + TLS/HSTS/Postgres SSL) and ship in v1; the crypto-heavy at-rest/key-management/field-level work is deferred post-v1. Server-held-key at-rest protects data off the host but not a curious operator or an RCE attacker — stated plainly; E2EE is out of v1 scope (§4.6) and would break SSR/search/plugin processing. The operator owns the key (lose it → lose the data). Amends RFC 0006/0007 to encrypted; SQLCipher carries Docker/native-dep impact at build time.                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Jun 2026 | Test organization (RFC 0010) incorporated: boundary-based layout — within-package tests (unit/component/visual + within-package integration) live in per-directory `__tests__/`; cross-service integration + e2e live at root `/__tests__/`. Task 0.5.17                                                                                                                                                                                                                                                                                                                                                     | Placement should follow the boundary a test crosses, not its type label; in a Turborepo monorepo a test belongs to the package owning the code (locality + per-package runs), so "integration" is not one location. e2e (Playwright) and visual are reserved with no dependencies added yet.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Jun 2026 | Icon system (RFC 0011) incorporated: adopt Lucide via a curated set generated into the design system as inline SVGs behind a Sovereign `<Icon>`; `lucide` is a build-time devDependency only (zero runtime/peer dep); replace chrome monograms/emoji; render plugin `icon.svg` safely. Task 0.5.18                                                                                                                                                                                                                                                                                                           | No icon system existed (monograms + an OS-dependent `⚙` emoji), yet the platform's own `icon.svg` already follows Lucide's 24×24 stroke/`currentColor` convention. ISC license + bundling fit NFR-02 and the no-telemetry stance; generating SVGs honors the design system's "zero extra dependencies" rule and RFC 0008's supply-chain ethos. Plugin SVGs are untrusted (rendered via `<img>`/sanitized, never `dangerouslySetInnerHTML`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Jun 2026 | Package codenames (RFC 0009 — `ui`→`mosaic`, `mailer`→`dispatch`, `db`→`database`) withdrawn/deferred                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Reconsidered and not pursued at this time. The pre-publish rename window stays open (nothing is on npm yet), so it can be revisited before first publish without breakage. RFC 0009 marked Withdrawn.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Jun 2026 | Operator fork model & upstream sync (RFC 0028) documented: two tracks (config-only = recommended; fork-and-track = for committed custom plugins or OEM distribution); isolation principle (never modify core-locked files: `runtime/`, `packages/`, `apps/`, core plugins); fork-safe zone (`operator/`, `plugins/<operator-id>/`); rebase-over-merge upstream sync; `operator/UPSTREAM` version tracking; AGPL compliance table. Full design in `docs/rfcs/0028-operator-fork-model.md`. §2.7 updated with pointer.                                                                                         | Most self-hosters need no fork — env vars + community plugins + RFC 0027 branding cover the full surface. The fork model is for operators who need custom plugins compiled into the same image (air-gapped or proprietary) or who are building a commercial OEM derivative. The isolation principle makes the fork directly analogous to the SDK boundary rule: just as plugins must not import `runtime/src`, fork operators must not modify upstream files. Rebase over merge keeps history linear and conflicts localised to the operator's own changes; when the isolation principle is respected, rebase produces zero conflicts. Custom community plugins use only the MIT SDK/UI and carry no AGPL copyleft regardless of distribution scenario.                                                                                                                                                                                                                                                                                                                                                |
| Jun 2026 | White-labeling / tenant branding (RFC 0027) incorporated as a **post-v1** plan (§3.18): `tenant_branding` table + `BRAND_*` env vars + `--sv-brand-*` token namespace + `BrandProvider` + Console branding form + `getConfig()` extension (Phase 1); branded email templates + auth login page via runtime proxy (Phase 2); dynamic PWA manifest + favicon route (Phase 3). Full design in `docs/rfcs/0027-white-labeling.md`. Tasks 1.0.03–1.0.05                                                                                                                                                           | The existing infrastructure (`tenant_id`, `tenants` table, `platform_settings`, design-system token architecture) already points toward this capability; what was missing was a structured `tenant_branding` table, a dedicated `--sv-brand-*` token namespace, and a delivery mechanism for the runtime, auth server, email, and PWA. CSS variable injection achieves the visual result without forking any template. `platform_settings` is not used as a branding store (untyped, unstructured; brand values benefit from explicit columns). Brand name is a React prop from `BrandProvider`, not a CSS custom property — `content:` on pseudo-elements does not work for rendered text. Auth server branding obtained via proxy to runtime (one store, no dual-write) — the dual-write approach is appropriate for invite-only (safety-critical boolean) but not for 7 cosmetic fields where a stale value is cosmetically wrong, not a security failure. `data:` URI email logo rejected — Gmail and most webmail refuse to render them.                                                          |
| Jun 2026 | Storybook 8 chosen for `@sovereignfs/ui` design system documentation (Task 1.0.08, post-v1). No RFC — pure developer tooling, no runtime surface, no SDK/manifest/DB change. `@storybook/nextjs` (Vite builder) with `addon-a11y`, `addon-viewport`, `addon-themes`. Token Gallery story + one story per component. CI `storybook-build` job with a11y enforcement. RSC stories deferred until Storybook RSC support matures.                                                                                                                                                                                | Alternatives considered: **Ladle** (fast, Vite-native, but minimal addon ecosystem — no a11y addon), **Histoire** (Vue-first, React support immature), **Docz** (stagnant since 2022). Storybook 8 is the only option with mature CSS Modules support (`@storybook/nextjs`), a production-ready a11y addon (`addon-a11y`), dark mode toggling for CSS custom property themes, and widespread team familiarity. Scoped to `packages/ui` because App Router RSC components cannot be rendered in Storybook without significant workarounds; client-component stories in `runtime` added as a follow-on.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

| Jun 2026 | Naming convention: "plugin" (architectural) vs "app" (presentational). In code, types, APIs, DB schema, manifests, and CLI the term **plugin** is used exclusively. In user-facing UI strings (labels, placeholders, empty states, aria-labels, help text) the term **app** is used — it is what end users understand. "Plugin" is a developer concept and must not appear in any string a non-technical user reads. | "Plugin" is precise and correct for developers — it describes an installable module conforming to the manifest contract, not a standalone application. End users, however, have no concept of "plugins" in the sense of installable platform extensions; to them each item is simply an app they've added to their workspace. Using "app" in UI copy reduces cognitive friction. The split is intentional: the architectural term stays accurate in code and docs targeted at developers, while the presentational term stays appropriate in product UI. This is a standing convention; every new shell component, Console user-facing copy, and in-app help text must follow it. |

---

_Version 0.30 — June 2026. Non-Docker PM2 deployment (RFC 0026 Phase 1, Task 0.5.30). §3.1 updated: PM2 added as a supported non-Docker deployment model; decision-log entry corrected (PM2 previously marked "dropped", now reinstated). `sv serve` health-gate (30 s poll on auth `/api/health` before spawning runtime). `sv setup pm2` sub-command + `docs/examples/pm2.example.config.js`. `docs/self-hosting.md` gains "Non-Docker deployment (PM2)" section._

_Version 0.29 — June 2026. Offline connectivity banner (Task 0.5.31). §3.11 extended with the soft-offline detection model, banner behaviour, and the SSR-safe `useState` initialisation rule. `@sovereignfs/ui` → 0.7.0 (warning/success status colour tokens — `--sv-color-warning-*` / `--sv-color-success-*`); `runtime` → 0.20.0._

_Version 0.28 — June 2026. Storybook for `@sovereignfs/ui` added as post-v1 Task 1.0.08. Decision-log row added. No architecture section needed (developer tooling only — no runtime surface, SDK, permission, or schema change)._

_Version 0.27 — June 2026. Operator fork model (RFC 0028) documented. §2.7 gains a "Fork model" paragraph pointing to RFC 0028; one decision-log row added. No architecture section needed (purely process/convention guidance). No SDK surface change, no permission change, no schema change._

_Version 0.26 — June 2026. White-labeling / tenant branding (RFC 0027) incorporated as a post-v1 plan. New §3.18; §4.6 gains "White-labeling" as an out-of-scope v1 item; decision-log row added. Roadmap gains Tasks 1.0.03–1.0.05 (three phases). No SDK surface change, no permission change, no schema change in v1._

_Version 0.25 — June 2026. Post-implementation refinement of the overlay shell (Task 0.5.10, RFC 0001 open questions 2 & 4 resolved): §5 manifest reference gains the optional `shellConfig` object with `overlaySize` (`sm`/`md`/`lg`, default `lg`, valid only for `shell: "overlay"`); §3.8 records that overlay dialogs are fixed-size (never content-driven) and that intra-overlay navigation must use `replace` so a single `router.back()` dismisses the dialog. No new requirement or permission; implementation-only (already merged)._

_Version 0.24 — June 2026. Changes from v0.23 (build-plan renumber, mirrored from implementation-tasks v1.16): the §3.17 phasing note and the RFC 0008 decision-log row now point the post-v1 encryption work to **Task 1.0.01** (was 0.5.18). Registry contribution + Stable-SDK/semver moved into pre-v1 (Tasks 0.5.18/0.5.19); the encryption Tier 2–4 work moved under a new **Phase v1.0+ — Post-release / future** as Task 1.0.01, so task-number prefixes now track phases (0.5.x pre-v1, 1.0.x post-release). No requirement or permission change._

_Version 0.23 — June 2026. Changes from v0.22: Phased RFC 0008 (security & encryption) between v1 and post-v1. §3.17 gains a phasing note: Tier 0 (hardening — security headers + `docs/security.md`) and Tier 1 (transport — TLS/HSTS, Postgres SSL) ship in **v1** (Task 0.5.16, retitled "Security hardening, Tier 0 + Tier 1"); at-rest encryption, field-level `sdk.crypto`, and zero-knowledge E2EE (Tiers 2–4) are **post-v1** (Task 1.0.01 `[post-v1]`). The 0008 decision-log row updated accordingly. No SDK/permission change (`crypto:use` was already reserved/not-implemented)._

_Version 0.22 — June 2026. Changes from v0.21: Incorporated RFCs 0005, 0006, 0007, 0008, 0010, and 0011 into the plan. New architecture sections §3.14 Activity Log (RFC 0005), §3.15 Deployment & Upgrade Strategy (RFC 0006), §3.16 User Data Portability (RFC 0007), and §3.17 Security & Encryption Architecture (RFC 0008). §5 manifest reference gains the reserved permissions `activity:write` (0005), `data:export`/`data:import` (0007), and `crypto:use` (0008). Seven decision-log rows added (the six incorporations plus the withdrawal of RFC 0009 — package codenames `ui`→`mosaic`/`mailer`→`dispatch`/`db`→`database` — deferred at this time). The build plan gains Tasks 0.5.13 (activity log), 0.5.14 (deployment/upgrade), 0.5.15 (data portability), 0.5.16 (security/encryption), 0.5.17 (test organization), and 0.5.18 (icon system); each RFC's "Incorporated into plan" header is updated. All reserved SDK surfaces/permissions are additive stubs; the mechanisms are deferred to their tasks._

_Version 0.21 — June 2026. Changes from v0.20: Added §3.13 Cross-Plugin Data Sharing (post-v1 plan) and RFC 0002 (`docs/rfcs/0002-cross-plugin-data-sharing.md`, draft) — a consent-gated, pull-based, read-only mechanism for one plugin to read another's data, platform-mediated and audited. The reserved `sdk.data` surface (`packages/sdk`, stub) and the `data:provide`/`data:consume` manifest permissions (`packages/manifest`) land now (additive; SDK → 0.5.0, manifest → 0.3.0); the consent model, manifest `data.*` declarations, runtime, and consent UI are deferred. SRS §5 manifest reference lists the reserved permissions; one decision-log row added; build plan gains a future task (Task 0.5.11)._

_Version 0.20 — June 2026. Changes from v0.19: Accepted RFC 0001 and incorporated the `overlay` shell mode into the plan. SRS §3.8 documents the third shell mode; §3.9 the dual composition (`@modal` interception copy + full-page fallback); §5 manifest reference adds `'overlay'` to the `shell` enum; CON-11 root-plugin eligibility gains "non-overlay"; one decision-log row added. The build plan gains the overlay wiring task (Task 0.5.10). RFC 0001 marked accepted/incorporated. (Code — manifest enum, generate script, `@modal` slot, `packages/ui` Dialog, Console/Account manifest migration — lands in that task, not in this doc change.)_

_Version 0.19 — June 2026. Changes from v0.18: Added the API Composer and PaperTrail sovereign plugin specs (`docs/plugins/api-composer.md`, `docs/plugins/papertrail.md`) and RFC 0001 (`docs/rfcs/0001-overlay-shell-variant.md`, draft — not yet incorporated into the plan). SRS gains PLT-16 (reserve the `/api/*` namespace, delegate to a provider plugin), the two plugin roadmaps in §2.5, and two decision-log rows; the build plan gains Task 0.5.9 (public `/api` namespace delegation). (These specs were authored in PR #17, which merged into a feature branch instead of `main` and so never reached `main`; restored here.)_

_Version 0.18 — June 2026. Changes from v0.17: Plugin composition uses copies in every environment (dev included) — Next's dev route watcher does not follow symlinked route directories, so the runtime dev server now runs via `scripts/dev.ts` (generate `--watch` + `next dev`) and the `resolve.symlinks: false` workaround was removed (§3.9, decision log). v0.17 recorded the plugin route-composition model (§3.9) — plugins compose at their `routePrefix` under a `shell`-selected route group (`default` → `(platform)/(plugins)/`, inheriting the sidebar), `routePrefix` is the URL source of truth, and `adminOnly` routes are gated in middleware (§3.4); the committed registry now tracks installed plugins. Established in Task 0.4.1._
