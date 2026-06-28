# RFC 0006 — Deployment & upgrade strategy

**Status:** Implemented\
**Date:** June 2026\
**Author:** kasunben\
**Scope:** Docker images + Compose, CI (Task 0.5.8), `packages/db` (migrations), `apps/auth`, `bin/sv`, `docs/self-hosting.md`, `docs/upgrade.md`, SRS §3.1 + NFRs\
**Incorporated into plan:** Yes — SRS §3.15 and **Task 0.5.14**. The implementation (pull-based images, graceful shutdown, drizzle-kit + expand-contract migrations, `sv backup`/`restore` + auto-snapshot, tag-pinned rollback) lands in that task; image publishing depends on the CI pipeline (Task 0.5.8).

---

## Summary

Define a **tiered, low-downtime upgrade model** for Sovereign's single-machine
Docker Compose deployment (NFR-01):

- **Pull-based versioned images** are the canonical upgrade unit — CI builds and
  tags runtime + auth images; operators **pull then recreate** (no host build).
- **Cutover is tiered:** **graceful restart** is the default (a few seconds,
  hidden by the reverse proxy); **blue-green** is an optional advanced path for
  true zero-downtime.
- **Migrations** move to **drizzle-kit** under an **expand-contract** discipline
  (backward-compatible within a release) so overlap and rollback are safe.
- **Backups become first-class:** `sv backup` / `sv restore` plus an
  **automatic pre-upgrade snapshot**, making **tag-pinned rollback** real.

```bash
# the target upgrade flow (pinned image, no host build)
$EDITOR .env                       # bump SOVEREIGN_VERSION=0.7.0
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d   # auto-snapshot → migrate → graceful recreate
```

## Motivation

Sovereign is self-hosted and ships updates regularly, but has no smooth-upgrade
story. The only documented path is `git pull && docker compose up --build -d`,
which:

- **builds on the host** — downtime spans the build, not just a restart;
- **drops in-flight requests** — the standalone servers have no graceful
  shutdown, so a container recreate severs open connections;
- **relies on idempotent bootstrap DDL** (`CREATE TABLE IF NOT EXISTS`) — fine
  for additive columns/tables, but cannot express renames, drops, type changes,
  or backfills, and offers no applied-migration ledger;
- **has no tooled backups** — operators copy the data dir or run `pg_dump` by
  hand; and
- **has no rollback story** — reverting means git-revert + rebuild, with no
  guaranteed-good data snapshot to fall back to.

NFR-10 already requires a documented upgrade path and NFR-04 the breaking-change
discipline for published packages. This RFC operationalizes both for the
**deployment** as a whole, and prepares the ground for breaking changes and DB
migrations as the project moves toward and past v1.0.

## Current state (what this builds on)

- **Topology** (`docs/self-hosting.md`, SRS §3.1): two long-running Node
  processes — runtime (only externally exposed) + auth (internal) — via Docker
  Compose, `restart: unless-stopped`, healthchecks on `/api/health`,
  `depends_on: service_healthy`. A reverse proxy (Caddy/nginx/Traefik) is
  assumed in front for TLS and routing.
- **Standalone output:** both apps run `node server.js` reading `PORT`/`HOSTNAME`
  (`runtime/next.config.ts`, `apps/auth/next.config.ts`); three-stage Dockerfiles
  build from Next.js standalone output; prod uses a **named volume**
  (`sovereign_data`) and a non-root runner.
- **Health endpoints:** `runtime/app/api/health/route.ts` (public liveness) and
  `runtime/app/api/admin/health/route.ts` (rich report — `platformVersion`,
  database dialect/size, auth reachability, uptime).
- **Migration scaffolding, not yet load-bearing:** `packages/db/src/migrate.ts`
  exposes a dialect-aware `runMigrations(pdb, folder)`, but evolution today is
  the idempotent `bootstrapPlatformDb()` in `packages/db/src/bootstrap.ts`
  (guarded against the Drizzle schema by `packages/db/src/schema/parity.test.ts`).
  The auth server runs better-auth's migrator + `ensureAuthTables()` on every
  startup (`apps/auth/src/migrate.ts`, `apps/auth/instrumentation.ts`).
- **CLI:** `bin/sv` (`citty` + `consola`) is a thin orchestrator delegating to
  scripts and `pnpm`/`turbo` — the natural home for `backup`/`restore`/`upgrade`
  (`bin/sv.ts`, pure logic in `bin/helpers.ts`).
- **Versioning conventions** (CLAUDE.md): the platform version (root
  `package.json`) tracks roadmap milestones; `@sovereignfs/sdk` and
  `@sovereignfs/ui` follow npm semver (NFR-04: patch never breaks); breaking
  changes get a migration note in `docs/upgrade.md`.
- **No CI / no image registry yet** — both are introduced by Task 0.5.8, on
  which this RFC's image-publishing piece depends.

## Proposed design

### 1. Upgrade unit — published versioned images

CI (Task 0.5.8) builds the **runtime** and **auth** images and pushes semver
tags to a container registry (GHCR proposed):

- `:MAJOR.MINOR.PATCH` (immutable, e.g. `:0.7.0`) — the pinning tag;
- `:MAJOR.MINOR` (e.g. `:0.7`) — latest patch in a minor line;
- `:stable` — the current recommended release.

`docker-compose.prod.yml` references `image:` tags pinned by an `.env` variable
(`SOVEREIGN_VERSION`), so the upgrade is **pull-based, not build-based**:

```yaml
services:
  runtime:
    image: ghcr.io/sovereignfs/sovereign-runtime:${SOVEREIGN_VERSION}
  auth:
    image: ghcr.io/sovereignfs/sovereign-auth:${SOVEREIGN_VERSION}
```

Building from source (`up --build`) remains documented as a **fallback** for
forks and air-gapped deployments. Pinning by immutable patch tag is what makes
**rollback** a one-line repin (§5).

### 2. Cutover — tiered

**Default — graceful restart.** Add `SIGTERM`/`SIGINT` handlers to both
standalone servers: stop accepting new connections, **drain in-flight requests**
within a bounded grace period, close the DB pool, then exit. Combined with the
existing healthcheck-gated recreate and the reverse proxy's connect-retry, the
swap is a brief gap (seconds) rather than a burst of 502s. Compose sets a
matching `stop_grace_period`.

**Advanced — blue-green.** For operators who need no gap: run a second stack
("green") on alternate internal ports against the same data volume, health-check
it, **flip the reverse-proxy upstream** from blue to green, then retire blue.
Documented as an opt-in procedure (proxy snippets for Caddy/nginx/Traefik).
Blue-green **requires** expand-contract migrations (§3) because both versions
serve against one database during the overlap.

Multi-node rolling / orchestrators (k8s) are explicitly **out of scope** — they
conflict with the single-machine model (NFR-01).

### 3. Database migrations — drizzle-kit + expand-contract

**Tooling.** Introduce `drizzle.config.*` and generated SQL migrations under
`packages/db/migrations/`, and promote `runMigrations()` to load-bearing:

- Migrations run as a **one-shot step gated by `depends_on`** (a short-lived
  `migrate` service the app services wait on) — or, equivalently, a startup hook
  — holding a **single-writer advisory lock** so only one process migrates even
  if replicas start together.
- A **`schema_migrations` ledger** records applied versions; the app **fails
  fast** and refuses to serve if a migration errors (never serve a
  half-migrated DB).
- Migrations cover the **platform schema**, the **auth server's tables**
  (alongside better-auth's own migrator), and **per-plugin schemas** (RFC 0004)
  under the same framework.
- Bootstrap DDL (`bootstrapPlatformDb()`) is retained only for the **first
  install**; migrations own evolution thereafter. The schema-parity test remains
  the guard that both dialects stay in step.

**Expand-contract (hard rule).** Every release is **backward-compatible**: a
schema change is introduced additively (**expand**), the new code deploys and
backfills, and the old shape is removed only in a **later** release
(**contract**) once no running version depends on it. This is what makes
blue-green overlap safe and makes rollback to the previous image safe against
the migrated database. Renames become add-new + dual-write + backfill + later
drop; never a destructive in-place change within one release.

### 4. Backups & restore — first-class + automatic snapshot

**`sv backup` / `sv restore`** (in `bin/sv.ts`, pure helpers in
`bin/helpers.ts`) — dialect-aware and covering the **whole data surface**:

- SQLite: a consistent file-level snapshot (`VACUUM INTO` / better-sqlite3 backup
  API) of `sovereign.db` + `auth.db`;
- Postgres: `pg_dump` / `pg_restore`;
- plus the `avatars/` directory and (future) per-plugin DBs/assets (RFC 0004).

Snapshots are labeled (timestamp + platform version) so a restore targets a
known-good point.

**Automatic pre-upgrade snapshot.** The upgrade flow (the `migrate` step / an
`sv upgrade` helper) takes a labeled snapshot **before applying migrations**.
Retention is an operator-tunable count (keep the last _N_). This is the safety
net that turns rollback from "hope" into a procedure.

### 5. Versioning, compatibility & rollback

- **Tag-pinned rollback.** Because images are pinned by immutable patch tag and
  a pre-upgrade snapshot exists, rollback is: repin the previous
  `SOVEREIGN_VERSION`, `sv restore` the pre-upgrade snapshot, `up -d`. Safe by
  construction given expand-contract (the previous code never meets a schema it
  cannot read).
- **Startup version gate.** On boot, compare code version against the DB's
  recorded schema version: refuse to run **code older than the DB** (downgrade
  guard, unless paired with a matching restore) and require **sequential** major
  upgrades (no skipping a major). Surface the result in `/api/admin/health`.
- **Plugin ↔ platform compatibility.** Reuse the manifest
  `compatibility.minPlatformVersion` field as an install-/start-time check so a
  plugin built for a newer platform fails loudly rather than misbehaving.

### 6. End-to-end upgrade flow

1. Operator bumps `SOVEREIGN_VERSION` and `docker compose pull`.
2. `up -d` starts the `migrate` step: **auto pre-upgrade snapshot** → acquire
   advisory lock → apply pending migrations → release lock (**fail-fast** on
   error, leaving the snapshot intact).
3. App services recreate; **graceful shutdown** drains the old containers while
   the reverse proxy retries onto the new ones.
4. Operator verifies `/api/admin/health` (version, DB, auth reachability).
5. **Rollback if needed:** repin previous tag + `sv restore` + `up -d`.

## Impact when accepted

| Where                                     | Change                                                                                                     |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| CI (Task 0.5.8 dependency)                | Build + push semver-tagged runtime/auth images to the registry.                                            |
| `Dockerfile`, `apps/auth/Dockerfile`      | Graceful-shutdown entrypoint handling; align `HEALTHCHECK`.                                                |
| Compose files                             | `image:` tags + `SOVEREIGN_VERSION`, a gated `migrate` step, `stop_grace_period`; blue-green example.      |
| `packages/db`                             | `drizzle.config`, `migrations/`, load-bearing `runMigrations`, advisory lock, `schema_migrations`, gate.   |
| `apps/auth`                               | Graceful shutdown; align migration gating with the platform step.                                          |
| `bin/sv`                                  | `backup`, `restore`, and an `upgrade` helper.                                                              |
| `docs/self-hosting.md`, `docs/upgrade.md` | Image-pull upgrade, tiered cutover + blue-green, backup/restore, rollback.                                 |
| SRS §3.1 + NFRs                           | Promote to specified; new `DEP-xx` requirement IDs + decision-log entry.                                   |
| `docs/roadmap.md`                         | Sequenced tasks (migrations foundation → graceful shutdown → backup/restore → image/CI → blue-green docs). |

## Alternatives considered

1. **Build-on-host only** (status quo). No registry infrastructure, but downtime
   includes the build and rollback means git-revert + rebuild. Kept as a
   documented fallback, rejected as the canonical path.
2. **Multi-node rolling / orchestrator (Kubernetes, Swarm).** True rolling
   updates, but conflicts with NFR-01 (single-machine Compose) and adds
   operational weight inappropriate for the self-hosted, single-tenant target.
   Out of scope.
3. **Keep idempotent bootstrap, no migrations.** Cannot express renames/drops or
   guarantee rollback safety, and offers no applied-version ledger. Rejected.
4. **Docs-only backups** (manual `pg_dump`/`tar`). Lower build cost but a weaker
   rollback guarantee and no pre-upgrade safety net. Rejected in favour of tooled
   `sv backup`/`restore` + automatic snapshot.
5. **Two replicas + Compose rolling.** Compose has no clean rolling primitive for
   a single published port; blue-green behind the existing proxy is simpler and
   gives the same guarantee.

## Open questions

1. **Registry & signing.** GHCR (proposed) vs Docker Hub; whether to sign images
   (cosign) and publish an SBOM.
2. **Migrate step shape.** A dedicated one-shot `migrate` service gated by
   `depends_on` vs a startup hook inside each app. The one-shot service avoids
   races when both apps start together; the hook is simpler.
3. **SQLite consistency.** `VACUUM INTO` / online backup vs a brief quiesce
   during snapshot — and whether the auto-snapshot blocks writes momentarily.
4. **Snapshot retention & disk budget.** Sensible default count, and behaviour
   when disk is constrained.
5. **Blue-green on one volume.** How two stacks share the single named data
   volume safely (read/write expectations during overlap; avatar writes).
6. **Large Postgres DBs.** Auto-snapshot time/size for big databases — make it
   skippable with an explicit operator opt-out + warning.

## Adoption path

1. **Migrations foundation** — drizzle-kit config + first generated migration +
   load-bearing runner + advisory lock + `schema_migrations`, keeping bootstrap
   for first install. Establish the expand-contract rule in CLAUDE.md.
2. **Graceful shutdown** — SIGTERM draining in both servers + `stop_grace_period`.
3. **Backups** — `sv backup`/`restore` + automatic pre-upgrade snapshot.
4. **Images & CI** — semver-tagged image publishing (with Task 0.5.8) +
   `image:`-based `docker-compose.prod.yml` + `SOVEREIGN_VERSION`.
5. **Docs** — rewrite the upgrade procedure; add blue-green and rollback guides.
6. **SRS** — add `DEP-xx` requirements + decision-log entry on acceptance.

## Changelog

| Version | Date     | Change                                                 |
| ------- | -------- | ------------------------------------------------------ |
| 0.1     | Jun 2026 | Initial draft.                                         |
| 1.0     | Jun 2026 | Accepted; incorporated into SRS §3.15 and Task 0.5.14. |
