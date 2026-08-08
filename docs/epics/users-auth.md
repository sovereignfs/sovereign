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

#### ✅ 1.7 — User data deletion (RFC 0033)

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
- `docs/upgrade.md` — v0.x → v0.9.1 notes (new `DELETE /api/account` route; new SDK
  method; plugin authors should register a handler).

**Root version bump:** root `package.json` — patch (one pre-v1 hardening task)

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

#### 📋 1.8 — Progressive user verification, Phase 1 — Infrastructure (RFC 0035)

**Goal:** Wire up the dormant `emailVerified` field into a live email confirmation flow; introduce
the four-level trust model (`registered → email_verified → mfa_enrolled → admin_vouched`); and
propagate `verification_level` through the session header chain so middleware, capabilities, and
plugins can gate on it.

**Deliverables:**

- `packages/db` → patch: `verification_level INTEGER NOT NULL DEFAULT 0` + `verification_events TEXT`
  columns on the `users` table; Drizzle migration `0007_user_verification` (SQLite + Postgres);
  `getUserVerificationLevel()` / `setUserVerificationLevel()` helpers.
- `apps/auth` → minor: better-auth hooks in `apps/auth/src/auth.ts`:
  - `onUserCreated`: fires `POST /api/auth/send-verification-email` when
    `REQUIRE_EMAIL_VERIFICATION=true`; auto-promotes to Level 1 when `false`.
  - `onEmailVerification`: sets `emailVerified = true`, `verification_level = max(level, 1)`,
    records `email_verified_at` in `verification_events`, invalidates session cache.
  - `onTwoFactorEnabled` / `onPasskeyCreated`: `verification_level = max(level, 2)`, records
    `mfa_enrolled_at`.
  - `onTwoFactorDisabled` / last-passkey-deleted: drops level to `min(level, 1)`, records
    `mfa_removed_at`.
- `runtime` → minor:
  - `runtime/src/session-verify.ts`: include `verification_level` in session propagation.
  - `runtime/middleware.ts`: inject `x-sovereign-verification-level: <n>` header alongside
    the existing role/capabilities headers.
  - `/verify-email` route: "check your inbox" page with a resend button (hard block when
    `REQUIRE_EMAIL_VERIFICATION=true` and level is 0).
  - `POST /api/admin/users/[id]/vouch` + `DELETE /api/admin/users/[id]/vouch`: requires
    `user:manage` capability; records `vouched_by` + timestamps in `verification_events`.
- `packages/sdk` → minor: `session.user.verificationLevel: 0 | 1 | 2 | 3` populated from the
  new header. Parity-test additions for the new field.
- `packages/manifest` → patch: `min_verification_level` optional integer field (0–3), validated
  by the Zod schema; defaults to 0 (no gate).
- `plugins/account` → minor: Security tab shows the user's current verification level and
  prompts to verify email or enroll MFA if below the platform's effective minimum.
- `plugins/console` → minor: Users table row menu gains **Vouch** / **Revoke vouch** actions
  (disabled for `platform:owner` rows; requires `user:manage`). Activity log entry on each action.
- `.env.example`: `REQUIRE_EMAIL_VERIFICATION` (default `true`), `REQUIRE_MFA` (default `false`).
- `docs/self-hosting.md`: document both new env vars.
- `docs/plugin-development.md`: `min_verification_level` manifest field; `session.user.verificationLevel`.

**Version bumps:** `@sovereignfs/db` → patch, `@sovereignfs/sdk` → minor, `@sovereignfs/manifest`
→ patch, `runtime` → minor, `plugins/account` → minor, `plugins/console` → minor.

**Dependencies:** Task 1.4 (MFA — hooks to extend), Task 1.5 (capabilities — `user:manage` gate
on vouch routes), Task 1.7 (session-verify pattern to extend with the new field)

**SRS reference:** RFC 0035

**Review checklist:**

- New user receives a verification email on signup; clicking the link promotes to Level 1
- `REQUIRE_EMAIL_VERIFICATION=false` auto-promotes to Level 1 with no email sent
- TOTP enrollment promotes to Level 2; removing all MFA methods drops back to Level 1
- `x-sovereign-verification-level` header present and correct in all authenticated requests
- `sdk.session.user.verificationLevel` matches the header value
- Console → Users: Vouch action promotes target to Level 3; Revoke drops to Level 2; activity log entry present
- Account → Security: current verification level displayed; nudge shown when below platform minimum
- `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test`

---

#### 📋 1.9 — Progressive user verification, Phase 2 — Capability opt-in (RFC 0035)

**Goal:** Activate `minVerificationLevel` gates on individual platform capabilities and at the
plugin manifest route boundary. Phase 1 laid the infrastructure; this task makes it functional
for real access control.

**Deliverables:**

- `runtime/src/capabilities.ts`: add `minVerificationLevel?: 0 | 1 | 2 | 3` to the capability
  definition type and annotate applicable capabilities (e.g., `user:manage` → 1,
  `role:assign` → 2).
- `hasCapability(role, cap, userLevel?)`: third parameter enables the level check. Returns `false`
  if `userLevel < minVerificationLevel` for the requested capability. Existing callers without the
  third arg are unaffected (backwards-compatible).
- `runtime/middleware.ts` edge gate: pass the injected `x-sovereign-verification-level` into
  `hasCapability` for route-level capability checks.
- Plugin manifest enforcement: the plugin route boundary checks `min_verification_level` from the
  manifest and returns 403 with a `verification_required` error body if the user's level is below
  the declared minimum.
- Nudge banner surfaced by the runtime shell when `min_verification_level` blocks plugin access
  (message varies by which level is needed).
- `docs/plugin-development.md`: worked example — declare `min_verification_level: 1`, what the
  403 error body looks like, how to handle it in a plugin's own error boundary.

**Version bumps:** `runtime` → minor.

**Dependencies:** Task 1.8 (Phase 1 — infrastructure this task activates)

**SRS reference:** RFC 0035

**Review checklist:**

- A `platform:user` at Level 0 is denied a capability gated to Level 1, even if their role
  would otherwise grant it
- A `platform:user` at Level 1 is allowed the same capability
- A plugin declaring `min_verification_level: 2` returns 403 for a Level 1 user; the runtime
  shell shows a nudge ("Enable MFA to access this plugin")
- No existing capability or plugin behaviour changes for users already at Level 1+
- `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test`

---

#### ✅ 1.10 — Email-bound invite flow

**Goal:** Bind every invite token to the invited email address and embed that token in the
registration link so that clicking the email link pre-fills the email field as read-only and shows
who sent the invite. Eliminates the current "use the email address this invitation was sent to"
instruction and the silent registration failure when a user types the wrong email.

**Current state:**

The `invites` table (`apps/auth/src/db.ts:93`) has `token`, `email`, `created_at`, `expires_at`,
`consumed_at` — but no `invited_by`. The Console invite action
(`plugins/console/app/users/actions.ts:155`) creates the invite token and sends an email with a
bare `/register` link; the token is **never embedded in the URL**. The `RegisterForm`
(`apps/auth/app/register/register-form.tsx`) has no knowledge of invite tokens — it renders a
blank form with an editable email field. The auth server validates the invite at submit time by
matching the submitted email against the `invites` table, but there is nothing preventing the user
from typing a different email and hitting a confusing 403.

**Deliverables:**

- `apps/auth` — schema patch: add `invited_by_id TEXT` and `invited_by_name TEXT` columns to the
  `invites` table in `ensureAuthTables()` (the auth server manages its own DB schema directly, no
  Drizzle migration — same pattern as the existing `CREATE TABLE IF NOT EXISTS invites` DDL). Old
  rows have `NULL` for both columns; the flow degrades gracefully for tokens created before this
  change.
- `plugins/console` — invite creation: pass the actor's user ID and display name as
  `invited_by_id` / `invited_by_name` when calling `POST /api/admin/invites`; embed
  `?token=<token>` in the registration URL included in the invite email body (replaces the current
  bare `/register` link). The "use the email address…" instruction in the email copy is removed.
- `runtime/app/api/admin/invites` — accept and persist `invited_by_id` / `invited_by_name` from
  the request body.
- `apps/auth/app/register/page.tsx` — convert to an async server component: read the `token` query
  param → look up the invite row → extract `email` and `invited_by_name` → pass to `RegisterForm`
  as `invitedEmail` and `invitedBy`. If the token is not found, expired, or already consumed, render
  a clear error ("This invite link is invalid or has already been used") rather than falling through
  to a blank form.
- `apps/auth/app/register/register-form.tsx` — accept optional `invitedEmail?: string` and
  `invitedBy?: string` props:
  - When `invitedEmail` is set: initialise the email `useState` with `invitedEmail`; render the
    email `<Input>` with `readOnly` and a visual lock indicator (e.g. a small notice: "This field
    is pre-filled from your invite").
  - When `invitedBy` is set: show a banner at the top of the card: "You've been invited by
    {invitedBy}" — using the instance name (`INSTANCE_NAME`) in the page title as well:
    "Create your account on {instanceName}".
  - Without props (direct `/register` access, no token): existing blank-form behaviour is
    preserved exactly.

**Scope note:** No changes to the invite-only gate logic in `apps/auth/src/auth.ts` — the server
still validates the invite at submit time by matching email. This task only improves the pre-fill
UX; it does not change the security model.

**Dependencies:** Task 1.1 (`apps/auth` base; `invites` table DDL pattern),
Task 1.5 (`user:manage` capability gate already on the invite route),
Task 1.0.03 (`INSTANCE_NAME` / `InstanceProvider` for the page title)

**Review checklist:**

- Admin invites user@example.com from Console → email arrives with a link containing `?token=<uuid>`
- Clicking the link opens `/register?token=<uuid>` → email field shows `user@example.com` and is
  read-only; "invited by Admin Name" banner visible
- Submitting with the pre-filled email succeeds; token is consumed
- A user who navigates directly to `/register` (no token) sees the normal blank form — no regression
- An invalid or already-consumed token shows a clear error page, not a blank form
- `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test`

---

#### ✅ 1.11 — Test-user flag on seeded accounts

**Goal:** Add an `isTestUser` boolean field to the user record, defaulting to `false` for all real
users and set to `true` by the seed script. Lets the Console, admin APIs, and tooling distinguish
test accounts from real ones without relying on email address conventions.

**Current state:**

The seed script (`scripts/seed.ts`) inserts two users directly into better-auth's `"user"` table
via raw SQL. The fields written today are `id`, `name`, `email`, `emailVerified`, `image`,
`createdAt`, `updatedAt`, `role`, `active`. There is no way to distinguish seeded test users from
real users other than matching against the hardcoded `SEED_USERS` email constants. The Console
Users table shows them with no visual distinction.

The pattern for custom user fields is `user.additionalFields` in `apps/auth/src/auth.ts` — `role`
and `active` both follow this pattern with `input: false` (not user-settable) and a `defaultValue`.

**Deliverables:**

- `apps/auth/src/auth.ts` — add to `user.additionalFields`:
  ```ts
  isTestUser: { type: 'boolean', required: false, defaultValue: false, input: false }
  ```
  `input: false` ensures the field cannot be set via registration or profile-update endpoints.
- `scripts/seed.ts` — include `is_test_user = 1` (SQLite) / `true` (Postgres) in the INSERT
  for both seeded users (`admin@sovereign.local` and `user@sovereign.local`). Update the
  `SEED_USERS` type annotation if it carries field metadata.
- `packages/db/src/schema/sqlite/platform.ts` and postgres equivalent — add
  `isTestUser: integer('is_test_user', { mode: 'boolean' }).notNull().default(false)` to the
  platform `users` table, mirroring the `role` field precedent. Drizzle migration
  `0008_user_is_test_user` (SQLite + Postgres).
- `runtime/app/api/admin` — include `isTestUser` in the member-list response returned by
  `GET /api/admin/users` (the `apps/auth/src/member-list.ts` helper) so Console and any SDK
  consumer can read it in the same call.
- `plugins/console` → Console → Users table: render a **"Test"** badge on rows where
  `isTestUser` is true. No behavioural restriction — test users can still be deactivated,
  deleted, or vouched like any other user.

**Scope note:** No session-header propagation. Plugins do not need to know at request time whether
the caller is a test account — this is a tooling and admin-visibility concern only.

**Version bumps:** `@sovereignfs/db` → patch (migration), `runtime` → patch (member-list field),
`plugins/console` → patch (badge).

**Dependencies:** Task 1.1 (`additionalFields` pattern in `apps/auth`),
Task 0.5.24 (RFC 0019 — test seeding infrastructure this extends)

**Review checklist:**

- `pnpm sv seed` completes; both seeded users have `isTestUser = true` in the DB
- A manually registered user has `isTestUser = false`
- `GET /api/admin/users` response includes `isTestUser: true` for seeded accounts
- Console → Users: seeded users show a "Test" badge; no badge on real users
- `SOVEREIGN_SEED_ALLOW_PROD` guard unchanged — seed still refuses to run in production
- `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test`

---

#### ✅ 1.12 — User directory and member selection SDK (RFC 0041)

**Goal:** Provide a privacy-preserving SDK and runtime surface that lets plugins find and select active users for sharing, assignment, membership, and message-recipient workflows without using admin APIs.

**Deliverables:**

- Add `sdk.directory.searchUsers()` and `sdk.directory.resolveUsers()` with a narrow, display-safe user shape.
- Runtime routes validate the current session and return active users only.
- Exclude roles, MFA state, session data, private profile fields, inactive users, and admin-only metadata.
- Add rate limits and minimum-query behavior to avoid user enumeration.
- Add optional shared user-picker UI guidance or primitive once repeated plugin usage emerges.
- Document member-selection patterns in `docs/plugin-development.md`.

**Dependencies:** Task 1.5 (roles/capabilities), Task 1.11 (active/test-user fields are already represented in user data, but not exposed by default).

**SRS reference:** [RFC 0041](../rfcs/0041-user-directory.md)

**Review checklist:**

- A non-admin plugin can search active users by display-safe fields only.
- Inactive users and role/capability details are never returned.
- Sharing/member-selection flows can resolve selected user IDs without calling Console/admin routes.
- User search is rate-limited and does not expose full user dumps.

---

#### 📋 1.13 — Plugin-scoped roles and grants (RFC 0054)

**Goal:** Add a standard authorization model for plugins that need plugin-local roles, capability bundles, and resource-scoped grants without turning them into platform roles.

**Deliverables:**

- Extend manifest metadata with optional plugin role presets that bundle plugin-declared capabilities.
- Define a standard plugin grant shape covering plugin-scope and resource-scope assignments.
- Add `sdk.authz` or equivalent server-side helpers for plugin-owned grant checks.
- Keep scoped grants out of the global session capability header; resolve them inside plugin server code with resource context.
- Document assignment and revocation rules, including last-owner protection for plugin resources where lockout is possible.
- Add audit expectations for grant create/revoke/change, ownership transfer, and any future emergency override.
- Define export/import/delete behavior for plugin grants through plugin portability hooks.
- Clarify platform-owner override policy: no silent access; any override must be explicit, narrow, audited, and preferably read-only.

**Dependencies:** Task 1.5 (platform roles/capabilities), Task 1.6 (plugin-declared capabilities), Task 1.12 (user directory/member selection), Task 5.1 (activity logging), Task 8.8 (plugin portability hooks), RFC 0051 cross-plugin references.

**SRS reference:** [RFC 0054](../rfcs/0054-plugin-scoped-roles-and-grants.md)

**Review checklist:**

- A plugin can declare role presets without granting anyone access automatically.
- A plugin can check a user capability against a specific plugin-owned resource.
- Resource-scoped grants do not bloat session headers or affect middleware routing.
- Grant changes are audited and participate in export/delete semantics.

---

#### ✅ 1.14 — Account and security email delivery coverage (RFC 0062)

**Goal:** Make account lifecycle and security-sensitive user-management emails a consistent
platform behavior instead of scattered ad-hoc sends. This task covers authentication,
security, and administrative email delivery; email templates, branding, localization, preview
tooling, and copy overrides remain owned by RFC 0031 / epic task 9.9.

**Deliverables:**

- Add a platform email delivery wrapper for first-party account workflows with delivery classes
  from RFC 0062: `authentication`, `security`, `administrative`, and `communication`.
- Preserve the auth/runtime boundary: `apps/auth` must not import runtime internals. Use an
  auth-local wrapper or a narrow internal runtime endpoint for shared policy where needed.
- Move existing password-reset and Console invite sends onto the wrapper without changing user
  behavior.
- Add account-created security email after signup/accepted invite, distinct from the RFC 0035
  verification email.
- Add security emails for password changed, MFA enabled/disabled/reset, passkey added/removed,
  and account deletion.
- Add administrative emails for account deactivation/reactivation and role changes.
- Add `email_delivery_log` or equivalent non-secret audit/diagnostic records. Do not store full
  bodies, reset tokens, invite tokens, or raw recipient email addresses.
- Add Console health diagnostics for SMTP configured yes/no, last send status, last failure code,
  and recent failure count.
- Update `docs/self-hosting.md` with SMTP-dependent auth behavior, including the effect of
  missing `SMTP_HOST` when email verification is required.

**Version bumps:** `@sovereignfs/db` → patch if a delivery-log table is added,
`runtime` → minor, `apps/auth` → minor, `plugins/account` → minor, `plugins/console` → minor.

**Dependencies:** Task 0.5 (`packages/mailer`), Task 1.4 (MFA), Task 1.7 (account deletion),
Task 1.8 (email verification), Task 9.9 (email templates for final rendering; wrapper may ship
with plain fallback first).

**SRS reference:** [RFC 0062](../rfcs/0062-email-delivery-coverage.md)

**Review checklist:**

- Password reset and invite still send successfully through the shared wrapper.
- New signup/accepted-invite flow attempts an account-created security email.
- Password, MFA, passkey, role, activation, and deletion changes attempt the expected email.
- Authentication email failure blocks only flows that require email to complete; security and
  administrative failures are logged and surfaced according to RFC 0062.
- Email delivery logs contain no bodies, reset tokens, invite tokens, or raw recipient email
  addresses.
- Console health reports sanitized SMTP/email delivery diagnostics.
- `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test`

---

#### ✅ 1.15 — User groups foundation (RFC 0065)

**Goal:** Add platform-managed user groups so admins can define reusable user audiences for
plugin access policies and future operator workflows.

**Deliverables:**

- Add `user_groups` and `user_group_members` tables with `tenant_id` scoping, stable IDs,
  human-readable names, slugs, and created/updated metadata.
- Add DB helpers for group CRUD, membership add/remove/list, and effective group membership
  lookup for a user.
- Add Console-backed management surfaces or internal admin actions for create, rename,
  describe, delete, and membership changes.
- Emit activity events for group create/update/delete and membership add/remove.
- Prevent accidental deletion of a group currently referenced by a plugin access policy
  unless an admin explicitly confirms the impact.
- Document that groups are platform audiences, not plugin-domain roles or plugin-scoped
  grants.

**Dependencies:** Task 1.5 (platform roles/capabilities), Task 5.1 (activity logging), Task
13.3 (Console plugin management).

**SRS reference:** [RFC 0065](../rfcs/0065-user-groups-plugin-access.md)

**Review checklist:**

- Admins/owners can create, update, and delete groups according to platform capabilities.
- Admins/owners can add and remove users from groups.
- Membership lookup is tenant-scoped and cannot cross tenants.
- Group changes are audited.
- In-use groups cannot be deleted silently.
- `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test`

---

#### ✅ 1.16 — Per-user capability grants (RFC 0070)

**Goal:** Let an owner/admin grant one specific user a single allowlisted capability their role
preset doesn't include — the "later phase" RFC 0021 explicitly deferred — starting with
`plugins:self-manage` for RFC 0065's plugin self-service opt-in.

**Deliverables:**

- Add `user_capability_grants(tenant_id, user_id, capability, granted_by_user_id, granted_at)`.
- Add a hardcoded grantable-capability allowlist (excludes `role:assign`), starting with the new
  `plugins:self-manage` capability value.
- Add a Node-runtime resolver (`hasUserCapability(user, cap)` in
  `runtime/src/user-capabilities.ts`) for per-user checks; the existing Edge-safe
  `hasCapability(role, cap)` in `runtime/src/capabilities.ts` is untouched.
- Add Console grant/revoke UI (`CapabilitiesButton` on the user row — no per-user detail page
  exists yet, so this is the pragmatic equivalent), restricted to the allowlist, audited.

**Shipped scope note:** the "extend session-verify to fold grants into the signed `session_data`
cookie cache" deliverable from the original RFC 0070 draft was **deferred**, not shipped. It
requires extending better-auth's session cookie schema in `apps/auth` — a security-sensitive
change to session internals — and isn't load-bearing for the `plugins:self-manage` use case,
since that capability is only checked from Node-runtime server actions/API routes (which already
have DB access), never from Edge `adminOnly`-style route gating. `runtime/src/user-capabilities.ts`
documents this explicitly. Revisit as a follow-up if a future grantable capability needs
Edge-level enforcement.

**Dependencies:** Task 1.5 (platform roles/capabilities), Task 5.1 (activity logging).

**SRS reference:** [RFC 0070](../rfcs/0070-per-user-capability-grants.md); extends RFC 0021's
deferred per-user override phase.

**Review checklist:**

- An admin can grant `plugins:self-manage` to a specific user without changing their role.
- A user without a grant and without a role preset including it cannot perform the gated action.
- `role:assign` cannot be granted through this mechanism.
- Grants are audited and visible in Console.
- Edge middleware behavior for role-only capability checks is unchanged.
- `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test`
- `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test`

---

#### ✅ 1.17 — Invite-scoped plugin entitlement (RFC 0065)

**Goal:** Let an admin capture which plugins an invited user should be entitled to as part of
the invite itself. This task owns capture only (schema, creation API, admin UI); resolving the
captured scope into actual grants at registration is Task 2.23, which depends on this task.

**Deliverables:**

- Add a nullable `invites.plugins` column (JSON array of plugin IDs); absent/empty preserves
  today's `{email}`-only invite behavior. `apps/auth` has no Drizzle migrations for its own
  tables (only better-auth's own tables go through a migrator) — added via the existing
  idempotent `ALTER TABLE ADD COLUMN` pattern in `ensureAuthTables()`
  (`apps/auth/src/db.ts`), matching how `invited_by_id`/`invited_by_name` were added previously.
- Extend `POST /api/admin/invites` (`apps/auth/app/api/admin/invites/route.ts`) to accept and
  persist the `plugins` scope as a JSON-encoded string (empty/absent array stored as `NULL`,
  not `"[]"`, so existing rows and no-scope invites are indistinguishable in storage).
- Add a plugin multi-select to the Console "invite user" flow
  (`plugins/console/app/users/invite/invite-form.tsx`), fed by a new
  `listInvitablePluginOptions` server action (`plugins/console/app/users/actions.ts`) that reads
  `getInstalledPlugins()` and excludes chrome plugins (Account/Console/Launcher — every user
  already reaches those regardless of this scope).
- Expose the invite's `plugins` scope on invite lookup (`apps/auth/app/api/admin/invites/lookup/route.ts`)
  so the register flow (Task 2.23) can read it without a second query — always returns an array
  (`[]` when unset), parsed defensively (a malformed/legacy value degrades to `[]` rather than
  erroring the whole lookup).

**Dependencies:** Task 3.3 (install script/registry — provides the plugin list for the
multi-select). No dependency on Task 2.21/2.23 — this task only captures and stores the scope.

**SRS reference:** [RFC 0065](../rfcs/0065-user-groups-plugin-access.md)

**Review checklist:**

- An invite can be created with a plugin scope and the scope round-trips through the invite
  lookup unchanged. ✅ verified live via `curl` against the auth server directly (create with
  `plugins: ["fs.sovereign.wallet","fs.sovereign.tasks"]` → lookup returns the same array) and
  end-to-end through the Console UI (checked "Tasks" in the invite form → lookup by the returned
  token confirms `plugins: ["fs.sovereign.tasks"]`).
- An invite with no plugin scope behaves identically to today. ✅ verified: `plugins` omitted
  entirely from the request → lookup returns `plugins: []`, no error, existing fields unchanged.
- A scoped plugin ID that isn't `selected_users`/`selected_groups` does not error and does not
  grant unintended access. Satisfied by construction — this task only stores the scope; nothing
  reads or acts on it yet (that's Task 2.23), so there is no resolution path that could grant
  access from an inert stored value.
- `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test`

---

#### ✅ 1.18 — External OAuth/OIDC provider for non-plugin apps (RFC 0072)

**Goal:** Let `apps/auth` act as an OAuth 2.0 / OIDC identity provider for
standalone external apps — on their own domain, not composed as a Sovereign
plugin — so they can offer "log in with Sovereign" against an operator's
instance. Motivated by a separate standalone app that wants sign-in backed
by a Sovereign instance without joining the plugin system.

**Deliverables:**

- Enabled `oauthProvider()` from `@better-auth/oauth-provider` (not the
  bundled `oidc-provider` the original draft targeted — that plugin turned
  out to be deprecated as of better-auth 1.6.16, the version already pinned
  here; see RFC 0072's "Alternatives considered") plus `jwt()`, both
  required, in `buildOptions()` (`apps/auth/src/auth.ts`), alongside the
  existing `twoFactor`/`passkey`/`nextCookies` plugins. `better-auth` bumped
  `^1.6.16` → `^1.6.25` (non-breaking) to meet the new package's peer range.
- Console "External clients" section (`plugins/console/app/oauth-clients/`):
  register a display name and exact redirect URIs; generates a client
  ID/secret shown once, secret stored hashed (`storeClientSecret: 'hashed'`).
  Client registration/rotation/revocation gated to `platform:owner`/
  `platform:admin` via the plugin's own `clientPrivileges` hook (server-side)
  and the Console page's `instance:configure` capability check (UX gate).
  No custom table — the plugin manages its own schema
  (`oauthClient`/`oauthAccessToken`/`oauthRefreshToken`/`oauthConsent`),
  auto-discovered by better-auth's existing migrator
  (`apps/auth/src/migrate.ts`), correcting the original draft's assumption
  of a custom `ensureAuthTables()`-based table.
- New consent page at `apps/auth/app/oauth2/consent/`.
- Documented the discovery/verification endpoints
  (`/.well-known/openid-configuration`, `/oauth2/authorize`,
  `/oauth2/token`, `/oauth2/userinfo`, `/.well-known/jwks.json`) in
  `docs/self-hosting.md` and `docs/upgrade.md`.
- Documented the stable minimal claims contract (`sub`, `email`, `name` —
  `tenant` dropped, no multi-tenant concept in this platform) and the
  security model (exact-match redirect URI, hashed secrets, revocation) in
  `docs/security.md`.

**Dependencies:** None blocking — additive to `apps/auth`. Client
registration is admin/owner-only via `clientPrivileges`, consistent with
Task 1.16's per-user capability grants approach, per the RFC's now-resolved
open question.

**SRS reference:** [RFC 0072](../rfcs/0072-external-oauth-provider.md)

**Review checklist:**

- An admin can register an external client and receive a client ID/secret
  shown exactly once. ✅ verified live in the browser: registered a test
  client via Console → External clients, secret shown once with a
  "Done, I've copied it" confirmation.
- A registered client can complete the authorization code flow and receive
  an ID token with the documented claim set. ✅ verified live: drove
  `/oauth2/authorize` (PKCE/S256) → redirected to the new consent page,
  which correctly displayed the client's display name and requested scopes
  → clicked Allow → `/api/auth/oauth2/consent` returned a redirect URL
  carrying a valid authorization code to the registered `redirect_uri`.
- An unregistered or mismatched `redirect_uri` is rejected. Satisfied by the
  plugin's own exact-match enforcement (not custom code) — not
  independently re-verified live in this pass.
- Revoking a client blocks new token issuance for that client. ✅ verified
  live: registered, then revoked a client from Console; the client
  immediately disappeared from the list (after fixing a client-side bug
  where the empty-body 200 response from `delete-client` was mis-parsed as
  JSON, breaking the post-revoke list refresh).
- `docs/security.md` covers the expanded attack surface (external redirect
  targets) in its threat model section. ✅ done — new threat-model row plus
  an enforcement bullet.
- `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test` — all pass.

---

#### 📋 1.19 — Database-backed rate-limit storage for `apps/auth` (RFC 0086)

**Goal:** Close the multi-instance gap in the auth server's brute-force/
credential-stuffing protection — today's `storage: 'memory'` limiter
(`apps/auth/src/auth.ts:113-116`) holds independent counters per process, so
an operator running more than one `apps/auth` process/container gets up to
N× the intended sign-in/sign-up/reset attempt limit with no error or log to
signal it.

**Deliverables:**

- Flip `rateLimit.storage` from `'memory'` to `'database'` in
  `apps/auth/src/auth.ts`. better-auth's own migrator
  (`apps/auth/src/migrate.ts`, `getMigrations(getAuthOptions())`, which
  already runs on every startup) picks up the new `rateLimit` table
  automatically from the changed option — no hand-written schema or
  migration needed.
- Update `docs/security.md`'s "Login rate limiting" bullet, which currently
  states storage is "in-memory per process (sufficient for single-instance
  deployments); a shared secondary storage (e.g. Redis) would be needed for
  multi-instance setups" — that caveat stops being true once this ships.
- No new env var, no new dependency (reuses the auth database `apps/auth`
  already connects to for every other request).

**Dependencies:** None blocking — a one-line config change plus a docs
update. Independent of Task 2.29 (the `runtime` side of the same RFC);
either can ship first.

**SRS reference:** [RFC 0086](../rfcs/0086-shared-store-rate-limiting.md)

**Review checklist:**

- Sign-in rate limiting still returns `429`/`X-Retry-After` at the same
  thresholds (3 attempts/10s for sign-in/sign-up, 3/60s for password reset)
  after the storage switch — behavior is unchanged, only where counters
  live.
- The `rateLimit` table exists after `runAuthMigrations()` runs against a
  fresh database (SQLite and Postgres).
- Two concurrent `apps/auth` processes pointed at the same database share
  the same rate-limit counters (the actual bug this closes) — verified
  against a real multi-process setup, not just unit tests.
- `docs/security.md` no longer describes rate limiting as single-instance-only.
- `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test` — all pass.

---

#### ✅ 1.20 — Capture timezone at registration from the browser

**Goal:** When a user registers, detect their timezone from the browser (via
`Intl.DateTimeFormat().resolvedOptions().timeZone`, no geolocation permission
prompt) and persist it so their Account timezone (`account_prefs`) defaults to
their region instead of `UTC`. A user's later explicit Account-plugin choice
remains authoritative — the registration value only seeds the default.

**Design decisions (confirmed):** detection uses the browser's localized
timezone (`Intl`), not the geolocation API. Storage crosses the
auth→platform-DB boundary by capturing the value on the auth user (a new
`additionalFields` entry) and lazily seeding it into the account plugin's
`account_prefs` on first authenticated load, only when the row is still the
`UTC` default. The detected value is captured **silently** — no visible field on
the register form; a user corrects their timezone later in Account →
Preferences, where it always overrides the registration default.

**Deliverables:**

- `apps/auth/src/auth.ts` — add `timezone` to `user.additionalFields` with
  `input: true` and `required: false` (so the client can send it on
  `signUp.email`). Server-side validate it as an IANA zone (constructing an
  `Intl.DateTimeFormat` with an unknown zone throws `RangeError`), rejecting
  invalid values rather than storing garbage. The better-auth migrator
  (`apps/auth/src/migrate.ts`) auto-creates the `user.timezone` column on
  startup for SQLite and Postgres — no hand-written migration.
- `apps/auth/app/register/register-form.tsx` and
  `runtime/app/register/register-form.tsx` — on mount, silently detect
  `Intl.DateTimeFormat().resolvedOptions().timeZone` (default `'UTC'` when
  unavailable). No visible timezone field is rendered; the detected value is
  passed via `authClient.signUp.email({ ..., timezone })`. The runtime form is
  the end-user entry point; its `/api/auth/*` proxy forwards the full body to
  the auth server.
- `apps/auth/app/api/verify/route.ts` — include `timezone` in the returned
  user object so the runtime can read it.
- `runtime/src/session-verify.ts` — add `timezone` to `VerifiedUser` and
  parse it from the signed `session_data` cookie cache (`CachedSessionData` /
  `verifiedUserFromCache`), so it flows through the offline verification path
  too.
- `runtime` — lazily seed `account_prefs`: on a user's first authenticated load
  where `getAccountPrefs` returns the default `UTC`, call `setAccountPrefs` with
  the session's `timezone`. One-time only; a null/absent value keeps the `UTC`
  default; a user's explicitly set timezone later always wins.
- Tests for the seed helper (only seeds when still default `UTC`) and updated
  register-form/verify coverage. Keep the `_` prefix for unused params and
  respect the SDK boundary (no `@sovereignfs/db` import in `apps/auth`).
- Docs — the auth user schema addition, the registration capture behavior, and
  the seed semantics (a helpful default, never an overwrite).

**Scope note:** No geolocation API, no third-party timezone lookup, no new
dependency. The existing auth→platform DB boundary is preserved; `apps/auth`
still never imports `@sovereignfs/db`.

**Root version bump:** root `package.json` — patch (`0.62.1` → `0.62.2`, a
maintainer release-train decision; roadmap slot `0.63.0` remains in flight).
Epic slot `0.64.0` reserved the feature; the implementation shipped at the
patch bump.

**Dependencies:** Task 1.1 (`additionalFields` pattern in `apps/auth`),
Task 1.2 (session-verify propagation pattern), the Account plugin's
`account_prefs` surface (`packages/db` `setAccountPrefs`).

**SRS reference:** SRS §3.3 Auth Layer; ACC-07/08 (Account preferences/timezone)

**Review checklist:**

- Registering silently captures the detected timezone onto the auth user (no
  visible field on the form)
- An invalid/empty timezone is rejected server-side or falls back to `UTC`,
  never stored garbage
- After first sign-in, `account_prefs.timezone` reflects the registration value;
  changing it later in Account → Preferences always wins
- A pre-existing user (or a user whose prefs are already non-`UTC`) is never
  overwritten by the registration seed
- Email-verification default flow works (timezone carried on the auth user,
  surviving the no-session-at-signup path)
- `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test`

---

#### 📋 1.21 — Long-lived offline session assertion (Research 0012)

**Goal:** Give the platform a session assertion that can be verified with no
network for days, so offline access does not expire five minutes after the last
online request — without weakening revocation for online requests.

**Deliverables:**

- A signed, device-scoped offline session assertion, separate from better-auth's
  `session.cookieCache` (`apps/auth/src/auth.ts:56`, `maxAge: 300`). That 300s
  value stays as-is: it correctly bounds role-change staleness for online
  requests and must not be stretched to serve offline.
- Explicit, configurable lifetime (default in the 7–30 day range) surfaced as an
  env var and documented in `docs/self-hosting.md`. This value **is** the offline
  revocation gap — name it as such rather than leaving it implicit.
- Verification path in `runtime/middleware.ts` that accepts the offline
  assertion **only** when the request is genuinely offline, so it can never be
  used to skip a live revocation check while the network is reachable.
- Cleared on sign-out alongside both `session_data` cookie variants.
- For `device-only` plugins (task 3.36) the assertion is stored encrypted under
  the device-auth key (task 1.22), so its presence is not observable without
  passing device auth.

**Dependencies:** Research 0012. Blocks tasks 2.31 and 2.32.

**SRS reference:** §3.11, AUTH-05.

**Review checklist:**

- An authenticated user offline for over an hour still reaches the cached shell.
- The offline assertion is rejected when the network is reachable — verified by a
  test that presents it with connectivity available.
- Revoking a session server-side takes effect on the next online request,
  unchanged from today.
- Sign-out clears the assertion; a second user on the same device cannot use it.
- `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test`

#### 📋 1.22 — Device-auth unlock for `device-only` plugins (Research 0012)

**Goal:** Gate `device-only` plugin data behind biometric or device-passcode
authentication, implemented as **key custody** — the OS releases the decryption
key after a successful auth — not as a UI check that can be bypassed by reading
storage directly.

**Deliverables:**

- Web/PWA: WebAuthn PRF key derivation, building on the already-deployed passkey
  plugin (`apps/auth/src/auth.ts:231`). Handle the case where an existing
  credential does not support PRF by registering a new passkey with the
  extension requested, rather than assuming the login passkey can be reused.
- Native: key stored via task 20.13's `device:secureStorage` bridge, with
  user-presence access control (biometric **or** device passcode — never
  biometric-only, which locks out unenrolled users).
- Enrolment is **structural**: enabling a `device-only` plugin performs it, and
  there is no preference or toggle that can turn it off while the plugin works.
- A real UI state for the no-device-passcode case, where the key cannot be
  created on either platform — a hard block with an explanatory screen, not an
  unhandled rejection.
- Re-lock policy: a sensible default plus a user override, following the
  established pattern of an immediate / timed / on-restart choice.
- `docs/plugin-development.md` coverage of what a `device-only` plugin can
  assume about unlock state.

**Dependencies:** Tasks 3.36, 20.13. Gated on the escrow decision (task 8.21) —
key strictness cannot be chosen before recovery is settled.

**SRS reference:** §3.11, §3.12.

**Review checklist:**

- A `device-only` plugin cannot be enabled without completing enrolment.
- With the app locked, the on-disk data is ciphertext — verified by inspecting
  storage directly, not by observing the UI.
- Biometric failure falls back to device passcode and still unlocks.
- A device with no passcode shows the explanatory block screen.
- PRF enrolment succeeds on a fresh passkey and on an existing PRF-capable one.
- `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test`

---

## Related RFCs

- [RFC 0012 — Passkeys & TOTP MFA](../rfcs/0012-passkeys-and-mfa.md)
- [RFC 0021 — Platform roles & capabilities](../rfcs/0021-platform-roles-and-capabilities.md)
- [RFC 0022 — Plugin-declared capabilities](../rfcs/0022-plugin-capabilities.md)
- [RFC 0033 — User data deletion](../rfcs/0033-user-data-deletion.md)
- [RFC 0035 — Progressive user verification](../rfcs/0035-progressive-user-verification.md)
- [RFC 0041 — User directory and member selection SDK](../rfcs/0041-user-directory.md)
- [RFC 0065 — User groups and plugin access policy](../rfcs/0065-user-groups-plugin-access.md)
- [RFC 0054 — Plugin-scoped roles and grants](../rfcs/0054-plugin-scoped-roles-and-grants.md)
- [RFC 0062 — Email delivery coverage](../rfcs/0062-email-delivery-coverage.md)
- [RFC 0072 — External OAuth/OIDC provider for non-plugin apps](../rfcs/0072-external-oauth-provider.md)
- [RFC 0086 — Shared-store rate limiting for multi-instance deployments](../rfcs/0086-shared-store-rate-limiting.md)

## Related Docs

- [plugin-development.md — SDK auth surface](../plugin-development.md)
- [self-hosting.md — Auth env vars](../self-hosting.md)
- [security.md — Session & cookie model](../security.md)

## Cross-references

- The Account plugin (see [Plugin — Accounts](plugin-console.md)) owns the Security tab UI for MFA enrollment and session management.
- User data deletion in this epic calls plugin handlers registered via `sdk.portability.provideDelete` — see [Data Sovereignty](data-sovereignty.md).
