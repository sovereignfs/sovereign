# Epic 4: Identity & Auth

> How people get an account and prove who they are: sign-up and sign-in,
> registration policy, email verification, password reset, terms, TOTP,
> passkeys and sessions.

## Status

⏳ In Progress

## Overview

Built on better-auth 1.7 inside `apps/core`. The hardening the legacy auth
server accumulated (no fresh-session requirement, verifying upgrades against
a populated store, the signed cookie cache, rate limiting) is recorded in
`docs/architecture-rules.md`. Every page is built from `@sovereignfs/ui`.

## Related

- [docs/specs/core-app.md](../specs/core-app.md) — §3.3, §3.4, §3.5

## Tasks

#### ✅ 4.1 — better-auth and email/password

**Goal:** People can sign up and sign in with email and password.

**Deliverables:**

- better-auth 1.7 in `apps/core` with its own migrations on all three
  databases
- Sign-up (name, email, password) and sign-in pages
- Password policy from `SV_AUTH_PASSWORD_*`, enforced by the server

**Dependencies:** 0.2, 1.2

**Spec reference:** §3.3.2

**Review checklist:**

- Sign-up and sign-in work in a browser on all three databases
- A password breaking the policy is refused by the server, not only the page
- A better-auth upgrade is tested against a populated store

#### ✅ 4.2 — Registration policy and the first account

**Goal:** Sign-up is open or invite-only, and the first account becomes the
owner.

**Deliverables:**

- `SV_AUTH_INVITE_ONLY` default with the Console override (1.4)
- Server-side refusal of sign-ups without a valid, unexpired invite for that
  address
- The first account is exempt and becomes `platform:owner`
- The `invites` table (an address, an optional expiry, used and cancelled marks)
  and `users.role`, with at most one owner held by a unique index; accounts that
  already exist get their oldest as the owner when the migration runs

**Not here:** creating, listing and cancelling invites, the invite link and its
"invalid" page, and sending the invitation (the Console epic); the Console
screen for the setting; roles beyond owner and user, and the capability checks
(the roles epic).

**Dependencies:** 4.1, 1.4

**Spec reference:** §3.3.1, §3.2.1

**Review checklist:**

- An uninvited sign-up is refused when invite-only is on, by a direct request
  as well as through the page
- The first account on an empty instance is the owner

#### ✅ 4.3 — Email verification and password reset

**Goal:** Addresses are verified and forgotten passwords can be reset safely.

**Deliverables:**

- `SV_AUTH_REQUIRE_EMAIL_VERIFICATION` (default `true`); single-use one-hour
  link that signs the person in; resend
- Password reset by single-use one-hour link; completing it ends every session
- The reset request answers the same way whether or not the address exists
- The "account created" email sent after sign-up (once the address is verified,
  when verification is required)
- Pages: check your email, forgot password, choose a new password, and the
  notices on sign-in; mail is sent in the background and refused up front while
  it is not set up

**Not here:** an email telling the holder of an address that someone tried to
sign up with it (there is no template for it), changing an email address, and
resetting by any other way than the emailed link.

**Dependencies:** 4.1, 3.2

**Spec reference:** §3.3.3, §3.3.4

**Review checklist:**

- An unverified account cannot sign in while verification is required
- After a reset, a session opened before it no longer works
- Responses for known and unknown addresses are indistinguishable

#### ✅ 4.4 — Terms, privacy and timezone `[parallel]`

**Goal:** Sign-up records acceptance of the terms and a valid timezone.

**Deliverables:**

- Default Privacy Policy and Terms of Service pages
- A required acceptance at sign-up, recorded with the account
- Browser timezone captured at sign-up and validated as IANA before storing
- The acceptance recorded as when and which text (a digest of the documents as
  shipped), and set by the server

**Not here:** editing the legal texts (Console), asking accounts made before
this to accept, and the Preferences page where the time zone is changed.

**Dependencies:** 4.1

**Spec reference:** §3.3.2, §3.3.5

**Review checklist:**

- Sign-up without acceptance is refused by the server
- An invalid timezone is never stored

#### ✅ 4.5 — TOTP and backup codes `[parallel]`

**Goal:** People can protect their account with an authenticator app.

**Deliverables:**

- Enrolment with QR code and key, turned on only after a valid code
- Ten single-use backup codes; regenerate
- Password required to enable, disable or regenerate
- A second sign-in step accepting a code or a backup code
- A page at `/security/two-factor` for enrolling, new backup codes and turning
  it off, until the Security page takes it over

**Not here:** the Security page itself (identity pages), an operator resetting
someone's MFA (Console), rejecting a code already used in its 30-second window,
and rotating `SV_AUTH_SECRET` without ending enrolments.

**Dependencies:** 4.1

**Spec reference:** §3.4.1

**Review checklist:**

- Enrol, sign in with a code, sign in with a backup code (which then stops
  working), disable — in a browser

#### 📋 4.6 — Passkeys `[parallel]`

**Goal:** People can add passkeys and sign in without a password.

**Deliverables:**

- Add, name and remove passkeys; passwordless sign-in
- Relying party from `SV_AUTH_WEBAUTHN_RP_ID`, `_RP_NAME`, `_ORIGIN`, with
  defaults and start-up checks
- A page at `/security/passkeys` and a sign-in button, until the Security page
  takes over

**Not here:** the Security page itself (identity pages), an operator resetting
someone's passkeys (Console), passkey autofill in the email field, and signing
up with a passkey instead of a password.

**Dependencies:** 4.1

**Spec reference:** §3.4.2

**Review checklist:**

- Add a passkey and sign in with it, using a virtual authenticator
- Removing the last passkey leaves password sign-in working

#### 📋 4.7 — Sessions and account states

**Goal:** Sessions are safe, verified cheaply, and end when an account is
deactivated.

**Deliverables:**

- Cookies scoped to `SV_AUTH_COOKIE_DOMAIN` when set
- Signed cookie cache (300 seconds) with a server-side verification fallback
- No fresh-session requirement; the password is asked for where the spec says
- Rate limiting on authentication endpoints, stored in the database
- Trusted origins from `SV_AUTH_TRUSTED_ORIGINS`
- Deactivation and reactivation: deactivating ends all sessions. Revoking the
  account's OAuth tokens is added to the same operation by 6.3 (research 0001,
  B1); this task leaves the hook where it will be called

**Dependencies:** 4.1

**Spec reference:** §3.3.6, §3.5

**Review checklist:**

- Repeated failed sign-ins are rate limited
- A deactivated account's open session stops working within the cookie cache
  lifetime
