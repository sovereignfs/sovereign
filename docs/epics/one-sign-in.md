# Epic 17: One sign-in

> Core and every app sign people in with one package, made from core's own sign-in: core as one way in, an app's own accounts as
> another, and the same rules everywhere.

## Status

⏳ In Progress

## Overview

Core, the app template, and Tusk and Fjord each carry a sign-in of their own, and the copies have drifted from core's rules.
[RFC 0007](../rfcs/0007-one-sign-in.md) moves the part of core's sign-in that is not about core into `@sovereignfs/auth`, which core
uses too, and makes every app run the same session layer with core and local accounts as its two ways in. The forms and panels go into
the design system (2.6), signing out follows whose app it is (6.5), the template makes an app of its own from the package (13.35), and
the SDK's `nextAuth` is deprecated (14.15), after it signs in for a session the app keeps (14.16).

## Related

- [docs/rfcs/0007-one-sign-in.md](../rfcs/0007-one-sign-in.md): the design
- [docs/research/0004-a-kit-for-apps-of-their-own.md](../research/0004-a-kit-for-apps-of-their-own.md): the kit this takes the sign-in
  step of
- [docs/specs/core-app.md](../specs/core-app.md): §3.3 to §3.6, §5.2
- [docs/specs/sdk.md](../specs/sdk.md): §9
- [docs/workstreams/0008-one-sign-in.md](../workstreams/0008-one-sign-in.md): the order

## Tasks

#### ✅ 17.1 — The specification

**Goal:** What `@sovereignfs/auth` does is written down before any of it is built.

**Deliverables:**

- RFC 0007 accepted, its open questions answered or left to a named later task
- `docs/specs/auth.md`: the package's entries, what an app gives it, its settings (`AUTH_LOCAL`, `AUTH_SIGNUP`,
  `AUTH_PASSWORD_MIN_LENGTH`, in `contracts/env.md` §2 with `AUTH_LOCAL` in the contract's boolean form), its tables and migrations,
  and what it never does
- core-app §3.6.5 and §3.7.1 for the per-app sign-out setting, and §3.6.2 for `amr` and `acr`, written ahead of 6.5 and 6.6
- `docs/releasing.md`: the package as a published contract, MPL-2.0

**Dependencies:** none

**Spec reference:** RFC 0007

**Review checklist:**

- Every rule core's sign-in holds today has a home in the spec: the package, or core's additions on top of it

#### 📋 17.2 — The package, and core's sign-in made from it

**Goal:** Core's better-auth setup is the package's preset plus core's own additions, with no change anyone can see.

**Deliverables:**

- `packages/auth`, published as `@sovereignfs/auth`: `createAuthPreset(options)` from the generic part of
  `apps/core/src/auth/auth.ts` (the adapter's mapping, `policedHash`, user-verified passkeys, the second step with no "trust this
  device", `PASSWORD_AGAIN`, the `NEEDS_MAIL` answer, `assertMayOpenSession`, the name, time zone and locale hooks, rate limits, cookie
  cache off, `freshAge: 0`, `__Host-` cookies, `resolveAuthSettings`)
- what an app gives it: the database, mail, a registration policy, the salt for the sign-in value, the hooks, extra plugins
- the account tables' schema for each dialect, and a migration set for apps recorded apart (`migrate(…, { table })`); core keeps its
  own history, and a test holds core's tables to the package's schema
- core's `createAuth` becomes the preset plus the OIDC provider, invitations, the owner, logout notices, the lock and the passkey's
  way into the keys
- better-auth pinned to one exact version in the package; an app with a second copy refused at start-up
- the tests that scan core for `requireCapability`, `requireSameOrigin` and calls with the request's headers scan the package too;
  the populated `auth-store` fixtures move into the package's tests

**Dependencies:** 17.1, and core's lock (4.17's code) on the branch it is built on

**Spec reference:** RFC 0007 §1, §2, §6, §7

**Review checklist:**

- `pnpm e2e`, and `pnpm test:db` on each database, pass unchanged
- The populated `auth-store` fixtures load and sign in
- `packages/auth` imports nothing from `apps/core`

#### 📋 17.3 — Session helpers with a check of their own

**Goal:** Reading the session, guarding a page and asking for the password again are the package's, and core's lock is a check it
passes in.

**Deliverables:**

- `getSession`, `requireSignedIn`, `returnTo`, `confirmPassword`, `listSessions`/`endSession` and the password policy in the package
- an extra check passed to `getSession` and `requireSignedIn`; core passes its lock, and "a locked session is no session" holds as
  before
- core's `src/auth/session.ts`, `require-signed-in.ts`, `confirm-password.ts`, `password-policy.ts` and `src/sessions/*` become calls

**Dependencies:** 17.2

**Spec reference:** RFC 0007 §1

**Review checklist:**

- A locked session still gets nothing from a page, an action or a route
- A guard without a check behaves as core's did before the lock

#### 📋 17.4 — The pages' actions, and core's pages thin

**Goal:** Every sign-in and security page is a few lines over the package's actions and the design system's components.

**Deliverables:**

- `@sovereignfs/auth/next`: the actions and routes for sign-in, sign-up, forgot, reset, the second step, passkeys, two-factor setup,
  sessions, profile and picture, change password, delete account, each checking its own session, capability and origin
- `@sovereignfs/auth/client`: the browser client, `derive`, the passkey ceremony with PRF; the key store's hooks pluggable (core's
  `KeyVault` actions, the SDK's `AppVault`/`localVault`, or none)
- core's `app/(auth)/*`, `app/security/*` and `app/profile/*` become thin pages; core's additions (invitations, the lock, consent)
  stay in core

**Dependencies:** 17.3, 2.6

**Spec reference:** RFC 0007 §1, §8

**Review checklist:**

- `pnpm e2e` passes unchanged, including the key vault and sign-in value items (§5.10)
- No request of any password flow carries a password

#### 📋 17.5 — Core as a way in, and an app's own accounts

**Goal:** An app signs people in through core, with accounts of its own, or both, from its environment alone.

**Deliverables:**

- `@sovereignfs/auth/core`: a better-auth plugin on the SDK's sign-in, with the SDK's `TokenStore` the only holder of core's refresh
  token, the hourly check updating the account's claims, back-channel logout and account-deleted ending the app's sessions, the
  per-session key secret, and sign-out through end-session
- local accounts on with `<P>_AUTH_LOCAL`, core with `<P>_CORE_URL`; a sign-in through core matched by `sub`, never by email, and an
  email that is a local account's refused until linked from a signed-in session
- a fixture app in `apps/e2e` that signs in both ways

**Dependencies:** 17.4, 6.5, 14.16

**Spec reference:** RFC 0007 §3, §4, §5

**Review checklist:**

- better-auth never refreshes core's token: no `accounts` row for core holds one
- A logout notice for a `sid` ends that session in the fixture app, and one for a `sub` every session of that person
- Signing out of the fixture app as a hosted app ends core's session; as an external app it does not
