---
rfc: 0035
title: Progressive user verification
status: Accepted
date: June 2026
author: kasunben
scope: >
  packages/db, apps/auth, runtime, packages/sdk, packages/manifest,
  plugins/account, plugins/console, .env.example, docs
incorporated_into_plan: 'Yes (phased) — epic tasks 1.8 (Phase 1, infrastructure) + 1.9 (Phase 2, capability opt-in)'
---

# RFC 0035 — Progressive User Verification

## Summary

Sovereign tracks an `emailVerified` flag on every user account but never sets it to `true` and never
enforces it. MFA is fully implemented but purely opt-in with no platform policy. This RFC introduces a
**four-level user verification model** — `registered → email_verified → mfa_enrolled → admin_vouched`
— where each level corresponds to a concrete, auditable proof-of-identity event.

The current level is stored denormalised on the user record and propagated through the existing session
header chain as `x-sovereign-verification-level`. Middleware, route guards, capability definitions, and
plugin manifests can all gate on it without any new enforcement mechanism. Existing users and
capabilities are unaffected at adoption time; individual gates opt in to a minimum level in a separate
follow-on task.

---

## Motivation

**The `emailVerified` field is decorative today.** Every user account in every Sovereign instance has
`emailVerified = false`. There is no email confirmation flow, no enforcement, and no operator control
over whether email verification is required. The field has existed since Task 0.3.9 (auth server
scaffold) and has never been wired up.

**MFA has no policy surface.** TOTP and passkey enrollment landed in RFC 0012 and work well for users
who choose to enrol. But operators running a team instance have no way to mandate MFA. There is no
platform concept of "this user has proved their identity strongly" that plugins or capabilities can
test without reinventing it per-feature.

**The capability system (RFC 0021) is role-based, not identity-strength-based.** A `platform:user`
with a confirmed email and a registered passkey looks identical to a brand-new unverified account.
Plugins that want to gate on identity strength — a plugin handling sensitive documents, a monetisation
plugin requiring a real email for receipts — have no SDK surface to call.

**Federation will need a portable trust signal.** Post-v1 federation (SRS §1.4) requires instances to
communicate how much they vouch for a given user identity. Getting the data model right now avoids a
breaking schema change when that work begins.

---

## Current state (what this builds on)

### Dormant email-verified field

`emailVerified: integer('email_verified', { mode: 'boolean' }).notNull().default(false)` exists in
`packages/db/src/schema/sqlite/platform.ts:31` and its Postgres equivalent. better-auth manages a
`verification` table (signed, time-limited tokens) and exposes
`POST /api/auth/send-verification-email` — the plumbing already exists; it has never been called.

**Update:** the `emailVerified` field on better-auth's own `user` table (a separate database from
the one `platform.ts` describes — `apps/auth` intentionally does not depend on `packages/db`, see
`apps/auth/src/db.ts`) is no longer dormant. A scoped-down implementation of this RFC's §5.3 (email
verification flow only — no `verification_level`/MFA/admin-vouch machinery) shipped using
better-auth's native `emailAndPassword.requireEmailVerification` +
`emailVerification.sendVerificationEmail` support directly, gated by `AUTH_REQUIRE_EMAIL_VERIFICATION`
(default `true`) — see `apps/auth/src/auth.ts` and `docs/security.md`. A future implementer of epic
task 1.8 should build the `verification_level` ladder on top of this existing enforcement rather than
duplicating the email-send/verify wiring.

### MFA state is readable but not propagated to session headers

TOTP and passkeys are stored in better-auth's `twoFactor` and `passkey` tables.
`twoFactorEnabled` is returned by `GET /api/auth/get-session?disableCookieCache=true` (the
cache-bypass pattern used in `runtime/app/(platform)/(plugins)/account/security/page.tsx:28`). MFA
state is **not** in the signed session cookie cache and **not** in the middleware header chain — apps
that need it must fetch it on demand.

### Session header chain

`runtime/middleware.ts:290–306` (session-verified path) injects:

```
x-sovereign-user-id
x-sovereign-user-role
x-sovereign-user-capabilities   (JSON array)
```

`runtime/src/session-verify.ts` reads these from the signed cookie cache
(`session.cookieCache`, 300 s, HMAC key = `SOVEREIGN_AUTH_SECRET ?? AUTH_SECRET`) or falls back to
`GET /api/verify`. The `@sovereignfs/sdk` reads them in `packages/sdk/src/auth.ts:16–29` and
populates `session.user.role` and `session.user.capabilities`.

### Capability system

`runtime/src/capabilities.ts` defines four hardcoded role presets with 11 capabilities.
`hasCapability(role, cap)` is enforced in middleware (route-level, offline) and in
`runtime/src/route-guard.ts` (Node handler level). Plugins call `sdk.auth.hasCapability(session, cap)`.
There is no concept of a minimum identity level in a capability definition.

### `packages/mailer`

A fully functional SMTP abstraction (`packages/mailer`) is already wired into `apps/auth`. Email
delivery works today for invites; it is the right transport for verification emails.

---

## Proposed design

### 5.1 — Trust level model

Four discrete levels, each triggered by a concrete, auditable event:

| Level | Constant         | Trigger                                                                |
| ----- | ---------------- | ---------------------------------------------------------------------- |
| 0     | `registered`     | Account exists (invite accepted, or first-user self-sign-up)           |
| 1     | `email_verified` | User clicked a signed confirmation link                                |
| 2     | `mfa_enrolled`   | At least one TOTP authenticator or passkey registered and active       |
| 3     | `admin_vouched`  | A `platform:owner` or `platform:admin` has explicitly vouched the user |

Levels are **cumulative** in meaning but not strictly sequential in enforcement. Level 2 implies the
user has proved something stronger than email ownership; operators may waive Level 1 (see §5.3) in
which case a user can be promoted to Level 2 without passing through Level 1. The system records an
event timestamp for each level reached — levels can be revoked and re-acquired, but the event log is
append-only for audit purposes.

### 5.2 — Data model

Two new columns on the Sovereign `users` table, added via Drizzle migration on top of better-auth's
base schema (the same pattern used for `role`, which Sovereign adds to better-auth's user record):

```sql
-- SQLite
ALTER TABLE "user" ADD COLUMN verification_level INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "user" ADD COLUMN verification_events TEXT;

-- Postgres (identical structure; text not jsonb for dialect parity)
ALTER TABLE "user" ADD COLUMN verification_level INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "user" ADD COLUMN verification_events TEXT;
```

`verification_events` stores a JSON object (serialised as `text` in both dialects, following the
`sidebar_plugins` precedent from Task 2.13):

```ts
interface VerificationEvents {
  email_verified_at?: number; // Unix timestamp (seconds)
  mfa_enrolled_at?: number;
  mfa_removed_at?: number; // set when all MFA methods removed
  vouched_at?: number;
  vouched_by?: string; // actor user ID
  vouched_revoked_at?: number;
}
```

`verification_level` is denormalised for fast middleware reads — it is recomputed and updated each
time a verification event fires, so the middleware never has to parse `verification_events` to answer
"what is this user's current level?"

Schemas: `packages/db/src/schema/sqlite/platform.ts` and `packages/db/src/schema/postgres/platform.ts`.
Migration: `packages/db/migrations/{sqlite,postgres}/0007_user_verification.sql`.

### 5.3 — Email verification flow

**On account creation** (first user or invite-accepted new user), the runtime calls
`POST /api/auth/send-verification-email` immediately after better-auth creates the account. This
endpoint uses better-auth's `verification` table to generate and store a signed, time-limited token
and sends it via `packages/mailer`.

**On link click**, better-auth marks the token consumed and fires an `onEmailVerification` callback.
The callback (wired in `apps/auth/src/auth.ts`) runs:

1. Sets `emailVerified = true` on the better-auth user record (already the field's intended purpose).
2. Updates `verification_level = Math.max(current_level, 1)` and appends `email_verified_at` to
   `verification_events`.
3. Invalidates the session cookie cache (clears both cookie variants, same pattern as profile
   mutations) so the new level appears in the next request.

**Operator opt-out:** If `REQUIRE_EMAIL_VERIFICATION=false` (new env var, added to `.env.example`),
the send step is skipped and the system auto-promotes the user to Level 1 at account creation. This is
intended for air-gapped or internal deployments where the invite mechanism itself is sufficient proof.
Default is `true` (verification required).

**Resend:** A `POST /api/auth/send-verification-email` route already exists in better-auth. The
`/verify-email` interstitial page (see §5.7) exposes a resend button.

### 5.4 — MFA enrollment trigger

When better-auth's `twoFactor` plugin fires `onTwoFactorEnabled` or the passkey plugin fires
`onPasskeyCreated`, an `apps/auth/src/auth.ts` hook runs:

1. `verification_level = Math.max(current_level, 2)`.
2. Appends `mfa_enrolled_at` to `verification_events` (only on first enrollment; subsequent
   enrollments of a second device do not re-write the timestamp).
3. Invalidates the session cookie cache.

**If all MFA methods are removed** (`onTwoFactorDisabled` / last passkey deleted), the hook:

1. Drops `verification_level` back to `Math.min(current_level, 1)` (or 0 if email also unverified).
2. Appends `mfa_removed_at` to `verification_events` for the audit trail.
3. Invalidates the session cookie cache.

The `mfa_enrolled_at` timestamp is preserved — the events object records history, not current state.

### 5.5 — Admin-vouch flow

Console → Users → (user row action menu) → **Vouch**. The vouch action:

1. Is gated to `platform:owner` and `platform:admin` only.
2. Sets `verification_level = Math.max(current_level, 3)`, records `vouched_by` + `vouched_at`.
3. Invalidates the target user's session cache (requires knowing their session cookie; if not
   possible server-side, the new level takes effect at next login or cache expiry ≤ 300 s).

**Revoke vouch:** Same UI, **Revoke vouch** option. Sets `verification_level = Math.min(current_level, 2)`,
clears `vouched_by`, appends `vouched_revoked_at`. Does not erase `vouched_at` (audit trail).

A `POST /api/admin/users/[id]/vouch` and `DELETE /api/admin/users/[id]/vouch` route pair handle this.

### 5.6 — Session propagation

`runtime/src/session-verify.ts` reads `verification_level` from the user record (either from an
extended signed cookie cache or from the live `/api/verify` call — implementation decision deferred
to the task). `runtime/middleware.ts` injects:

```
x-sovereign-verification-level: 2
```

alongside the existing role and capabilities headers. The value is always a plain integer string.

`packages/sdk/src/auth.ts` reads this header and populates a new field on the session object:

```ts
session.user.verificationLevel: 0 | 1 | 2 | 3
```

This is a minor addition to `@sovereignfs/sdk` — the field is new, so no existing call site breaks.
Semver impact: **minor bump** for `@sovereignfs/sdk` (new public field on the session type).

### 5.7 — Capability gate integration

`runtime/src/capabilities.ts` gains an optional field on capability definitions:

```ts
interface CapabilityDefinition {
  // existing fields …
  minVerificationLevel?: 0 | 1 | 2 | 3; // undefined = no gate (default, backwards-compatible)
}
```

`hasCapability(role, cap, userLevel?)` gains an optional third argument. If `minVerificationLevel` is
set on the capability and `userLevel < minVerificationLevel`, the check returns `false` regardless of
role. This is purely additive — no existing capability has `minVerificationLevel` set at adoption time.
Individual capabilities opt in during the follow-on task (Phase 2).

### 5.8 — Manifest declaration

Plugin manifests may declare a minimum verification level required to access the plugin:

```json
{
  "min_verification_level": 1
}
```

`packages/manifest` validates this field (integer 0–3, optional, default 0). The runtime access check
and registry listing surface it as a human-readable label: `requires_email_verified` (≥ 1),
`requires_mfa` (≥ 2), `admin_vouched_only` (= 3). Plugins do not need to restate it in their own
capability checks — the runtime enforces it at the plugin route boundary, the same place it enforces
the `capabilities` manifest field today (RFC 0022).

Semver impact: additive field on the manifest — **patch bump** for `@sovereignfs/manifest`.

### 5.9 — Interstitial / nudge UI

**Level 0 → Level 1 gate (hard block when `REQUIRE_EMAIL_VERIFICATION=true`):**

```
[user logs in]
      │
      ▼
middleware: verification_level === 0 AND REQUIRE_EMAIL_VERIFICATION=true?
      │ yes
      ▼
redirect 303 → /verify-email  (new runtime route, public — not behind plugin auth)
      │
      ▼
/verify-email page: "Check your inbox — we sent a link to {email}."
      │  [Resend] button → POST /api/auth/send-verification-email
      │
      ▼
user clicks link → level promoted to 1 → redirect to intended destination
```

When `REQUIRE_EMAIL_VERIFICATION=false`, no redirect — the user starts at Level 1 and the page is
never shown.

**Level 1 → Level 2 nudge (soft, not a hard block unless `REQUIRE_MFA=true`):**

Routes or plugins that declare `minVerificationLevel: 2` show an inline banner:
"Strengthen your account — enable MFA in Account → Security to access this feature." The banner
links to the Account Security page. If `REQUIRE_MFA=true` (new operator env var), the banner becomes
a hard block with the same redirect-based pattern as the Level 1 gate.

**Level 2 → Level 3 (admin-vouch only):** Features requiring Level 3 show a message: "Access to this
feature requires admin approval. Contact your workspace owner." No self-service path exists by design.

---

## UI flows

### Email verification (new user)

```
signup / invite-accept
    │
    ├─ REQUIRE_EMAIL_VERIFICATION=true
    │       │
    │       ▼
    │   send verification email
    │       │
    │       ▼
    │   redirect to /verify-email ("check your inbox")
    │       │  [Resend]
    │       ▼
    │   user clicks link in email
    │       │
    │       ▼
    │   level 0 → 1, redirect to /
    │
    └─ REQUIRE_EMAIL_VERIFICATION=false
            │
            ▼
        auto-promote 0 → 1
        proceed to /
```

### Admin-vouch (Console)

```
Console → Users → (row) → ⋯ → Vouch
    │
    ▼
confirmation dialog: "Vouch for {name}? This marks their identity as admin-confirmed."
    │  [Confirm]
    ▼
POST /api/admin/users/{id}/vouch
    │
    ▼
level → 3, vouched_by = actorId, vouched_at = now
    │
    ▼
activity log: "user.vouched" (actor = admin, subject = user)
```

---

## Alternatives considered

**Single `emailVerified` boolean, no levels.** Simpler to implement and reason about, but leaves no
room for MFA-strength gating or admin-vouch without adding more booleans later. A level integer is
only marginally more complex and avoids the schema churn.

**Compute level on-the-fly from existing fields.** `emailVerified`, `twoFactorEnabled` (better-auth
field), and a new `admin_vouched` boolean could be combined at read time without a denormalised
`verification_level` column. Rejected because middleware runs at the edge and must not issue a DB
query per request. A denormalised integer is a single column read from the already-fetched user row.

**Sticky levels (once Level 2, always Level 2).** Simpler mental model, but breaks the invariant
that Level 2 means "currently has active MFA." If a user removes all MFA methods, Level 2 is
meaningless as an identity-strength signal. The drop-on-removal design is more conservative and
more honest.

**Plugin-callable `sdk.verification.setLevel()`.** Allowing plugins (e.g., a KYC plugin) to
advance a user to Level 3 would make the system extensible. Rejected for v1 because it creates an
unvetted trust surface: a plugin could advance any user's level without an admin in the loop. Admin
Console vouch keeps a human accountable for Level 3 grants. Post-v1, a narrow SDK method
`sdk.verification.recordVerification(event)` for certified plugins is a reasonable extension (see
Open questions §3).

**New `user_verifications` table instead of JSON column.** A normalised table would make per-event
queries easier but adds a join to every user fetch. The `verification_events` JSON column follows
the precedent set by `account_prefs.sidebar_plugins` and is sufficient for v1 audit purposes. If
structured querying of events becomes necessary, a migration can extract the column later.

---

## Open questions

1. **`REQUIRE_EMAIL_VERIFICATION=false` UX:** When email verification is waived (air-gapped deploy),
   should the Account → Security section still show "Email not verified" as an informational notice,
   or should the UI suppress it entirely to avoid confusing users in a context where verification
   doesn't apply?

2. **MFA-level stickiness:** The current proposal drops `verification_level` from 2 to 1 when all
   MFA methods are removed. An alternative is to keep it at 2 but mark `mfa_active: false` as a
   separate flag. The latter allows "was once Level 2" to remain visible in the Console even after
   MFA removal. Is the distinction worth the added complexity?

3. **Plugin-callable level advancement (Level 3):** Should a certified plugin (e.g., a KYC / identity
   verification plugin available in the registry) be able to call an SDK method to advance a user to
   Level 3 programmatically, bypassing the manual Console vouch? If yes, what certification or
   manifest gate prevents an untrusted plugin from abusing this?

4. **Migration of existing users:** At the time this ships, all existing users are Level 0 with
   `emailVerified = false`. Two strategies:
   - **Auto-promote:** If `emailVerified = true` (it currently never is), set Level 1. All others
     stay at 0 and must verify. Clean but results in every existing user being at Level 0.
   - **Grandfather:** Set all existing users to Level 1 on migration day; only new users go through
     the email flow. Avoids disruption but bypasses the intent of the gate for existing accounts.
     Recommendation: auto-promote (strategy 1) — the field has never been set to `true`, so this is
     equivalent to starting fresh. Flag this in upgrade notes.

5. **Session cache extension:** The signed session cookie cache currently carries `role` and
   `capabilities`. Adding `verification_level` to the cache payload extends the 300 s staleness
   window to verification changes (level promotions or revocations take up to 300 s to propagate to
   live sessions). Is this acceptable, or should verification level always be fetched live (at the
   cost of an auth server call on every request)?

---

## Adoption path

**Phase 1 — Infrastructure (this RFC, one task):**
Data model migration, email verification flow, MFA hooks, admin-vouch API + Console UI, session
propagation, SDK field, `/verify-email` interstitial, `REQUIRE_EMAIL_VERIFICATION` env var.
No existing capability definition changes — zero functional impact on current users or plugins.
Packages affected: `@sovereignfs/db` (patch), `@sovereignfs/sdk` (minor — new session field),
`@sovereignfs/manifest` (patch — new optional field), `runtime` (minor), `plugins/account` (minor —
security page reflects level), `plugins/console` (minor — vouch action in Users table).

**Phase 2 — Capability opt-in (separate task):**
Individual capability definitions gain `minVerificationLevel` where appropriate. Plugin manifest
enforcement gate is activated. Operators who have enabled `REQUIRE_EMAIL_VERIFICATION` see
functional gates for the first time.

**Phase 3 — Federation (post-v1):**
`verification_level` is included in the cross-instance user identity payload. Receiving instances
can choose to accept or re-verify based on the sending instance's trust policy.

---

## Changelog

| Version | Date      | Change        |
| ------- | --------- | ------------- |
| 0.1     | June 2026 | Initial draft |
