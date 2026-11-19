# Sovereign sign-in package — specification

|            |                                                                                                            |
| ---------- | ---------------------------------------------------------------------------------------------------------- |
| **Status** | Draft. Not built ([epic 17](../epics/one-sign-in.md); designed in [RFC 0007](../rfcs/0007-one-sign-in.md)) |
| **Covers** | `@sovereignfs/auth`                                                                                        |

This document is the single source of truth for what `@sovereignfs/auth` does. Where code, another document or an issue disagrees with
it, this document wins until it is changed. What core does on top of the package stays in [`core-app.md`](core-app.md); how an app is
configured is [`contracts/env.md`](../../contracts/env.md); what the SDK does is [`sdk.md`](sdk.md).

The key words **MUST**, **MUST NOT**, **SHOULD**, **SHOULD NOT** and **MAY** are used as described in RFC 2119.

---

## 1. What it is

`@sovereignfs/auth` is how core and every Sovereign app sign people in. It is core's own sign-in, the part of it that is not about
core, so that an app holds the same rules core does without copying them.

```text
better-auth (pinned)            sessions, accounts, passkeys, the second step
  ↓ configured by
@sovereignfs/auth               the rules, the session helpers, the pages' actions, core as a way in
  ↓ used by
apps/core                       + the OIDC provider, invitations, the owner and roles, logout notices, the lock
an app                          + its own data and pages
```

### 1.1 What bounds it

1. **It works with no core present** and never imports `apps/core`, as every package in this repository.
2. **It knows no particular app**, and no particular instance: what differs between them is given to it (§3).
3. **One way to do each thing.** An app that uses the package MUST NOT open a session, hash a password, or hold core's refresh token
   any other way.
4. **It is a published contract** (`docs/releasing.md`), MPL-2.0, versioned as AGENTS.md says for published packages: a patch never
   breaks, a breaking change is at least a minor with a `docs/upgrade.md` note.

## 2. Entries

| Entry      | Where it runs | What it holds                                                                                                                      |
| ---------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `./server` | Server        | `createAuthPreset(options)` (§4); the session helpers (§6); the account tables' schema for each dialect and their migrations (§10) |
| `./next`   | Server        | The server actions and route handlers behind the sign-in, security and profile pages (§7)                                          |
| `./client` | Browser       | The browser client; `derive`, the sign-in value (core-app §5.2); the passkey ceremony with PRF; the key store's browser hooks      |
| `./core`   | Server        | Core as a way in for an app (§8)                                                                                                   |

A browser that imports `./server`, `./next` or `./core` MUST fail at once, as the SDK's server entry does.

## 3. What an app gives it

| Option         | What it is                                                                                                                                                                  |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `prefix`       | The app's settings prefix (`SV` for core); the settings of §5 are read with it, through `@sovereignfs/config`                                                               |
| `database`     | One of the three dialects, through `@sovereignfs/database`                                                                                                                  |
| `mail`         | Sending: verification, reset, account created, second step reset, with `@sovereignfs/mailer`'s templates. An app with no mail set up says so before any lookup (§4, rule 9) |
| `registration` | Who may get an account (§5 `AUTH_SIGNUP`), or a function that decides (core's invitations are one); called inside the user-create hook, never from a route                  |
| `salt`         | What the sign-in value is derived with: core's instance id, or the app's vault id (sdk §9.5)                                                                                |
| `hooks`        | `onUserCreate`, `onSessionEnd`, `beforeRequest`, and an extra session check (§6)                                                                                            |
| `keyStore`     | The key store's hooks around signing in and changing the password (§7.2), or none                                                                                           |
| `plugins`      | More better-auth plugins, run after the preset's                                                                                                                            |

The preset gives back better-auth's options; the app (or core) calls better-auth with them. Core passes its additions this way and in
no other: nothing the preset holds is overridden by an option, only added to.

## 4. The rules it holds

Every rule core's sign-in holds is either the package's, or core's addition on top of it. The package's, and where core's spec says
each:

| #   | Rule                                                                                                                                                                                                                                                                                               | core-app       |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| 1   | **The server never receives a password.** Every form sends the sign-in value the browser derives (`./client` `derive`), the policy is checked there, the hash function (`policedHash`) refuses anything else, and signing in with anything else is answered as a wrong password, before any lookup | §5.2           |
| 2   | better-auth's origin and CSRF checks are never switched off; requests are accepted only from the app's origin and its trusted origins                                                                                                                                                              | §3.5, §5.2     |
| 3   | **No fresh session** (`session.freshAge: 0`): a sensitive action asks for the password again, through `confirmPassword`, which counts wrong answers (5 in 10 minutes)                                                                                                                              | §3.2.1, §3.5   |
| 4   | **Every way of opening a session passes the second step** when it is on, and there is no "trust this device"                                                                                                                                                                                       | §3.4.1         |
| 5   | **Passkeys MUST be user-verified**, checked in the package's hooks, not left to better-auth                                                                                                                                                                                                        | §3.4.2         |
| 6   | **Every session passes `assertMayOpenSession`** (the address verified where verification is required, the account not deactivated), the hook on creating one                                                                                                                                       | §3.3.6         |
| 7   | **Registration is decided in the user-create hook**, which every account passes through; a role or any other privilege is never taken from a request; a name, time zone and locale are checked there; a picture is never taken as input                                                            | §3.3.1, §3.3.5 |
| 8   | **The cookie cache is off**: a session is read from the database on every request, so an ended session stops working at once                                                                                                                                                                       | §3.5           |
| 9   | **Mail is sent in the background, and its availability checked first**, so verification, resend and reset answer alike for known and unknown addresses                                                                                                                                             | §3.3.3, §3.3.4 |
| 10  | **Cookies** are host-only and `__Host-` over https, their names decided in one place                                                                                                                                                                                                               | §3.5           |
| 11  | **A session lasts seven days without use**, pushed back once a day while used, set explicitly                                                                                                                                                                                                      | §3.5           |
| 12  | **Rate limits** on the authentication routes, counted in the database                                                                                                                                                                                                                              | §3.5           |
| 13  | **A session is ended through better-auth's endpoints**, by its id and only for its owner, never by deleting its row; a list of sessions never carries a token                                                                                                                                      | §3.5           |
| 14  | **The browser client never follows a redirect by itself**: the forms navigate, so a callback is never requested twice with one code                                                                                                                                                                | §3.6.1         |
| 15  | **A secret is required, with no default**: the app MUST NOT start without `AUTH_SECRET` (at least 32 characters)                                                                                                                                                                                   | §3.5           |
| 16  | **Every comparison of a key or token is timing-safe**                                                                                                                                                                                                                                              | —              |
| 17  | **A picture is judged by its bytes**, and `users.image` is set only by uploading one                                                                                                                                                                                                               | §3.11          |

Core's additions, which stay in core and in `core-app.md`: the OIDC provider and everything of §3.6 and §3.7; invitations, the first
account as owner and the owner's guarantees (§3.2, §3.3.1, §3.10); roles, the capability matrix and `requireCapability` (§3.2);
logout notices (§3.6.5); the lock (§3.5.1); the vault, key release and escrow (§5); terms and privacy (§3.3.5, which an app MAY also pass
through the user-create hook).

## 5. Settings

Read with the app's prefix (`contracts/env.md` §2):

| Name                                               | Meaning                                                                                                                              |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `URL`                                              | The app's address; the relying party of its passkeys and the origin requests must come from                                          |
| `AUTH_SECRET`                                      | Required (rule 15)                                                                                                                   |
| `AUTH_TRUSTED_ORIGINS`                             | Other origins requests may come from                                                                                                 |
| `AUTH_LOCAL`                                       | `true` turns on the app's own accounts. Default `true` when `CORE_URL` is unset, `false` when it is set                              |
| `AUTH_SIGNUP`                                      | `open`, `closed` (the first account only) or `invite` (`contracts/env.md` §2); for the app's own accounts                            |
| `AUTH_PASSWORD_MIN_LENGTH`                         | The shortest password the app's own accounts accept: default 8, never below it, with `AUTH_PASSWORD_REQUIRE_*` as in core-app §3.3.2 |
| `CORE_URL`, `CORE_CLIENT_ID`, `CORE_CLIENT_SECRET` | Core as a way in (§8), all three or none                                                                                             |

An app with neither way in (`AUTH_LOCAL=false` and no `CORE_URL`) MUST refuse to start. `AUTH_LOCAL` is a boolean of the contract,
exactly `true` or `false`; the `1` some apps read today is refused.

Core reads its own settings through the same table under `SV`, with `AUTH_LOCAL` always on and no `CORE_URL`: core is not an app of
another core.

## 6. Sessions

- `getSession()` gives the signed-in person and their session, or nothing. It runs the app's extra check, and gives nothing when the
  check says so: core's lock is that check, so a locked session is no session wherever the package reads one.
- `requireSignedIn(returnTo)` sends someone without a session to sign in, with `returnTo` kept, and someone the extra check refuses
  wherever the check says (core's lock page). Every signed-in page of an app calls it, or `getSession` itself; never a session read and a
  redirect by hand.
- `returnTo` is always a path on the app; anything else is replaced by `/`.
- `listSessions` and `endSession` / `endOtherSessions` work on the signed-in person's own sessions only (rule 13).
- The password policy is one function, used by the forms in the browser and by the server.

## 7. The pages' actions

### 7.1 What there is

`./next` exports an action or route for each of: sign in (password, passkey), sign up, forgot and reset the password, verify an address
and send the link again, the second step (a code, a backup code, a passkey), passkeys (add, rename, remove), the second step's setup,
sessions (list, end), the profile and its picture, change the password, and delete the account. The forms that call them are
`@sovereignfs/ui` components (design-system §6), and an app's page is a few lines that join the two.

Every action and route:

- reads the session itself and refuses without one, whatever the page's guard says, since a server action is a public endpoint;
- calls the app's capability check where the app has one (core's `requireCapability`);
- checks the origin (`requireSameOrigin`) when it is a route that changes something;
- answers with a result a form can show, never a thrown error a person sees.

Deleting an account asks for the password, then calls the app's deletion and ends every session; an app that cannot delete
someone (core's owner) refuses there.

### 7.2 The key store

An app whose people's data is encrypted gives the package its key store's hooks: after a password, a passkey or the second step is
accepted, before and after the password changes, and on signing out. Core gives its vault's (core-app §5.4); an app with no core gives
the SDK's (`AppVault`, `localVault`, sdk §9.5); an app with no encryption gives none. The package never sees a key.

## 8. Core as a way in

With `CORE_URL` set, an app signs people in through core. `./core` is a better-auth plugin built on the SDK:

- **Signing in** is the SDK's (sdk §9.1): PKCE, `returnTo`, `prompt`, `max_age`. It ends by opening the app's session for the account
  linked to core's `sub`.
- **Core's refresh token is the SDK's alone**, in its `TokenStore` (sdk §5.1). better-auth's account row for core MUST hold no token,
  and better-auth MUST NOT refresh it: core rotates a refresh token on every use and takes one used twice for theft. better-auth's
  `genericOAuth` is not used.
- **The session follows core's** (sdk §9.7): checked at most an hour after the last check, with `prompt=none`; the new ID token's
  claims update the account; `login_required` ends the app's session.
- **Core's notices** are the SDK's verified handlers (sdk §9.2): a logout notice ends the app's session for that `sid`, or every
  session of that `sub`; an account-deleted notice runs the app's deletion before it is answered.
- **Encryption**: the per-session key secret and key release as the SDK gives them (sdk §9.3).
- **Signing out** of a session that came from core sends the person through core's end-session; core decides whether that ends core's
  session too (core-app §3.6.5): yes for a hosted app, no for an external one.

## 9. Who a person is

- The app's own user id is the package's, for every account. An account that came through core keeps core's `sub` on its link.
- A sign-in through core is matched by `sub`, **never by email**. An email that is already a local account's is refused until the
  person links the two from a signed-in session of the local account, with the same address at both.
- An account linked to core and to nothing else has no password: the password, second-step and passkey pages say it signs in through
  core.
- An account's last way in cannot be removed.

What an app is told about a person comes from its own account row, kept current from core's claims for a linked account (§8). The
session gives it as one typed `user`: `id`, `sub` (linked accounts), `name`, `email`, `emailVerified`, `picture`, `locale`, `zoneinfo`,
`roles` (from a trusted app's `roles` claim), and `amr` once core sends it (core-app §3.6.2).

## 10. Tables and migrations

- The package ships the schema of better-auth's tables as it uses them (`users`, `sessions`, `accounts`, `verifications`,
  `rate_limits`, `two_factors`, `passkeys`) for each dialect, under the names core uses.
- **An app** runs the package's migrations at start-up with `@sovereignfs/database`'s `migrate(…, { table })`, recorded apart from its
  own, as the SDK's vault is.
- **Core** keeps its own migration history: its `users` table has columns no app has, and a migration that changes refuses to boot. A
  test holds core's tables to the package's schema, so the two cannot drift.
- An app that kept better-auth's tables before moves onto the package's migrations with one of its own that checks the tables are what
  the package expects and records them as done; it never changes data.

## 11. better-auth

- The package depends on **one exact version** of better-auth and of each of its plugins, never a range, and an app MUST NOT install
  another. The package refuses to start when it finds a second copy.
- A new version is taken in a release of the package, verified against populated stores of the versions before it (fixtures of a store
  made by each), never only a fresh one.

## 12. What it never does

- Receive, store or log a password, a token or a person's data in a log line.
- Hold or refresh core's refresh token.
- Match an account by email.
- Offer "trust this device", a session that skips the second step, or a fresh-session requirement.
- Store anything of a person in the browser beyond the session cookie and what the key store keeps.
- Decide anything of core's: roles, invitations, the lock, consent, what an app may ask core for.

## Changelog

| Date          | Change                           |
| ------------- | -------------------------------- |
| November 2026 | Draft, from RFC 0007 (task 17.1) |
