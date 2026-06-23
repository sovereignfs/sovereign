# Epic: Users & Auth

> Everything that proves who a user is, what they are allowed to do, and how their account lifecycle is managed.

## Status

⏳ In Progress

## Overview

This epic covers the full identity stack: the `apps/auth` better-auth server, session verification in the runtime middleware, multi-factor authentication (TOTP + passkeys), the capability-based role model, and the user data deletion flow. It is the foundation every other epic builds on — no plugin route is served without a verified session.

## Tasks

#### ✅ 1.1 — `apps/auth` — better-auth server

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

#### ✅ 1.2 — Local session verification in middleware (AUTH-05)

**Goal:** Replace the runtime middleware's per-request `/api/verify` round-trip to the auth server with **local** verification of the session, using the shared secret.

**Delivered:** The auth server enables better-auth's signed cookie cache (`session.cookieCache`, `maxAge` 300s), which sets a `session_data` cookie holding session+user HMAC-signed with `AUTH_SECRET`. The runtime middleware verifies it offline via `getCookieCache` (`better-auth/cookies`, Edge-safe) plus the pure `verifiedUserFromCache`/`resolveAuthSecret` helpers (`runtime/src/session-verify.ts`), using `SOVEREIGN_AUTH_SECRET ?? AUTH_SECRET` (local verify skipped when neither is set — no insecure default). On a cache miss it falls back to `/api/verify` (AUTH-06), which now re-emits better-auth's `Set-Cookie`, forwarded by the middleware so the cache self-refreshes. All prior behaviour is preserved (`/login` redirect, `x-sovereign-user-*` headers, `adminOnly` 403, disabled-plugin 404, root-plugin rewrite). Trade-off: role/active changes are stale for at most `maxAge`. Runtime services in all compose files now receive `AUTH_SECRET`.

**SRS reference:** AUTH-05

**Review checklist:**

- An authenticated request is verified with no network call to the auth server
- An invalid/expired/missing token redirects to `/login`
- Deactivated accounts are rejected (parity with the current `active === false` check)
- `SOVEREIGN_AUTH_SECRET` is required at startup (no insecure default)

---

#### ✅ 1.3 — Logout / self sign-out

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

#### ✅ 1.4 — Passkeys & TOTP MFA (RFC 0012)

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

#### ✅ 1.5 — Platform roles & capabilities (RFC 0021)

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

#### ✅ 1.6 — Plugin-declared capabilities (RFC 0022)

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

**Root version bump:** `0.9.8` → `0.9.1`

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

## Related RFCs

- [RFC 0012 — Passkeys & TOTP MFA](../rfcs/0012-passkeys-and-mfa.md)
- [RFC 0021 — Platform roles & capabilities](../rfcs/0021-platform-roles-and-capabilities.md)
- [RFC 0022 — Plugin-declared capabilities](../rfcs/0022-plugin-capabilities.md)
- [RFC 0033 — User data deletion](../rfcs/0033-user-data-deletion.md)

## Related Docs

- [plugin-development.md — SDK auth surface](../plugin-development.md)
- [self-hosting.md — Auth env vars](../self-hosting.md)
- [security.md — Session & cookie model](../security.md)

## Cross-references

- The Account plugin (see [Plugin — Accounts](plugin-console.md)) owns the Security tab UI for MFA enrollment and session management.
- User data deletion in this epic calls plugin handlers registered via `sdk.portability.provideDelete` — see [Data Sovereignty](data-sovereignty.md).
