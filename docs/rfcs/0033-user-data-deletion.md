---
rfc: 0033
title: User data deletion (Right to erasure)
status: Implemented
date: June 2026
author: kasunben
scope: >
  packages/db, packages/sdk, runtime, apps/auth, plugins/account,
  plugins/console, docs
incorporated_into_plan: 'Yes — epic task 1.7 (completed)'
---

# RFC 0033 — User data deletion (Right to erasure)

## Summary

Users can permanently delete all their data from a Sovereign instance with a single
confirmation in Account → Data. Admins can trigger the same cascade from Console →
Users. The platform wipes every owned record and delegates to installed plugins so
their data tables are cleaned up too. The entire operation is irreversible — a strong
confirmation step (re-enter password) guards against accidental deletion.

This is the natural counterpart to RFC 0007 (user data portability): export your data
first, then delete.

---

## Motivation

Users who want to leave a Sovereign instance have no way to remove their footprint
today — they can only ask the operator to do it manually. Three groups need this:

- **Privacy-conscious users** exercising a GDPR Art. 17 / CCPA-equivalent "right to
  erasure." Even in jurisdictions that do not mandate it, users expect the ability to
  delete their account from any modern platform.
- **Operators** who need a safe, auditable way for admins to purge departed users
  without writing raw SQL against the DB.
- **Plugin developers** whose data tables need a clean hook rather than being left with
  orphaned rows when a user is manually removed.

---

## What gets deleted

### Platform tables (always)

| Table                     | What is deleted                                        |
| ------------------------- | ------------------------------------------------------ |
| User record (better-auth) | The `user` + `session` + `account` rows in the auth DB |
| `account_prefs`           | All preference rows for the user                       |
| `activity_log`            | All activity rows attributed to the user               |
| `consent_grants`          | All consent grants for the user                        |
| `data_access_log`         | All audit entries for the user                         |
| `notifications`           | All notifications for the user                         |
| `notification_prefs`      | The user's notification preference row                 |
| `push_subscriptions`      | All push subscription endpoints for the user           |
| `entitlements`            | All entitlement rows for the user                      |
| Avatar file               | `data/avatars/<user_id>.*` on disk                     |

### Plugin data (opt-in via SDK)

Plugins register a deletion handler via `sdk.portability.provideDelete(handler)`. The
handler receives `{ userId, tenantId, db }` and is responsible for deleting all rows in
the plugin's tables that belong to the user. Plugins that do not register a handler have
their rows left in place (the operator is responsible for cleaning those up manually —
documented in `docs/plugin-development.md`).

**Isolated-database plugins** (`database: "isolated"`): the runtime drops the entire
plugin DB only if the deleted user is the **only user** on the instance; otherwise the
plugin's deletion handler runs and cleans up per-user rows.

### What is NOT deleted

- **Shared / aggregate data** that references the user only by attribution (e.g. plugin
  content visible to other users): plugin handlers decide; the platform does not impose.
- **The audit record of the deletion itself**: a single `account.deleted` activity entry
  is written as the last action before the user row is removed — written to a separate
  admin-visible append-only log, not the user's own feed.

---

## Proposed design

### SDK extension

```ts
// packages/sdk/src/portability.ts  (stable surface, sdk → 1.12.0)
interface DeletionContext {
  userId: string;
  tenantId: string;
  db: unknown;  // DrizzleClient — same as sdk.db.getClient()
}
type DeletionResult = { deleted: number; errors?: string[] };

// New:
sdk.portability.provideDelete(handler: (ctx: DeletionContext) => Promise<DeletionResult>): void;
```

`provideDelete` follows the same registration model as `provideExport`/`provideImport`
(one handler per plugin, called from the plugin's server initialisation code).

### API routes

#### `DELETE /api/account` (user-initiated)

- Gated by the **session** (`x-sovereign-user-id` header — only the current user can
  delete their own account).
- Request body: `{ password: string }` — must match the current user's password
  (verified via a server-to-server call to better-auth `change-password` endpoint's
  verification path, or a dedicated `verify-credentials` endpoint).
- Returns `200` with `{ deletedAt: string }` on success; `403` on wrong password;
  `409` if the user is the sole `platform:owner` (guard — the last owner cannot
  self-delete without first assigning another owner).
- After success: the route clears the session cookies and returns. The client
  redirects to `/login?accountDeleted=1`.

#### `DELETE /api/admin/users/[id]` (admin-initiated)

Extends the existing user-management route. Adds a `?deleteData=true` query parameter:

- Without `?deleteData=true` (existing behaviour): deactivates the user.
- With `?deleteData=true`: runs the full deletion cascade. Requires `user:manage`
  capability. Cannot target a `platform:owner`.

### Deletion cascade (runtime)

`runtime/src/user-deletion.ts` — a single async function `deleteUser(userId, tenantId)`:

1. Collect all registered plugin deletion handlers from the SDK host.
2. Run all plugin handlers in parallel (each in its own try/catch; partial failure is
   recorded but does not abort the platform deletion).
3. Delete all platform table rows in dependency order (consent_grants → data_access_log → activity_log → notifications → notification_prefs → push_subscriptions → entitlements → account_prefs).
4. Delete the avatar file from disk.
5. Call better-auth's admin API to delete the user record (`DELETE /api/auth/admin/remove-user`).
6. Return a `DeletionSummary` (`{ pluginResults, platformRowsDeleted, errors }`) for the
   activity log entry and/or the admin API response.

The cascade runs inside a single async transaction on the **platform DB** for the
platform tables. Plugin handlers run against their own DB connections outside the
transaction (since isolated-plugin DBs are separate stores).

### Activity log

Before the user row is deleted, a `account.deleted` event is written to the admin
activity log using `logActivity()` with the admin actor (or `account.self_deleted` for
self-deletion). This entry survives deletion because it uses the `userId` only as a
string label, not a FK — the log is append-only with no ON DELETE CASCADE.

### UI

#### Account → Data tab

Below the Export/Import section:

```
────────────────────────────────────────
Delete your account
Remove all your data from this instance permanently. This cannot be undone.
Export your data first if you want a copy.

[Delete my account]  ← danger-style button
```

Clicking opens a native `<dialog>`:

```
Delete your account?

All your data will be permanently removed, including your profile, preferences,
activity history, notifications, and any data held by installed plugins.

To confirm, enter your password:
[                        ]   ← password field

[Cancel]  [Delete permanently]
```

`[Delete permanently]` calls `DELETE /api/account`; on success redirects to
`/login?accountDeleted=1`. The login page shows a `"Your account has been deleted."` notice (same pattern as `?signedout=1`).

#### Console → Users

The existing user row gets a **Delete** action alongside Deactivate/Reactivate:

```
[Role ▼] [Deactivate] [Delete…]
```

`[Delete…]` opens a confirmation dialog (`<dialog>`):

```
Delete user: alice@example.com?

This will permanently remove all their data from this instance, including
their profile, activity history, plugin data, and files. This cannot be undone.

[Cancel]  [Delete permanently]
```

Calls `DELETE /api/admin/users/[id]?deleteData=true`.

---

## Semver impact

| Package             | Bump  | Version        | Reason                                                                                                                |
| ------------------- | ----- | -------------- | --------------------------------------------------------------------------------------------------------------------- |
| `@sovereignfs/sdk`  | minor | → `1.12.0`     | `sdk.portability.provideDelete` added to stable surface                                                               |
| `@sovereignfs/db`   | patch | current → next | `deleteUser` helpers (no public type changes)                                                                         |
| `runtime`           | minor | current → next | New `DELETE /api/account` route; `user-deletion.ts` cascade; `DELETE /api/admin/users/[id]?deleteData=true` extension |
| `apps/auth`         | patch | current → next | `verify-credentials` server-to-server helper (or reuse existing auth flow)                                            |
| `plugins/account`   | minor | current → next | New UI section in Data tab                                                                                            |
| `plugins/console`   | patch | current → next | Delete action added to Users table                                                                                    |
| Root `package.json` | patch | —              | One pre-v1 hardening task; slot in roadmap.md                                                                         |

---

## Security considerations

- **Password re-verification:** `DELETE /api/account` must verify the current user's
  credentials server-side before proceeding. It must not rely solely on the session
  cookie — a stolen cookie must not be enough to delete an account.
- **Last-owner guard:** the route returns `409` if the target user is the sole
  `platform:owner`. The admin must assign another owner before deleting. Console UI
  disables "Delete" for `platform:owner` rows.
- **No undo:** deletion is irreversible. The confirmation UX (password re-entry for
  self-deletion; named confirmation dialog for admin deletion) is the sole guard.
  There is no soft-delete / grace period in v1 — document this clearly.
- **Partial failure:** if a plugin handler throws, the cascade records the error in
  `DeletionSummary` but continues with platform cleanup. The admin API response and the
  activity log entry surface the partial failure. Orphaned plugin rows must be manually
  cleaned by the operator.
- **Admin targeting:** `DELETE /api/admin/users/[id]?deleteData=true` requires
  `user:manage` capability and must reject attempts to target `platform:owner` users.

---

## Open questions

1. **Grace period / soft-delete?** Some platforms queue deletions and execute them after
   48 hours, allowing a cancellation window. For v1 the deletion is immediate —
   simpler, and consistent with the "operators own their instance" model. Operators who
   want a grace period can deactivate the user first and delete later.

2. **Plugin handler timeout?** Plugin handlers are awaited in parallel with individual
   try/catch. Should there be a per-handler timeout (e.g. 10 s)? Without one, a slow
   plugin blocks the cascade. **Proposed default:** 30 s per handler, configurable by
   the runtime.

3. **Invitation-only instances — deleting an invited user's slot?** Deleting a user
   frees their email slot. If invite-only is on, the operator would need to re-invite if
   the same email wants to return. No special handling required.

---

## Review checklist

```bash
# User-initiated: DELETE /api/account with wrong password → 403
# User-initiated: DELETE /api/account with correct password → 200; cookies cleared;
#   redirect to /login?accountDeleted=1; login page shows deletion notice
# Self-delete as sole platform:owner → 409
# Admin: DELETE /api/admin/users/[id]?deleteData=true → cascade runs; 200
# Admin: attempt to delete platform:owner → 403
# Plugin with provideDelete handler: handler called; rows removed
# Plugin without handler: no crash; deletion proceeds; summary notes missing handler
# activity_log: account.self_deleted / account.deleted entry survives user row deletion
# Avatar file removed from disk
# All platform table rows for the user absent after deletion
# pnpm format:check && pnpm lint && pnpm typecheck && pnpm test
```

---

## Changelog

- **v0.1** (June 2026) — Initial draft.
