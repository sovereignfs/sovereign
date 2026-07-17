# RFC 0069 — Bring-your-own database (per-user external Postgres)

**Status:** Withdrawn (evaluated, not recommended for v1)\
**Date:** July 2026\
**Author:** kasunben\
**Scope:** packages/db, apps/auth, runtime/src (db resolution, admin aggregates), plugins/account, docs; touches RFC 0004, RFC 0036\
**Incorporated into plan:** No — evaluated and rejected for v1. Recorded here as a decision, not a design to build. Revisit only if federation becomes an active, funded initiative (see Alternatives/Open questions).

---

## Summary

Proposal under evaluation: let an individual end-user configure their own
external Postgres connection from the Account section, after which that
user's plugin data is read from and written to their remote database instead
of the shared platform database — while every other user, and the platform's
own default, keeps using the shared instance database unchanged. Isolated
per-plugin databases (RFC 0004) stay as-is.

This RFC concludes the feature is **not feasible as a stable v1 feature**.
The blocking issue is not the database connection itself — Postgres-only,
one new connection string, looks small — but that nearly every layer of the
data architecture (connection resolution, shared-table plugins, admin
aggregate queries, cross-plugin references, migrations) currently assumes
exactly one queryable database per instance, and this proposal is a form of
per-user federation that the project has already, twice, evaluated and
deferred at a smaller scope (per-plugin, not per-user).

## Motivation

The underlying user need is legitimate and matches Sovereign's data-ownership
positioning: some users may want their data to physically live somewhere they
control, independent of the operator's infrastructure. The question this RFC
answers is whether that need can be met today by adding an Account-level
"point your data at your own Postgres" toggle, without a larger redesign.

## Current state (what this evaluation rests on)

- **Connection model is a process singleton, not per-request/per-user.**
  `packages/db/src/platform-db.ts` — `getPlatformDb()` memoises one client for
  the life of the process (`_dbPromise`, created exactly once). `packages/db/src/client.ts`
  — `createClient()` builds one `pg.Pool` (Postgres) or one `better-sqlite3`
  handle (SQLite) from a single boot-time connection string. The **only**
  per-request DB selection anywhere in the codebase is the RFC 0020 dev-mode
  switch (`runtime/src/db.ts`), and even that picks between two
  **boot-time-fixed, env-configured** connection strings via a shared-secret
  header — not a dynamically stored, user-supplied one.
- **`tenant_id` is a `WHERE`-clause filter, not a routing key.** CLAUDE.md:
  _"One deployment = one tenant... There is no concept of separate tenants
  within a single instance... the auth and data layers must not actively
  prevent [multi-tenancy]... but no multi-tenant logic is built in v1."_
  `packages/db/src/platform-db.ts` — `DEFAULT_TENANT_ID = 'default'`; every
  helper filters `WHERE tenant_id = ...` inside one physical connection.
  Nothing maps a tenant or user ID to a different connection string.
- **RFC 0004 (per-plugin isolated database) already proposed and deferred
  exactly this idea, at the plugin level:** its Alternatives-considered
  section lists _"Bring-your-own / external database now (operator points a
  plugin at an external connection string, possibly a different engine).
  Most flexible but adds secret management, config surface, and
  dialect-divergence risk. **Deferred** to a future extension."_ Its
  Implementation section resolves this: _"BYO external database: **deferred**.
  The `DATABASE_URL`/`DB_DIALECT` env-config approach... is still the path if
  needed; not built in this task."_ Isolation as actually shipped is
  schema-per-plugin **on the same server/connection string**
  (`packages/db/src/plugin-client.ts` — `CREATE SCHEMA IF NOT EXISTS`), never
  a different physical database.
- **RFC 0036 (per-plugin dialect selection) evaluated it again and rejected
  it a second time:** its Alternatives section names the shape almost
  exactly — a plugin-scoped external Postgres URL via an
  `SV_PLUGIN_<SLUG>_DB_URL`-style convention — and rejects it: _"significantly
  expands scope (new env var convention, per-plugin connection pool
  management, operator documentation)... RFC 0004 already deferred BYO-DB
  explicitly. This can be a follow-on RFC when there is concrete demand."_ No
  such follow-on RFC existed before this one, and this evaluation is that
  follow-on — at a harder scope (per-user, not per-plugin) than either prior
  RFC considered.
- **Shared/core plugins commingle every user's rows in one table.** RFC 0004
  §1: _"Platform/chrome plugins (Console/Account/Launcher) are always
  shared."_ These tables are filtered by `user_id`, not physically separated
  per user. There is no existing per-user data boundary to redirect — one
  would have to be invented, table by table, plugin by plugin, before a
  connection-routing layer would even have something coherent to route.
- **Cross-user queries are pervasive and assume one connection.** Consent
  grants (`listAllConsentGrants`), plugin connection metadata for the Console
  operator surface (`listAllPluginConnectionRefs`), notifications (writes
  targeting a different `recipient_user_id` than the actor), and the activity
  log (`actor_id` vs. `subject_user_id`, admin-aggregated) all run one SQL
  query against one connection today. RFC 0051 (cross-plugin references)
  already avoids direct joins across plugin stores by using opaque,
  SDK-mediated references specifically because RFC 0004 made joins across
  isolated stores impossible — the same mitigation would be needed again
  here, but now for a user's data against every other query surface, not
  just against other plugins.
- **Migrations are connection-agnostic in principle but single-target in
  practice.** `packages/db/src/migrate.ts` — `runMigrations(pdb)` accepts any
  `PlatformDb` handle, so nothing prevents pointing the same migration files
  at an arbitrary connection string. But `_migrationResult` and the
  downgrade-guard state in `platform-db.ts` are single process-global slots
  used by `/api/admin/health` to report **the** platform's migration state —
  there is no per-connection migration-state tracking, and moving to N
  externally-hosted user databases turns "keep schema in lockstep on deploy"
  from a one-time operator action into an ongoing per-user reconciliation
  problem with no existing tooling.
- **Auth is the one clean precedent, and it's already separate.**
  `apps/auth/src/db.ts` maintains its own connection, fully independent of
  `packages/db` (_"Mirrors packages/db; not imported, as the auth server
  intentionally does not depend on packages/db"_). This is the right seam if
  this were ever pursued — auth/identity centralized, only plugin data moves
  — but "plugin data" is not a clean, already-separated unit per user today
  the way "auth" is separated from "platform+plugin data."
- **Federation is an explicit non-goal, not an oversight.** CLAUDE.md /
  SRS §1.4 non-goals lists multi-tenancy and calls out per-plugin isolated
  database as the only implemented item on that list. CLAUDE.md: _"the `fs`
  denotes federated systems — reflecting the project's long-term federated
  direction (federation itself is a post-v1 concern; see SRS §1.4
  non-goals)."_ Per-user BYO-DB is a form of federation (data residency
  decided per identity, not per instance), and the project has already
  decided, at the naming-and-scoping level, that federation is out of scope
  for now.

## Proposed design (sketch, for completeness — not adopted)

Had this gone forward, the minimum viable shape would have required:

1. A request-scoped (not process-singleton) DB resolver used consistently
   everywhere `getPlatformDb()`/`getPluginDb()` are called today, keyed by
   authenticated user ID, falling back to the shared instance DB by default.
2. A decision on shared/core plugins: either (a) BYO-DB users are excluded
   from Console/Account/Launcher's shared-table model and get a parallel
   per-user schema there too, or (b) BYO-DB only ever applies to
   plugin-scoped data for plugins that opt in, leaving core platform data
   (profile, sessions, consent, notifications) in the shared DB regardless —
   option (b) is far cheaper but means "bring your own database" would not
   actually mean what a user configuring it would expect.
3. A federation strategy for every cross-user aggregate query (admin
   dashboards, notifications, activity log, cross-plugin references) that
   currently assumes one connection — at minimum, explicitly excluding
   BYO-DB users' rows from those aggregates, which is a product-visible
   behavior change, not just an engineering detail.
4. A per-user migration runner (extending the `runPluginMigrations` pattern)
   invoked at BYO-DB setup time and re-invoked on every platform upgrade for
   every configured remote DB, plus per-connection migration-state tracking
   surfaced somewhere the user or operator can see "your remote DB is behind."
5. Secret handling for user-supplied connection strings/credentials
   (storage, rotation, connection validation, and explicit UX for
   unreachable/misconfigured remote databases — including what happens to
   login and shared-plugin usage when a user's own DB is down, since some
   subset of their data becomes unavailable mid-session).
6. Explicit scope: Postgres-only was stated in the request, but the platform
   default can be SQLite (RFC 0036); a BYO-DB Postgres target next to a
   SQLite platform default reintroduces the exact dialect-divergence risk
   RFC 0004's alternatives section flagged and deferred.

None of this is a small addition to the Account section — it is a rework of
the data-access layer's core assumption (one connection resolves the whole
request) plus a federation strategy for every feature that currently reads
across users.

## Alternatives considered

### Build it scoped to a single opt-in plugin, not platform-wide

Cheaper: a plugin manifest could declare `database: 'byo-external'` and only
that plugin's data moves, leaving Console/Account/Launcher and every other
plugin in the shared DB. This still requires the request-scoped connection
resolver (item 1 above) and a federation exclusion for that plugin's rows
from any cross-user query, but avoids rearchitecting shared/core plugins.
This is the shape RFC 0036's open question already gestures at as a possible
follow-on. If demand becomes concrete, **this** is the narrower proposal
worth re-evaluating — not the platform-wide version in this RFC.

### Do nothing; point users at self-hosting the whole instance instead

Sovereign is already self-hostable per-instance. A user who wants full data
control today can run their own instance rather than opting one user's data
out of a shared instance. This doesn't serve the "shared instance, some users
want their own DB" use case, but it's the zero-engineering-cost answer to the
underlying data-ownership motivation, and is the honest answer to give users
who ask for this before any narrower version (above) is built.

### Encrypt-at-rest / client-side encryption instead of data relocation

RFC 0008 (Tier 4) and RFC 0060 (client-side encryption core) already give
users a way to keep specific data unreadable by the operator without moving
it to different physical infrastructure. For users whose actual concern is
"the operator shouldn't be able to read my data" rather than "my data must
physically live on hardware I control," this is a materially smaller lift
that's already shipped or in progress, and should be the first thing pointed
to if this request resurfaces.

## Open questions

1. If concrete user demand for this materializes, should the narrower
   single-plugin-scoped version (Alternatives, above) be re-evaluated as its
   own RFC, or does the federation-adjacent risk (item 3, cross-user
   aggregates) make even that scope unattractive?
2. Is "data physically relocated to user-controlled infrastructure" actually
   the need, or does client-side encryption (RFC 0060) already satisfy the
   underlying motivation for most users who'd ask for this? Worth surfacing
   directly with whoever requested it before any further design work.
3. Should this non-recommendation be reflected in the SRS §1.4 non-goals list
   (as an example of federation) so future contributors don't re-propose the
   platform-wide version without finding this record first?

## Adoption path

Not adopted. No implementation, no epic task, no roadmap entry. This
document exists as a decision record: the platform-wide, per-user BYO-database
feature described in the Summary was evaluated and rejected for v1 on
architectural grounds (sections above), distinct from a simple lack of
time/priority. Revisit only under the conditions in Open Questions #1.

## Changelog

| Version | Date      | Change                                                                                                                                                                                 |
| ------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0.1     | July 2026 | Initial draft.                                                                                                                                                                         |
| —       | July 2026 | Withdrawn; not recommended for v1. Evaluated as platform-wide per-user BYO-DB; a narrower single-plugin-scoped variant remains a possible future follow-on if concrete demand emerges. |
