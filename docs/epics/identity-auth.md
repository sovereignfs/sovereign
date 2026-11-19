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

#### ✅ 4.6 — Passkeys `[parallel]`

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

#### ✅ 4.7 — Sessions and account states

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
- Done by the earlier tasks, and checked again here: the cookie domain, the
  signed cache, no fresh-session requirement, database rate limits and trusted
  origins. New here: `AccountStates` (`addStep` runs inside the deactivating
  transaction, `afterDeactivation` after it) and a check on creating any session

**Not here:** the Console's deactivate and reactivate (the Console epic), the
token revocation and back-channel notices (the provider epic), and listing and
ending one's own sessions (identity pages).

**Dependencies:** 4.1

**Spec reference:** §3.3.6, §3.5

**Review checklist:**

- Repeated failed sign-ins are rate limited
- A deactivated account's open session stops working within the cookie cache
  lifetime

### Sign-in that keeps its place, and a lock

[Research 0011](../research/0011-streamlining-sign-in.md) found where signing in loses people or asks too much, and
[research 0012](../research/0012-biometric-lock.md) how an installed core and its apps can ask for Face ID, Touch ID or a fingerprint.
These tasks are sequenced by [workstream 0007](../workstreams/0007-sign-in.md).

#### ✅ 4.8 — An invited sign-up verified by its emailed link

**Goal:** Someone who signs up from an invitation core emailed them is not asked to verify the same address by a second email.

**Deliverables:**

- the sign-up page sends the invitation's id; `user.create.before` makes the account verified when the id names an open invitation
  for the same address that core emailed (`inviteVouchesFor`)
- `invites.emailed_at`, on every dialect, set only when the invitation's email was sent; one passed on by hand is verified by email
- no verification link for a verified account, the account-created email at once, and the form signs the person in

**Dependencies:** 4.3

**Spec reference:** core-app §3.3.3, §3.10

**Review checklist:**

- The address alone, another address's link, and a cancelled, used or expired invitation verify nothing
- An invitation whose email was not sent still asks to verify

#### ✅ 4.9 — An app's sign-in kept through sign-up, verification and a reset

**Goal:** Someone an app sent to core who creates an account, verifies their address or resets their password ends in the app.

**Deliverables:**

- `resumeAddress`: the app's own request to the authorization endpoint, rebuilt from the provider's signed request without the
  signature and with `login` taken out of `prompt`
- the sign-in pages use it as `returnTo`; "Create account", "Forgot password?", the forgot and reset pages and their emails carry it

**Dependencies:** 6.1

**Spec reference:** core-app §3.6.1

**Review checklist:**

- A request driven through the provider from the sign-in page's address to a new account comes back to the app with a code
- Nothing unsigned is carried, and an address too long to keep is not

#### ✅ 4.10 — A passkey on the second step unlocks

**Goal:** A passkey used on the second sign-in step unlocks the person's keys as it does on the sign-in page.

**Deliverables:**

- one passkey sign-in for both pages, asking for the PRF extension and unlocking from its output
- the second step drops the password's waiting secret after a passkey, which may be another account's

**Dependencies:** 16.8

**Spec reference:** core-app §5.5

**Review checklist:**

- The password's secret is never used after a passkey on the second step

#### ✅ 4.11 — Signing out says when it did not

**Goal:** A sign-out that does not end the session says so, instead of seeming to work.

**Deliverables:**

- the account menu leaves for the sign-in page only once the session has ended; otherwise a toast says the person is still signed in
- the design system's `ToastProvider` mounted once in the root layout

**Dependencies:** 4.7

**Spec reference:** core-app §3.5

**Review checklist:**

- A refused and an unreachable sign-out both leave the person where they were, told, and able to try again

#### ✅ 4.12 — One guard for signed-in pages, and the cookie cache's leftovers gone

**Goal:** Every page that needs a session sends someone without one to sign in the same way, from one function, and nothing is left
of the signed cookie cache that core turned off.

**Deliverables:**

- `requireSignedIn(returnTo)`, used by every page that now calls `getSession` and redirects by hand; the sign-in page and its second
  step share their guard
- the cookie cache's leftovers removed or explained: the stale docstring in `auth.ts`, `disableCookieCache`, and
  `sessionCacheCookieNames` (kept only if it still clears a cookie browsers hold from before)
- the sign-up and reset forms share the password checks, the derivation and the messages

**Dependencies:** 4.7

**Spec reference:** core-app §3.5

**Review checklist:**

- A test fails when a signed-in page does not use the guard
- No page's redirect or message changes

#### ✅ 4.13 — An emailed link that did not work is always said

**Goal:** Someone who follows a verification link that has expired or was already used is told so, even in a browser that is already
signed in.

**Deliverables:**

- `/sign-in` shows "That link has expired or was already used" when better-auth sends `error`, and to someone already signed in, with a
  way on to where they were going instead of a silent redirect

**Not here:** going straight to the destination without the stop at `/sign-in`. better-auth sends a link's success and its failure to
one address, so that stop is what lets a failure be said; it costs one redirect the person does not see. Telling someone that a link is
for another account belongs with changing an email address, which core does not offer yet (better-auth's `INVALID_USER` applies only
there).

**Dependencies:** 4.9

**Spec reference:** core-app §3.3.3

**Review checklist:**

- An app's sign-in carried through verification still ends in the app
- A test of the signed-in case fails against the old page

#### ✅ 4.14 — Asking for the password again, one way

**Goal:** Every place that asks for the password again counts wrong answers the same way.

**Deliverables:**

- better-auth's routes that ask a signed-in person for their password (two-factor enable, disable, backup codes and key, and changing
  the password) are checked through `confirmPassword` first, in core's request hook, so every wrong answer counts against one limit

**Dependencies:** 4.12

**Spec reference:** core-app §3.2.1, §3.4.1

**Review checklist:**

- Five wrong passwords in ten minutes are refused on every page that asks

#### ⏳ 4.15 — A lock on the devices

**Goal:** Research 0012's platform table is filled from devices, not documentation.

**Deliverables:**

- the lock check (`/lock-check`, core-app §3.15.1): a page for anyone signed in on development and staging instances, and for the owner
  alone on production (`instance:diagnose`), that makes a passkey there, asks for one
  after a tap and with none (armed, on opening and on coming back), reports user verification and PRF output, and records how long the
  app was away and whether it was ended, in a log kept by the browser and copied out as text; nothing is sent to the server
- on an iPhone (iOS 18.4 and 26), an iPad and an Android phone, with core installed: the lock check run, its results sent
- research 0012 updated with what was seen

**Dependencies:** none `[parallel]`

**Spec reference:** core-app §3.15.1; research 0012

**Review checklist:**

- On a production instance the lock check is a page that is not there for anyone but the owner
- Each row of the table says what was seen, on which version

#### ⏳ 4.16 — The specification: sessions across apps, and a lock

**Goal:** An RFC settles how an app's session follows core's and how core and its apps lock.

**Deliverables:**

- RFC 0006: core's session lifetime set explicitly; an app's session kept short and renewed with `prompt=none`; a locked session in
  core (an idle time and "lock when in the background", per device, the lock page, the password as the fallback); apps locking
  through core with `max_age`; keys dropped while locked
- core-app and sdk spec changes drafted from it

**Dependencies:** 4.15, 14.12

**Spec reference:** core-app §3.5, §5.4; sdk §9

**Review checklist:**

- The RFC answers research 0012's open questions

#### ⏳ 4.17 — Core's lock

**Goal:** An installed core asks for a passkey (or the password) when it is opened after the time a person chose.

**Deliverables:**

- ✅ core's session lifetime set explicitly (`SESSION_LIFETIME`: seven days, extended daily; RFC 0006 A1)
- a locked state on the session, set after the person's idle time or on leaving the app
- every request of a locked session answered with the lock page, unlocked by a server-checked passkey assertion with user
  verification, or the password; the setting on the Security page, per device

**Dependencies:** 4.16

**Spec reference:** RFC 0006

**Review checklist:**

- A locked browser receives nothing of the person until it is unlocked
- Someone with no passkey that verifies can still unlock with the password
