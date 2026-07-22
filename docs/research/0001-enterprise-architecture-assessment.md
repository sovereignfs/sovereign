# Research 0001 — Enterprise-grade architecture feasibility

**Status:** Exploratory (superseded in part by [0002](0002-multi-tenancy-vs-federation-direction.md))\
**Date:** July 2026\
**Author:** Claude Code\
**Scope:** Whole-repo architecture review — `packages/db`, `apps/auth`,
`runtime/src`, `docs/security.md`, `docs/self-hosting.md`\
**Related:** [0002](0002-multi-tenancy-vs-federation-direction.md), [0003](0003-horizontal-scaling-strategy.md)

---

## Question

Is the current architecture feasible as the foundation for an enterprise-grade
offering, and what are the concrete gaps?

## Findings

**Tenancy.** Single-tenant, hardcoded, per instance. `packages/db/src/schema/sqlite/platform.ts:10-11`
documents `tenant_id` as present "from day one for future multi-tenancy, even
though v1 is single-tenant." `packages/db/src/platform-db.ts:11-12` defines
`DEFAULT_TENANT_ID = 'default'`, used at ~20 call sites — every tenant-scoped
row uses this literal constant. No org/workspace-switcher concept exists;
isolation across customers today means one Docker deployment per customer
(`docs/instances.md`).

**Auth & RBAC.** better-auth (`apps/auth/src/auth.ts`) provides email/password,
passkeys, and TOTP 2FA. No OAuth/social login, no SAML/OIDC/SSO. RBAC is four
fixed roles (`platform:owner/admin/auditor/user`) mapped to a capability enum
in `runtime/src/capabilities.ts:57-120`, with a code comment noting the
architecture supports a future DB-driven override layer but doesn't implement
one. Audit logging (`docs/epics/activity-logs.md`) covers admin actions and
self-mutations; login/session events are explicitly deferred (Edge runtime
can't write the platform DB from the verify boundary yet).

**Database.** Drizzle ORM is dialect-agnostic; SQLite (better-sqlite3) is the
default, Postgres (node-postgres) is production-ready via `DATABASE_URL`
(`packages/db/src/client.ts:38-61`). No read-replica or connection-pool
tuning beyond `pg.Pool` defaults exists in-app.

**Observability.** No Sentry/OpenTelemetry/Prometheus/Datadog dependency
anywhere in the repo. `runtime/src/logger.ts` emits structured NDJSON to
stdout/stderr only. `docs/security.md:29-38` frames "no log data sent to any
third party" as an explicit privacy guarantee, not a gap to be closed by
default — any telemetry integration would need to be operator opt-in to avoid
contradicting this stance.

**Deployment & HA.** `docker-compose.yml` / `docker-compose.prod.yml` are
single-container-per-service; Compose's `deploy.replicas` doesn't apply
outside Swarm mode. `sv backup`/`sv restore` exist; the more
enterprise-grade encrypted-bundle + Git-remote backup
(RFC 0064, epic tasks 8.10–8.12) is still 📋 planned, not built.

**Security.** CSP is strict and nonce-based (`docs/security.md:104`). At-rest
encryption is opt-in and SQLite-only (`SOVEREIGN_DB_ENCRYPTION_KEY`, RFC 0071)
and is explicitly scoped to protect "a stolen disk/backup only — not a
curious operator or RCE." No SOC2/compliance/pen-test program exists yet
(expected at this stage, but the long pole for enterprise procurement).

**Admin/governance.** Console (`plugins/console/app/`) already covers user
management, groups, per-user/group plugin access policy, SMTP config, and a
platform-wide activity feed — this part of the stack is already
enterprise-shaped.

**Plugin model.** Manifest permission enum, per-plugin DB isolation mode
(`database.isolation: 'shared' | 'isolated'`), and storage/email/rate quotas
already exist as primitives (`packages/manifest/src/schema.ts:51`,
`runtime/src/sdk-host.ts`). No per-tenant plugin enablement exists (there's
only one tenant); no process-level plugin sandboxing.

## Recommendation

The architecture doesn't need a redesign to go enterprise — the load-bearing
decisions (dialect-agnostic DB, `tenant_id` scaffolding, manifest/SDK contract,
capability model) were made correctly up front. But three areas were treated
as v1 non-goals and would each be substantial, roadmap-scale workstreams:
**multi-tenancy**, **SSO/federation**, and **HA/horizontal scaling** — plus a
compliance program layered on top of all three.

## Open questions

Resolved by [0002](0002-multi-tenancy-vs-federation-direction.md): whether to
build out multi-tenancy at all, given the project's federated-systems
direction.

## Next steps

See [0002](0002-multi-tenancy-vs-federation-direction.md) (tenancy strategy,
decided) and [0003](0003-horizontal-scaling-strategy.md) (HA/scaling,
in progress). SSO/OIDC and a formal compliance program are not yet
researched — worth a dedicated research doc before either becomes an RFC.
