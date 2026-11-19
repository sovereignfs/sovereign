# RFC 0007 — One sign-in for core and every app

|              |                                                                                                                                                                                                                                                      |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Status**   | Draft, for review                                                                                                                                                                                                                                    |
| **Date**     | November 2026                                                                                                                                                                                                                                        |
| **Author**   | Claude Code, for review                                                                                                                                                                                                                              |
| **Scope**    | A new published package, `@sovereignfs/auth`; `apps/core`'s sign-in, account and security pages; `@sovereignfs/ui`; `@sovereignfs/sdk`; the app template in `tools/create`; `contracts/core-api/`, `contracts/env.md`; `docs/specs/core-app.md` §3.6 |
| **Research** | [0004](../research/0004-a-kit-for-apps-of-their-own.md) (its sign-in step), [0011](../research/0011-streamlining-sign-in.md)                                                                                                                         |
| **Tasks**    | [epic 17](../epics/one-sign-in.md) (17.1 to 17.5), [2.6](../epics/design-system.md), [6.5, 6.6](../epics/oidc-provider.md), [13.35](../epics/operator-cli.md), [14.15](../epics/sdk.md); [workstream 0008](../workstreams/0008-one-sign-in.md)       |

## Summary

Every Sovereign app signs people in one of two ways: through an instance's core, or with accounts of its own, and the suite's apps do both.
Today core has its sign-in, the template makes an app that can only use core, and Tusk and Fjord each carry a copy of a third. This RFC
proposes **one sign-in, kept once**:

1. **`@sovereignfs/auth`**, a published package made by moving the part of core's sign-in that is not about core into it: the better-auth
   setup and its rules, the session helpers, the server actions behind the sign-in and security pages, and the browser side (the sign-in
   value, the passkey ceremony).
2. **Core uses it**, and adds what only core has on top: the OIDC provider, invitations, the owner and roles, logout notices, the lock.
3. **Every app runs the same session layer**, with core as one way in and local accounts as another, each turned on by its environment.
   A hosted app and an app on its own differ in configuration, not in code.
4. **The forms and panels are `@sovereignfs/ui` components**, and the template makes small page files that use them, so an app can
   change a page and still receive fixes by a version bump.
5. **What an app is told about a person is written down as a contract**, with a typed `user` in place of raw claims and a few additions.

## Motivation

- **Three copies of one design.** Core's sign-in is about 5–6k lines that are not about core (§"Current state"). Tusk and Fjord carry their
  own, not compared line by line in research 0004 but the same design, and already apart from core's: Tusk asks for a fresh session for ten
  minutes where core sets `freshAge: 0` and asks for the password instead; neither app derives the sign-in value core requires so that it
  never receives a password (core-app §5.2). A security fix to sign-in has to land up to three times.
- **The template makes the wrong app.** It makes a core-only app that "cannot run without an instance" (`building-an-app` §6), while §1
  says every app "exists on its own". Its own §15 lists this as not settled.
- **The design system's sign-in pieces are unused.** `@sovereignfs/ui` exports `AuthCard`, `AuthField`, `AuthCodeInput` and the rest so that
  every app's sign-in looks the same; core has its own copies of each.
- **Apps read raw claims.** The SDK's session has `claims`, and the template reads `session.claims.name` by hand. Nothing tells an app
  which data points it can count on.

## Current state

| Where                          | Sign-in                                                                                                                                 | Sessions                                 |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| Core                           | better-auth 1.7 with passkeys, two-factor, the sign-in value, the OIDC provider (`apps/core/src/auth/`, `app/(auth)/`, `app/security/`) | better-auth's, in core's database        |
| The template, core only        | The SDK's `nextAuth`: PKCE to core, refresh once, back-channel logout, account-deleted, key release (`@sovereignfs/sdk/next`)           | The SDK's `SessionStore` (`sv_sessions`) |
| Tusk, Fjord: local and/or core | better-auth with passkeys and two-factor, and `genericOAuth` to core (`tusk/src/auth/auth.ts`); the SDK only to verify core's notices   | better-auth's, in a second store         |

What core's sign-in is made of, by whether it is about core:

| Generic                                                                                                                                                                             | Only core's                                                                                                        |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| The adapter's table mapping; `policedHash`; passkeys user-verified; the second step with no "trust this device"; `confirmPassword`; the `NEEDS_MAIL` answer; `assertMayOpenSession` | The OIDC provider (`oidcPlugins`, OAuth tables, `disabledPaths`); `oauth-continuation`; consent; key release       |
| Name, time zone and locale hooks; rate limits; cookie cache off; `freshAge: 0`; `__Host-` cookies (`cookies.ts`); `resolveAuthSettings` (already takes a prefix)                    | Invitations; the first account as owner; roles and the matrix (`authorize.ts`); instance settings for registration |
| `getSession`, `requireSignedIn`, `return-to`, `password-policy`, `src/sessions/*`, the profile and avatar, change password                                                          | Logout notices on `session.delete`; `AccountManager`'s deletion and its notices to apps                            |
| The sign-in, sign-up, second-step, forgot and reset forms; the passkey, two-factor and sessions panels                                                                              | The lock ([RFC 0006](0006-sessions-across-apps-and-a-lock.md) part B); the Console; the launcher                   |

The generic column is tangled with the other at a few seams: `getSession` and `requireSignedIn` apply the lock; the forms call core's key
store actions (`src/keys/session.ts`); `auth.ts` is one function with both columns in it.

## Design

### 1. The package

`@sovereignfs/auth` is published, like `ui` and `sdk`, and holds the rule every package holds: it works with no core present and never
imports `apps/core`.

| Entry      | What it is                                                                                                                                                                                           |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `./server` | `createAuthPreset(options)`: the better-auth options for the generic column, and the account tables' schema for each dialect                                                                         |
| `./server` | The session helpers: `getSession`, `requireSignedIn`, `returnTo`, `confirmPassword`, `listSessions`/`endSession`, the password policy                                                                |
| `./next`   | The server actions and route handlers behind the pages: sign in, sign up, forgot, reset, the second step, passkeys, two-factor setup, sessions, profile and picture, change password, delete account |
| `./client` | The browser client, `derive` (the sign-in value, `@sovereignfs/crypto`'s `svp1`), the passkey ceremony with PRF                                                                                      |
| `./core`   | Core as a way in for an app (§3), on the SDK's token handling                                                                                                                                        |

What an app gives it:

- **its database** (one of the three dialects, through `@sovereignfs/database`) and a prefix for its settings (`resolveAuthSettings`
  already takes one);
- **mail**, with the templates `@sovereignfs/mailer` already has (verification, reset, account created, second step reset);
- **a registration policy**: the first account only, open, closed, or a function (core's invitations are one);
- **the salt for the sign-in value**: core's instance id, or the app's vault id, as `localVault` already uses it (`sdk` §9.5);
- **hooks**: `onUserCreate`, `onSessionEnd`, `beforeRequest`, and the key store's `afterPasswordAccepted`, `afterPasskeyAccepted`,
  `afterSecondStep`, `before/afterPasswordChange` (core's `KeyVault` actions, or the SDK's `AppVault`/`localVault`, or none);
- **extra plugins**, which better-auth runs after the preset's.

`getSession` and `requireSignedIn` take an extra check instead of importing the lock: core passes its lock, which keeps
"a locked session is no session" in one place; an app with no lock passes nothing.

### 2. Core on the package

Core's `createAuth` becomes the preset plus core's additions, each of which already exists:

- the OIDC provider's plugins, tables and `disabledPaths`;
- invitations and the first account as owner, as the registration policy and `onUserCreate`;
- logout notices, as `onSessionEnd`;
- the lock, as `beforeRequest` and the extra check above;
- dropping a removed passkey's way into the keys, after the passkey routes.

Nothing a person or an app sees changes in this step. Core's pages become thin files over the package's actions and `ui`'s components.

### 3. Core as a way in, and who owns the refresh token

An app turns on core with `<P>_CORE_URL` and its client settings, and local accounts with `<P>_AUTH_LOCAL`. Either or both.

**This RFC does not use better-auth's `genericOAuth` for core.** That plugin stores the provider's refresh token in the app's `accounts`
row and refreshes it itself (better-auth 1.7.18, `/get-access-token` and `/refresh-token`), with none of the guarantees the SDK keeps:
one refresh at a time per person, the new token stored before the access token is used, no retry of a refresh that was sent, and a
refusal to send again one whose answer was lost (`packages/sdk/src/tokens.ts`). Core rotates a refresh token on every use and takes one
used twice for theft, so two owners of one token end the person's sessions.

Instead, `./core` is a small better-auth plugin built on the SDK:

- **sign-in** is the SDK's PKCE flow (`createSovereign().auth`), which ends by opening a better-auth session for the account linked to
  the `sub`;
- **the refresh token is the SDK's alone**, in its `TokenStore`; better-auth's `accounts` row for core holds no token;
- **the hourly check** of RFC 0006 part A (`prompt=none`) is the SDK's, and its new ID token updates the account's claims;
- **back-channel logout** and **account-deleted** are the SDK's verified handlers, ending the better-auth sessions for that `sid`, or
  every session of that `sub`.

### 4. What `nextAuth` did, and where it goes

"One layer" replaces the SDK's `nextAuth` for new apps. Each of its features has a home:

| `nextAuth` feature                                | In the new design                                                            |
| ------------------------------------------------- | ---------------------------------------------------------------------------- |
| PKCE sign-in, `returnTo`, `prompt`, `max_age`     | `./core`'s sign-in, on the SDK's                                             |
| The session and its cookie                        | better-auth's session (`__Host-`, in the database, no cookie cache)          |
| Hourly check, claims replaced (RFC 0006 A2, A3)   | `./core`, on the SDK's check                                                 |
| Back-channel logout by `sid`, or by `sub`         | `./core`, ending better-auth sessions                                        |
| Account deleted, answered after the app's handler | `./core`, calling the app's handler                                          |
| Refresh once (`offline_access`)                   | The SDK's `TokenStore`, unchanged                                            |
| `key-secret` and key release                      | `./core`, the per-session secret kept with the better-auth session           |
| Sign-out, through core's end-session              | `./core`, when the session came from core; core decides what it ends (below) |

**`nextAuth` is deprecated** (decided in review). It keeps working, marked deprecated in the SDK and its guide, for the apps already on
it, once the template no longer uses it; it is removed in a later major version of the SDK, with a migration note in `docs/upgrade.md`.
An app that only ever runs hosted still uses the package, with local accounts off: one sign-in to keep, not two.

#### Signing out of an app that came through core

Signing out of an app always ends the app's session. Whether it also ends core's depends on whose app it is (decided in review):

- **A hosted app** (one the instance runs, from `suite.yml`): signing out of it signs the person out of core too, and so, by core's logout
  notices (core-app §3.6.5), out of every other app they used in that session. The suite is one account; core's own account menu already
  signs out of everything, and now every hosted app's does the same.
- **An external app** (`external: true`, or one an operator registered in the Console): signing out of it ends that app's session only. A
  person's Sovereign account is not ended by an app the instance does not run, any more than signing out of a site that uses "Sign in with
  Google" signs them out of Google.

**Core decides, not the app.** Today any app with end-session enabled (on by itself once it has a post-logout or back-channel address,
core-app §3.7.1) ends core's session through the end-session endpoint, external apps included, and an off-the-shelf OIDC client cannot be
asked to behave otherwise. So:

- each app at core gets a setting, **"Signing out of this app signs out of Sovereign"**: `sv apply` turns it on for a hosted app, and it is
  off for an external app and for one registered in the Console, where an operator can change it under the technical settings;
- with it on, end-session does what it does today; with it off, end-session ends nothing of core's and returns the person to the app's
  registered post-logout address, so a standard client's sign-out still lands where it should;
- `./core` always sends the person through end-session when the session came from core, so the package has one path and the rule lives in
  one place. An app's local account has no core session, and signing out of it is the app's alone.

This changes core-app §3.6.5 and §3.7.1, `contracts/suite.md` (what `sv apply` sets for a hosted app) and the Console's app form.

### 5. Who a person is, when both ways in are on

- The app's own user id is better-auth's, for every account; `sub` is kept on the account linked to core.
- A sign-in through core is matched by `sub`, never by email (`building-an-app` §6). An email that is already a local account's is
  refused until the person links the two from a signed-in session, as Tusk does today (`disableImplicitLinking`).
- An account that came only from core has no password: the password, second-step and passkey pages say it signs in through core.

### 6. The tables and their migrations

- The package ships the account tables' schema for each dialect, and a migration set for apps, run with `@sovereignfs/database`'s
  `migrate(…, { table })`, recorded apart from the app's own, as the vault already is.
- **Core keeps its own history.** Its `users` table has columns no app has (`role`, `deactivatedAt`, the terms), and a changed migration
  refuses to boot. The package's schema is the shape core's must keep; a test holds core's tables to it.
- **Tusk's and Fjord's stores** move onto the package's set by a migration of their own that checks the tables are what it expects and
  records them as done; a populated store is the test.

### 7. The rules that follow the code

Rules held today by tests that scan `apps/core` move with the code:

- every server action and route the package exports calls its own session and capability check, and `requireSameOrigin` for a
  route that changes something; the tests that scan core also scan the package;
- the list of places that call better-auth with the request's headers (`server-auth-calls.test.ts`) covers the package;
- **better-auth's packages stay pinned to one version**: the package depends on the exact version, a peer range would let an app run
  another; an app that installs a second copy is refused at start-up;
- **a better-auth bump is still verified against a populated store**: the `auth-store` fixtures move into the package's tests.

### 8. The interface

- Forms and panels move into `@sovereignfs/ui` as components that know nothing of Next.js: `SignInForm`, `SignUpForm`, `TwoFactorForm`,
  `ResetForm`, `PasskeyPanel`, `TwoFactorPanel`, `SessionsPanel`, `ChangePasswordForm`, `ProfilePanel`, and `AccountMenu` over `UserMenu`.
  Each takes its actions and links as props, gets a story and a gallery entry.
- Core moves onto the existing `Auth*` components and drops `auth-card`, `auth-field`, `auth-notice`, `auth-shell` and `auth.module.css`.
- `./next` wires the components to the actions; a page in an app is a few lines.

### 9. The template

`tools/create` makes a "local and/or core" app, in the three database forms: thin `app/(auth)/*` and `app/security/*` pages over the
package, the account migrations, and both ways in from the environment. The `env.md` §2 rows for `AUTH_LOCAL`, `AUTH_SIGNUP` and
`AUTH_PASSWORD_MIN_LENGTH` become the package's settings, and `AUTH_LOCAL` takes the contract's boolean form.

### 10. What an app is told about a person

Already sent, in the ID token and from userinfo (`apps/core/src/oauth/claims.ts`):

| Scope     | Claims                                                                           |
| --------- | -------------------------------------------------------------------------------- |
| `openid`  | `sub`, `sid`, `auth_time`                                                        |
| `profile` | `name`, `picture` (an absolute, versioned address on core), `locale`, `zoneinfo` |
| `email`   | `email`, `email_verified`                                                        |
| `roles`   | `roles`, for a trusted app only                                                  |

Claims are replaced within the hour by RFC 0006 part A. Proposed:

- **A typed `user`** on the session, in the SDK and the package: `{ id, sub?, name, email, emailVerified, picture?, locale?, zoneinfo?,
roles }`, the same shape for a local account and one from core, so an app writes one header and one account menu.
- **`amr`**, how the person signed in (`pwd`, `hwk` for a passkey, `otp` for the second step), and `acr` to match, so an app can ask for a
  stronger sign-in alongside `max_age` (task 14.14).
- **A profile-changed notice** is not proposed: the hourly check already brings a new name, picture or role within the hour, and a
  notice would only make that immediate. It stays an option if an app needs it.
- **`given_name` and `family_name`** are advertised in `claims_supported` and never sent; they are removed from the discovery document.
- **Appearance is not sent.** Core keeps it on the device, by design (`apps/core/src/theme.ts`): it is about the screen, not the person.
  The instance's name, colours and pictures already reach apps through `/.well-known/sovereign-instance`.
- **Not sent, and kept so:** another person's email beyond an exact Directory match; whether the person has passkeys, a second step or
  other sessions; anything of the lock beyond an app's check waiting on the lock page.

## Alternatives considered

- **Package Tusk's and Fjord's sign-in** (research 0004's step). It is the code that already does "local and/or core", but core would keep
  its own, and core's is the one that holds the hard rules (the sign-in value, no fresh session, user-verified passkeys).
- **Two paths: `nextAuth` for hosted apps, the package for the rest.** Less in a hosted app (no account tables), but two sign-ins to keep,
  and an app that wants local accounts later changes its sessions.
- **Whole pages from the package.** Least code in an app, hardest to change; Next.js's file routing makes pages the app's anyway.
- **Pages copied by the template.** Easiest to change, but a security fix is copied by hand into every app.
- **`genericOAuth` for core.** Smaller, but two owners of one rotating refresh token (§3).

## Rollout

Each step is one task, one branch, one pull request, with no change a person or an app sees until step 5:

1. The package, with the preset taken out of core; core switched over. Proof: `pnpm e2e`, `pnpm test:db` on each database, and the
   populated `auth-store` fixtures.
2. The session helpers, with the extra check in place of the lock's import.
3. The forms and panels into `@sovereignfs/ui`; core onto them.
4. `./next`'s actions; core's pages thin.
5. `./core` and local accounts in an app, shown by a fixture app in `apps/e2e` that signs in both ways; core's per-app sign-out setting,
   with `sv apply` turning it on for hosted apps.
6. The template switched over.
7. The data contract: the typed `user`, `amr`/`acr`, the discovery document; `contracts/core-api/`, the SDK and core-app §3.6.
8. Tusk and Fjord onto the package, in their own repositories.

## Open questions

1. **Tusk's ten-minute fresh session** against core's "ask for the password instead": the package takes core's rule; Tusk's pages that
   rely on a fresh session change with it.
2. **An app's own lock:** the lock is core's today and apps lock through core. Whether an app on its own offers one, from the package, is
   left for later.

## Decided in review

- **Signing out:** a hosted app signs the person out of core too; an external app signs out of itself only; core holds the rule, by a
  setting on each app ("Signing out of an app that came through core", above).
- **The package** is `@sovereignfs/auth`, licensed MPL-2.0 like `ui` and `sdk`.
- **`nextAuth` is deprecated** once the template moves off it, and removed in a later major version of the SDK (§4).

## Changelog

| Date          | Change                                                                                                           |
| ------------- | ---------------------------------------------------------------------------------------------------------------- |
| November 2026 | Draft                                                                                                            |
| November 2026 | Decided: signing out of a hosted app signs out of core, of an external app only of itself, held by core; MPL-2.0 |
| November 2026 | Decided: `nextAuth` deprecated; tasks written into the epics, workstream 0008                                    |
