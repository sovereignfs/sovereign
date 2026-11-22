# RFC 0007 — One sign-in for core and every app

|              |                                                                                                                                                                                                                                                       |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Status**   | Partially implemented (2026-11-20): every task built but 6.6, parked (better-auth's provider owns `amr`). Amendment 1 accepted, to be built                                                                                                           |
| **Date**     | November 2026                                                                                                                                                                                                                                         |
| **Author**   | Claude Code, for review                                                                                                                                                                                                                               |
| **Scope**    | A new published package, `@sovereignfs/auth`; `apps/core`'s sign-in, account and security pages; `@sovereignfs/ui`; `@sovereignfs/sdk`; the app template in `tools/create`; `contracts/core-api/`, `contracts/env.md`; `docs/specs/core-app.md` §3.6  |
| **Research** | [0004](../research/0004-a-kit-for-apps-of-their-own.md) (its sign-in step), [0011](../research/0011-streamlining-sign-in.md)                                                                                                                          |
| **Tasks**    | [epic 17](../epics/one-sign-in.md) (17.1 to 17.5), [2.6](../epics/design-system.md), [6.5, 6.6](../epics/oidc-provider.md), [13.35](../epics/operator-cli.md), [14.15, 14.16](../epics/sdk.md); [workstream 0008](../workstreams/0008-one-sign-in.md) |

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
- **Core keeps its own history.** Its `users` table has columns no app has (`role` and the terms), and a changed migration
  refuses to boot. The package's schema is the shape core's must keep; a test holds core's tables to it.
- **Tusk's and Fjord's stores** move onto the package's set by a migration of their own that checks the tables are what it expects and
  records them as done; a populated store is the test.

### 7. The rules that follow the code

Rules held today by tests that scan `apps/core` move with the code:

- every server action and route the package exports calls its own session and capability check, and `requireSameOrigin` for a
  route that changes something; the tests that scan core also scan the package;
- the list of places that call better-auth with the request's headers (`server-auth-calls.test.ts`) covers the package;
- **better-auth's packages stay pinned to one version**: the package depends on the exact version, a peer range would let an app run
  another; a test holds every workspace manifest to that one version;
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
- **Parked:** better-auth's provider owns `acr` and `amr` and strips them from core's claims (task 6.6). As designed: **`amr`**, how the person signed in (RFC 8176: `pwd` for the password, `otp` added for the second step's code or a backup code, `hwk` and `user` for a passkey, `mfa` when two were used), and **`acr`** (`"1"` one factor, `"2"` two or a passkey, `"0"` a session opened another way, such as an emailed link), so an app can ask for a stronger sign-in alongside `max_age` (task 14.14).
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

None left for this RFC. An app's own lock, for an app that runs with no core, is not part of it: apps lock through core (RFC 0006),
and a lock in the package is a later proposal if an app on its own needs one.

## Decided in review

- **Signing out:** a hosted app signs the person out of core too; an external app signs out of itself only; core holds the rule, by a
  setting on each app ("Signing out of an app that came through core", above).
- **The package** is `@sovereignfs/auth`, licensed MPL-2.0 like `ui` and `sdk`.
- **`nextAuth` is deprecated** once the template moves off it, and removed in a later major version of the SDK (§4).
- **A fresh session:** the package takes core's rule (`freshAge: 0`, the password asked again); Tusk's pages that rely on its ten-minute
  fresh session change when it moves onto the package.
- **The specification** is [`docs/specs/auth.md`](../specs/auth.md) (task 17.1).

## Amendment 1 — accounts an app already has, and the key secret (November 2026)

**Status: accepted** by the goal owner on 2026-11-22 (task 20.4, [research 0014](../research/0014-suite-alignment.md)); built in 20.5 and 20.6.

The RFC moves a sign-in that already has people (§6: Tusk's and Fjord's stores) by its tables only, and leaves two things out that every
released app meets when it moves: the passwords it stored, which are hashes of the password and not of the sign-in value, and accounts
that came from core through `genericOAuth`. It also left the key secret of §4's table as "`./core`, kept with the better-auth session"
without saying how, so the template's `--encryption` form still signs in with `nextAuth`. Shopper found the cost of a third gap on
2026-11-22: an app needs a person's core `sub` from its own user id, the package gives only the reverse, and Shopper's own lookup read a
column nothing wrote, so no account through core had keys. This amendment settles all four. Nothing in it applies to core, which moved its
own passwords by reset (`docs/upgrade.md`, 0.100.0) and turns none of it on.

### A1. A password an app stored before the package

**Decided: moved at the next sign-in for a period, then a reset** (research 0014, option C).

- **Marked when the app moves.** The app's checking migration (§6) records every account that has a password (`accounts.provider_id`
  `credential`) in `sv_legacy_passwords` (`user_id`, `until`), with `until` 90 days after it runs. Only that migration writes the table;
  an account made on the package is never in it.
- **Signing in is unchanged** for everyone: the browser derives the sign-in value and sends it (auth.md §4, rule 1). A marked account's
  stored hash is of the password, so that value does not match, and the answer is the usual wrong password; nothing says the account is
  marked.
- **The one exception to rule 1.** While any marked account's `until` is ahead, the salt document the sign-in page already reads says so
  (`moving: true`, nothing about any account). Then, and only after a sign-in that was answered as a wrong password, the form sends
  once more to `POST /api/auth/sv/move-password` the address, the password itself and the sign-in value derived from it. The server
  answers as a wrong password unless the account is marked, its `until` is ahead and the password matches the stored hash; then, in
  one transaction, it stores the hash of the sign-in value, removes the mark, and opens the session through every rule a password
  sign-in passes (the second step, `assertMayOpenSession`, the key store's hooks). The password is used for that one comparison and is
  never stored or logged; the route is rate limited as signing in is, counts toward the same limit, and refuses a request whose `Origin`
  is not the app's. It compares against a stored hash for every request, a fixed one where the account is not marked, so an answer
  takes as long whichever way it goes. It does not exist once no account is marked, nor where the app did not run the checking migration (core).
- **A person who mistypes** during the period also sends their password once more, to the same app over the same connection; that is the
  exception's cost, and why it ends. A mark whose `until` has passed is never moved.
- **After the period** a marked account signs in only after a reset: by the app's forgot-password page where it sends mail, or by a reset link an operator makes on the server, as core's `sovereign-admin accounts reset-link` does. The package gives
  `resetLink(userId)` (one use, one hour); each app exposes it through its own command, never a route. A reset removes the mark.
- **Passkeys and the second step** are untouched: a passkey signs in a marked account as before, and it stays marked until its password
  is used or reset.

**Rejected:** a reset for everyone (rule 1 whole, but most apps have no mail and every person would need an operator); moving at
sign-in with no end (the exception would never close); a client that sends the password on every sign-in during the period (it would
send everyone's, not only those who mistype).

### A2. Accounts that came from core through `genericOAuth`

- **The rows are kept.** `genericOAuth` wrote `accounts` rows with `provider_id` `sovereign` and the account id core's `sub`, which is
  what `./core` reads (`userIdForSub`), so no person gets a second account.
- **Their tokens are dropped.** The checking migration clears `access_token`, `refresh_token`, `id_token` and their expiry columns on
  those rows; core's refresh token is the SDK's alone (§3). An app that used a person's refresh token (Tally's directory) gets a new one
  the next time the person signs in through core, and says until then that the feature needs a sign-in.
- **Their sessions continue, and are checked.** For each session of an account whose only way in is core, the migration writes a
  `sv_core_sign_ins` row with no `sid` or ID token and `checked_at` 0, so the session is checked against core at its next request
  (`prompt=none`, sdk §9.7): renewed in place while core's session lasts, ended on `login_required`. A session of an account that has a
  password as well is left as it is: it cannot be told which way it was opened, and it ends at its own expiry. Nothing is deleted from
  `sessions` (auth.md §4, rule 13).

### A3. A person's core `sub`

`./core` gives `coreSubOf(database, userId)`, the inverse of `userIdForSub`: the account id of the user's `sovereign` row, or nothing for
a person who never signed in through core. It is the only way an app finds it. An app keeps no copy of the `sub` in its own tables; one
that has a column for it (Shopper's `person.core_sub`) reads this instead and drops the column.

### A4. The key secret and key release over the package's session

- **`./core` serves the key secret** that `@sovereignfs/sdk/keys` and `localVault` ask for (sdk §9.3, §9.5), at `GET /api/auth/sv/key-secret`,
  with the rules `nextAuth` has: 32 random bytes, made the first time a page of this session asks, refused for a request a browser marks as
  not `same-origin` (`Sec-Fetch-Site`), `no-store`, `401` with no session. The pages pass its address as `secretPath`.
- **It is kept in `sv_key_secrets`** (`session_id` referencing `sessions(id)` `ON DELETE CASCADE`, `secret`, `created_at`), never in the
  session's own row (better-auth returns that row to the browser with the session), and goes when the session ends, however it ends.
- **Whose `sub`.** For a session that came through core it is the core `sub` (A3), so core's key release and the keys it gives match;
  for a local session it is the app's user id, the `sub` `localVault` and `AppVault` key the person by. An account linked both ways is
  keyed by the way the session was opened.
- **The template's `--encryption` form moves onto the package** with it, and `nextAuth` is then used by no template (§4).

### A5. What changes elsewhere

- auth.md §4 rule 1 names A1's exception; §8 gains A2 to A4; §10 lists `sv_legacy_passwords` and `sv_key_secrets`.
- sdk.md §9.3: the key secret is served by `@sovereignfs/auth/core` as well as `nextAuth`.
- `building-an-app.md` §15: an app's existing accounts move as A1 and A2 say; Shopper's ADR 0001 follows when Shopper moves (20.14).

### A6. Questions this answers

From research 0014: **the salt** — an app that moves needs the sign-in salt route the template has (the vault id, sdk §9.5), and it is
part of the move; **the period** — 90 days from the migration, the same for every app, recorded per account; **Tusk's fresh session** —
settled in review (the password asked again), with nothing further here.

## Changelog

| Date          | Change                                                                                                           |
| ------------- | ---------------------------------------------------------------------------------------------------------------- |
| November 2026 | Draft                                                                                                            |
| November 2026 | Decided: signing out of a hosted app signs out of core, of an external app only of itself, held by core; MPL-2.0 |
| November 2026 | Decided: `nextAuth` deprecated; tasks written into the epics, workstream 0008                                    |
| November 2026 | The last open questions settled (a fresh session; an app's own lock left out); the specification written         |
| November 2026 | Accepted by the goal owner                                                                                       |
| November 2026 | Amendment 1 proposed: accounts an app already has, a person's core `sub`, and the key secret (task 20.4)         |
