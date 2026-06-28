# RFC 0005 — Activity log

**Status:** Implemented\
**Date:** June 2026\
**Author:** kasunben\
**Scope:** SDK (`packages/sdk`), manifest schema (`packages/manifest`), platform DB (`packages/db`), runtime, Console, Account\
**Incorporated into plan:** Yes — SRS §3.14, §5 (`activity:write`), and **Task 0.5.13**. The reserved `sdk.activity` surface + `activity:write` permission landed in code as `NotImplementedError` stubs; the `activity_log` table, capture points, verify-boundary auth capture, and the Console/Account views are built in Task 0.5.13.

---

## Summary

Define a **scoped, durable activity log**: a tenant-scoped record of meaningful
actions across the platform, with **view-based visibility**. The platform and
(later) plugins emit events; the runtime records them with actor and tenant
context. Two complementary surfaces read one table:

- **Account `/activity`** — a **personal** feed for **every** user (admins
  included): the viewer's own actions plus actions about them.
- **Console `/console/activity`** — the **consolidated, platform-wide** feed,
  admin-only.

```ts
// plugin emits a scoped event (reserved — throws NotImplementedError in v1)
await sdk.activity.log({ action: 'list.created', subjectUserId: user.id });
```

A reserved `sdk.activity.log()` surface and an `activity:write` permission land
now as stubs; the mechanism behind them is specified here for later.

## Motivation

Sovereign keeps no audit trail. Admins cannot see who invited a user, changed a
role, toggled a plugin, or altered tenant settings; users have no record of
their own actions or of admin/system actions that affect them ("your role was
changed", "your account was deactivated"). As a single-tenant/multi-user
platform grows, that is a transparency and accountability gap — and a security
one (no record of privileged changes).

This is greenfield: there is no existing audit, activity, or event-history
infrastructure. The reserved `sdk.events` surface is unrelated — it is a
post-v1, fire-and-forget pub/sub channel, **not** a durable audit record (see
Alternatives).

## Current state (what this builds on)

- **Reserved-surface pattern:** the SDK already declares post-v1 surfaces
  (`storage`, `notifications`, `events`, `data`) as stubs that throw
  `NotImplementedError` (`packages/sdk/src/unimplemented.ts`,
  `packages/sdk/src/data.ts`), and the manifest permission enum reserves the
  matching capabilities (`packages/manifest/src/schema.ts`). This RFC reuses
  that pattern: `sdk.activity` + `activity:write` land now as stubs.
- **Role scoping:** the runtime injects `x-sovereign-user-role` /
  `x-sovereign-user-id` headers from the verified session; gated reads filter on
  them (e.g. `selectLauncherPlugins` in `runtime/src/launcher-plugins.ts`, and
  the user-scoped `runtime/app/api/account/prefs/route.ts`).
- **Admin-key gating:** `/api/admin/*` routes require `Authorization: Bearer
<SOVEREIGN_ADMIN_KEY>` (`runtime/src/admin-guard.ts`).
- **Platform DB conventions:** ULID `text` ids, Unix-seconds timestamps
  (`integer` on SQLite, `bigint` on Postgres), `tenant_id` on every user-scoped
  table, dialect-mirrored schema guarded by a parity test
  (`packages/db/src/schema/{sqlite,postgres}/platform.ts`).
- **Identity separation:** `apps/auth` owns identity and never reads the
  platform DB; the runtime verifies sessions at its middleware boundary
  (`runtime/src/session-verify.ts` + the `/api/verify` fallback).

## Proposed design

Everything in this section is **deferred** (specified for the post-acceptance
task) except the reserved SDK stub and permission noted under "Adoption path".

### 1. Event model — `activity_log` table

A single platform table (both dialects, mirrored, parity-tested):

| Column            | Type                  | Notes                                                                 |
| ----------------- | --------------------- | --------------------------------------------------------------------- |
| `id`              | text (ULID)           | Primary key.                                                          |
| `tenant_id`       | text, not null        | Tenant scope (single-tenant in v1; present for future multi-tenancy). |
| `actor_id`        | text, nullable        | User who acted; `null` for system-originated events.                  |
| `actor_type`      | text, not null        | `'user' \| 'system' \| 'plugin'`.                                     |
| `action`          | text, not null        | Dotted verb, e.g. `user.invited`, `plugin.disabled`, `session.login`. |
| `subject_user_id` | text, nullable        | The user an event is **about** (enables "concerns me" scoping).       |
| `target_type`     | text, nullable        | Generic target kind, e.g. `plugin`, `setting`, `session`.             |
| `target_id`       | text, nullable        | Generic target id (pluginId, setting key, …).                         |
| `plugin_id`       | text, nullable        | Emitting plugin for plugin-sourced events; `null` for core.           |
| `visibility`      | text, not null        | `'admin' \| 'user'` — drives the read scope (below).                  |
| `summary`         | text, nullable        | Human-readable one-liner.                                             |
| `metadata`        | text (JSON), nullable | Structured detail: before/after values, IP, user-agent.               |
| `created_at`      | integer/bigint        | Unix seconds, caller-supplied.                                        |

Indexes: `(tenant_id, created_at)`, `(actor_id)`, `(subject_user_id)`.

### 2. Scoping model — by _view_, not by role

Visibility is a property of the **view**, derived from a stored `visibility`
plus the actor/subject relationship — not a per-request ACL computation:

- **Personal scope** (Account `/activity`, every user incl. admins):
  ```sql
  WHERE tenant_id = :tenant
    AND visibility = 'user'
    AND (actor_id = :self OR subject_user_id = :self)
  ```
  The viewer's own actions plus actions about them. An admin viewing their
  Account tab sees only _their own_ activity here, exactly like any user.
- **Platform scope** (Console `/console/activity`, admin-only): all rows for the
  tenant, no visibility filter — the consolidated cross-user feed.

`visibility` is set per action at **write** time:

- Cross-user, security, or configuration events that affect others default to
  `admin` (Console-only) — e.g. another user's role change, plugin toggles,
  tenant-settings edits.
- An event **about** a user is written `visibility = 'user'` with
  `subject_user_id` set, so the affected user sees it in their personal feed
  without leaking anyone else's activity — e.g. _your_ role was changed, _you_
  were invited/deactivated, _your_ password was changed.

This keeps the user-facing query a single indexed predicate and avoids leaking
events between users.

### 3. Capture points

The runtime (and the admin API) call a `recordActivity()` write helper at the
existing mutation points:

| Event                                   | Where (existing code)                                                                  | Default visibility                      |
| --------------------------------------- | -------------------------------------------------------------------------------------- | --------------------------------------- |
| User invited                            | `plugins/console/app/users/actions.ts` → `apps/auth/app/api/admin/invites/route.ts`    | `admin` (+ `user` to invitee on accept) |
| Role changed / (de)activated            | `plugins/console/app/users/actions.ts` → `apps/auth/app/api/admin/users/[id]/route.ts` | `user` (subject = affected user)        |
| Plugin enabled / disabled               | `runtime/app/api/admin/plugins/[id]/route.ts`                                          | `admin`                                 |
| Tenant name / root plugin / invite-only | `runtime/app/api/admin/settings/route.ts`                                              | `admin`                                 |
| Password / display-name / avatar change | `plugins/account/app/actions.ts`, `runtime/app/api/account/avatar/route.ts`            | `user` (self)                           |
| Timezone / theme change                 | `plugins/account/app/actions.ts` (`/api/account/prefs`)                                | `user` (self)                           |
| Session revoked                         | `plugins/account/app/actions.ts`                                                       | `user` (self)                           |
| Login / session established             | runtime **verify boundary** (`runtime/src/session-verify.ts` + `/api/verify`)          | `user` (self)                           |
| Plugin-sourced events                   | `sdk.activity.log()` (mediated, deferred)                                              | per-call (`user`)                       |

**Auth lifecycle is captured at the runtime verify boundary, not in
`apps/auth`** — the auth server keeps its clean separation and never writes the
platform DB. Registration is the one awkward case (it happens pre-session in
`apps/auth`); the proposed approach is to record `auth.registered` on the first
runtime verify of a not-yet-seen user. See Open questions.

### 4. Write path

A `recordActivity(db, entry)` helper in `packages/db` (alongside
`platform-db.ts`), called by the core capture points and the admin API. It
stamps `created_at` and `tenant_id` and inserts one row.

`sdk.activity.log()` is **runtime-mediated**, like the planned `sdk.data`: a
plugin supplies only `action`, `subjectUserId?`, `targetType?`, `targetId?`,
`summary?`, `metadata?`; the runtime injects `actor_id` (the current user),
`tenant_id`, and `plugin_id`, and forces `actor_type = 'plugin'`. A plugin
cannot forge actor identity, write outside its tenant, or set `visibility =
'admin'` (plugin-sourced events are always `user`-scoped in this RFC).

### 5. Views

Two surfaces over the one table — they differ only in their query bound, not in
how the Account tab is gated:

- **Account `/activity` tab** — a new tab beside Profile / Preferences /
  Security in the Account plugin, available to **all** users. Reads a
  session-gated route scoped by `x-sovereign-user-id` (personal-scope query),
  reusing Account's existing read pattern (cf. the Security tab's session list).
- **Console `/console/activity` tab** — admin-only (Console is `adminOnly`,
  whole-prefix gated by `runtime/src/route-guard.ts`). The consolidated
  tenant-wide feed with filters (actor, action, date range) and pagination,
  read via an admin-key-gated API.

### 6. SDK surface

```ts
// reserved — throws NotImplementedError in v1
sdk.activity.log(entry: ActivityLogEntry): Promise<void>;
```

```ts
interface ActivityLogEntry {
  /** Dotted action verb, e.g. "list.created". Plugin events are namespaced by the runtime. */
  action: string;
  /** The user this event is about, if any (drives personal-feed visibility). */
  subjectUserId?: string;
  /** Generic target kind/id (e.g. "list" / the list id). */
  targetType?: string;
  targetId?: string;
  /** Human-readable one-liner. */
  summary?: string;
  /** Structured detail (before/after, etc.). Avoid PII beyond what's necessary. */
  metadata?: Record<string, unknown>;
}
```

A future `sdk.activity.list(query)` (plugins reading their own emitted events) is
**reserved/out of scope** for this RFC.

### 7. Permissions

- `activity:write` — the plugin may emit activity events via `sdk.activity.log()`.
- `activity:read` is **reserved/future** (not added now) — for plugins reading
  back their own events.

### 8. Security and scoping

- **Tenant- and actor-scoped.** The runtime injects `tenant_id`/`actor_id`;
  plugins cannot write cross-tenant or impersonate another actor.
- **No leakage between users.** Non-admins only ever match
  `actor_id = self OR subject_user_id = self` on `visibility = 'user'` rows.
- **Auth stays clean.** Login/session capture is at the runtime boundary;
  `apps/auth` does not write the platform DB.
- **Append-only.** The log is write-once; no plugin or user API mutates or
  deletes rows. Retention/pruning (if any) is a platform-operator concern (Open
  questions).

## Impact when accepted (deferred — beyond the reserved stub already landed)

| Where               | Change                                                                                     |
| ------------------- | ------------------------------------------------------------------------------------------ |
| `packages/manifest` | Enforce `activity:write`; tests.                                                           |
| `packages/sdk`      | Implement `sdk.activity.log()` against the runtime (replace the stub).                     |
| `packages/db`       | `activity_log` table (both dialects + parity) + `recordActivity()` helper + bootstrap DDL. |
| Runtime             | Capture points, verify-boundary login capture, `sdk.activity` write-mediation, read APIs.  |
| Console             | `/console/activity` admin view (filters, pagination).                                      |
| Account             | `/activity` personal-feed tab.                                                             |
| SRS §3 / §4         | Promote to specified; new `ALG-xx` functional requirements + decision-log entry.           |
| `docs/roadmap.md`   | The implementation task entry (sequenced).                                                 |

## Alternatives considered

1. **Build on `sdk.events`.** `events` is a post-v1, fire-and-forget pub/sub
   channel — it carries no durable record, no actor/tenant provenance, and no
   visibility model. Complementary at best (a capture point could publish an
   event _and_ log activity); not a substitute for an audit table.
2. **`apps/auth` writes the platform DB directly** (for login/logout/register).
   Breaks the identity/platform separation — auth would couple to the platform
   schema. Rejected in favour of runtime verify-boundary capture.
3. **Per-request derived ACL instead of a stored `visibility`.** Computing who
   may see each row at read time is slower and error-prone; a stored
   `visibility` + `subject_user_id` makes the user feed a single indexed query.
4. **Self-access alternatives** (rejected in favour of the universal Account
   tab):
   - A single _role-adaptive_ non-`adminOnly` activity route — would carve a
     non-admin route out of the `adminOnly` Console, which the route-guard gates
     by whole prefix.
   - A _dedicated user Activity plugin_ — most surface to build, a second read
     API, and an extra sidebar/launcher entry for what is a list view.
   - A _notifications/inbox_ framing of `subject_user_id = self` rows — higher
     user value but larger scope; a natural **follow-on** RFC that would build on
     the reserved `sdk.notifications` surface, not this one.

## Open questions

1. **Retention/pruning.** Keep forever, or cap by age/row-count per tenant?
   Proposal: no automatic pruning in v1; revisit if volume warrants.
2. **Registration capture.** Recording `auth.registered` requires observing a
   pre-session event owned by `apps/auth`. Proposal: record on first runtime
   verify of a not-yet-seen user; alternative is a minimal auth→runtime signal.
3. **Logout observability.** Sessions usually expire silently; only an explicit
   sign-out is a clean event. Proposal: log explicit sign-out and session
   revoke; do not synthesise a "logout" for silent expiry.
4. **PII in `metadata`.** What may capture points store (IP, user-agent,
   before/after values)? Proposal: minimise; document per-action.
5. **Export/pagination.** Console feed needs pagination; CSV/JSON export is
   desirable but deferred.
6. **`activity:read`.** Ship the plugin read-back permission/surface with
   `activity:write`, or later? Proposal: later — writers first.

## Adoption path

1. **Now (this change):** reserved `sdk.activity` stub (`log()` throws
   `NotImplementedError`) + `activity:write` permission, all additive (SDK and
   manifest **minor** bumps). No behaviour change for existing plugins.
2. **On acceptance:** apply the "Impact when accepted" table — `activity_log`
   table + `recordActivity()`, capture points + verify-boundary login,
   `sdk.activity` mediation, then the Console and Account views.
3. The mechanism becomes part of the public manifest + SDK contract from the
   `@sovereignfs/sdk` / `@sovereignfs/manifest` minor release that ships it.

## Changelog

| Version | Date     | Change                                                                         |
| ------- | -------- | ------------------------------------------------------------------------------ |
| 0.1     | Jun 2026 | Initial draft; reserved `sdk.activity` stub + `activity:write` permission.     |
| 1.0     | Jun 2026 | Accepted; incorporated into SRS §3.14, §5 (`activity:write`), and Task 0.5.13. |
