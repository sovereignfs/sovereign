# Current Task

**Epic task:** 1.7
**Roadmap version:** 0.9.1
**Branch:** feat/user-data-deletion
**Epic file:** docs/epics/users-auth.md

---

#### 📋 1.7 — User data deletion (RFC 0033)

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

**SRS reference:** RFC 0033 (`docs/rfcs/0033-user-data-deletion.md`)

**Review checklist:**

- `DELETE /api/account` with wrong password → 403; with correct password → 200,
  cookies cleared, `?accountDeleted=1` notice on login page
- Sole `platform:owner` attempting self-delete → 409; Console "Delete" disabled for owner rows
- Plugin with `provideDelete` handler: rows removed; handler result in `DeletionSummary`
- Plugin without handler: cascade proceeds; summary notes the missing handler (no crash)
- `account.self_deleted` / `account.deleted` activity log entry present after deletion
- Avatar file removed from `data/avatars/`; all platform-table rows for user absent
- `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test`
