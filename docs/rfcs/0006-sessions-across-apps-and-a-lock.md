# RFC 0006 — Sessions across apps, and a lock

|              |                                                                                                                                                                                               |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Status**   | Part A accepted and implemented (2026-11-19); part B waits for the device check (task 4.15)                                                                                                   |
| **Date**     | November 2026                                                                                                                                                                                 |
| **Author**   | Claude Code, for review                                                                                                                                                                       |
| **Scope**    | `docs/specs/core-app.md` §3.5, §5.4; `docs/specs/sdk.md` §9; `@sovereignfs/sdk`; the app template; `apps/core` sessions, the key store and a lock page                                        |
| **Research** | [0011](../research/0011-streamlining-sign-in.md), [0012](../research/0012-biometric-lock.md)                                                                                                  |
| **Tasks**    | [4.16](../epics/identity-auth.md) (this RFC), [4.17](../epics/identity-auth.md), [16.24](../epics/encryption.md), [14.14](../epics/sdk.md); [workstream 0007](../workstreams/0007-sign-in.md) |

## Summary

**Part A, sessions across apps.** An app's session follows core's:

1. Core's own session lifetime is set in core's configuration, not left to better-auth's default: seven days without use, extended once
   a day while in use, as it is today.
2. An app's session is checked against core at most an hour after its last check: the SDK sends the person through core with
   `prompt=none`, which comes straight back with a new ID token when core's session is alive and with `login_required` when it is not.
   The person sees nothing in the first case and signs in in the second.
3. The new ID token replaces the session's claims, so a name, an address or a role changed at core reaches every app within the hour.
4. A refresh token obtained with `offline_access` still outlives core's session, as §3.6.3 says: it is what lets an app act for a person
   who is not there. Logout notices (6.4) and this hourly check are what end an app's sessions.

**Part B, a lock** (to be completed from the device check). On a device where the person turned it on, core locks its session after an
idle time or when the app leaves the screen, answers every request with a lock page until a passkey with user verification or the
password unlocks it, and closes the person's keys while locked; an app locks through core with `max_age`.

## Motivation

Research 0011 found that core and its apps disagree about when someone is signed in. Core's session lasts seven days without use; an
app's lasts thirty days, fixed, and is never checked against core. A core session that simply expires sends no notice, so every app stays
signed in; a role changed in the Console reaches an app only when the person next signs in to it. Logout notices now arrive (6.4), but they
cover a session that is _ended_, not one that _expires_, and an app that is down for a day still misses one.

Research 0012 found that people expect an installed core and its apps to ask for Face ID, Touch ID or a fingerprint when they come back,
and that a web app can do so only through a passkey, after a tap, and only protects the person's data if the session itself is locked and
their keys closed with it.

## Current state

- Core: better-auth's defaults, `expiresIn` 604 800 s (seven days) and `updateAge` 86 400 s (a day), not set in `apps/core/src/auth/auth.ts`.
- SDK (2.7.0): a session record with `expiresAt` thirty days after sign-in (`sessionSeconds`), `authTime` from the ID token, and claims
  copied at sign-in. `getSession` makes no call to core. `beginSignIn({ prompt, maxAgeSeconds })` exists; `prompt: 'none'` fails the
  callback with `SignInError` when the person would have had to sign in.
- Logout notices are kept and sent again for a day (core-app §3.6.5); when core refuses a person's renewal the SDK ends their sessions in
  the app (sdk §9.1).
- Keys stay unlocked until the session ends (core-app §5.4); a passkey with PRF can reopen them (§5.5).

## Part A: design

### A1. Core's session lifetime is core's

`session.expiresIn` and `session.updateAge` are set in core's better-auth configuration from two values in core's settings: seven days and
one day, today's behaviour. They are not environment variables in this RFC: an instance that needs others is a question for later, and a
default that can be read in the spec is what apps plan against (sdk §9).

### A2. An app's session is checked against core hourly

The SDK gains one setting, `checkEverySeconds` (default 3600 in the template; see A5 for the package's default):

- A session record gains `checkedAt`, set at sign-in and at each check.
- `nextAuth`'s `requireSession`, on a page navigation, when `now - checkedAt > checkEverySeconds`, sends the person
  to `/auth/login?prompt=none&returnTo=<this page>`. Core answers with no page when its session is alive: the callback replaces the app's
  session (A3) and returns to the page. Four redirects, no screen.
- When core answers `login_required` (its session is over), the callback ends the app's session and sends the person to sign in the usual
  way, to the same page. A `prompt=none` callback that fails for any other reason is treated the same.
- `getSession` stays a read of the app's own store, with no call to core: server actions and API routes use the session as it is, for up to
  the check interval. The check happens on the next page the person opens.
- A check renews the app's session **in place**: the same id and cookie, and the same key secret, so what the browser keeps for an
  encrypted app still opens (sdk §9.3); a new `checkedAt` and `expiresAt`, as a sign-in gives. A different person signing in on the same
  browser gets a session of their own, and the first person's ends.

**Why a redirect, not a call.** Only the browser holds core's session cookie; core will not tell an app's server whether a person is
signed in without it. A redirect with `prompt=none` is the standard way (OpenID Connect Core §3.1.2.1) and costs nothing the person sees.

**Why not refresh tokens.** A refresh with `offline_access` succeeds whether or not core's session is alive, by design; refusing it when
the session is over would break the app tokens people rely on to be acted for while away. The check is about the browser's session, so it
goes through the browser.

### A3. Claims are refreshed with the check

The callback of a check writes the new ID token's claims over the session's: `name`, `email`, `picture`, `roles`, `authTime`. A role taken
away in the Console stops counting in an app within the interval.

### A4. What stays

Logout notices (6.4) still end an app's sessions at once when core's session is ended. The hourly check covers what they cannot: a core
session that expired, and a notice an app missed. `offline_access` refresh tokens are unchanged.

### A5. SDK contract and versions

- `checkEverySeconds` is added in a minor version, **off when not set**, so an app that upgrades is not changed by it. The template sets
  it to 3600, and the guide says why. A later major version may turn it on by default, with an upgrade note.
- `SignInError` gains a `reason` of `login_required` for a `prompt=none` callback that core refused, so an app can tell "signed out at
  core" from "something went wrong".
- The fake core answers `prompt=none` with `login_required` when told the person has no core session.

## Part B: a lock (outline; completed after task 4.15)

What research 0012 settled, kept here so the device results can be judged against it:

- **Only a passkey with user verification reaches the biometric**, after a tap on a lock page. What a prompt without a tap does, whether a
  passkey can be made in an installed app, PRF support, and how long a background app is kept are what 4.15 measures.
- **A locked session in core.** A session gains `lockedAt`. Core sets it after the person's idle time on this device, or when the page tells
  it the app left the screen; every request of a locked session gets the lock page and nothing of the person. A server-checked passkey
  assertion with user verification, or the password through `confirmPassword`, clears it.
- **Keys closed while locked** (16.24): the key store drops the unwrapped account key on locking; unlocking reopens it from the passkey's
  PRF output, or from the password.
- **Per device**, set on the Security page, with the password always a way to unlock.
- **Apps lock through core**: an app's own lock sends the person to core with `max_age` (sdk §9.6); core asks for the passkey.

To be decided with the device results: whether an operator may require the lock on an instance, the default idle time, whether "lock when
the app leaves the screen" is offered on a desktop, and whether turning the lock on requires a passkey first.

## Alternatives considered

- **Shorter app sessions with no renewal.** Simple, but the person signs in again every hour in every app.
- **Core refusing refresh once its session is over.** Ties apps to core's session for apps that refresh, but breaks acting for a person who
  is away, which `offline_access` exists for.
- **A front-channel iframe check.** Core's session cookie is `SameSite=Lax`, which a browser does not send to a frame on another
  site, and Safari blocks third-party cookies besides; the check would see no session.
- **Polling core from the app's server.** Core cannot know the browser without its cookie.

## Rollout

| Order | Task  | What                                                  |
| ----- | ----- | ----------------------------------------------------- |
| 1     | 4.15  | The device check, run; research 0012's table filled   |
| 2     | 4.16  | This RFC accepted, part B completed                   |
| 3     | 14.14 | A2, A3, A5 in the SDK, the fake core and the template |
| 4     | 4.17  | A1, and part B's locked session and lock page in core |
| 5     | 16.24 | Keys closed while locked                              |

Part A does not wait for part B: 14.14 can be built once part A is accepted.

## Open questions

1. ~~Is one hour the right interval?~~ Decided (2026-11-19): one hour, set by each app; the template sets it.
2. ~~Should core's session lifetime be an operator's setting?~~ Decided (2026-11-19): no, it stays fixed in core, so apps have one
   lifetime to plan against.
3. Part B's four questions above, after the device check.
