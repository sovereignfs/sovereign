# RFC 0006 — Sessions across apps, and a lock

|              |                                                                                                                                                                                               |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Status**   | Partially implemented (part B tried in an installed iPhone app with its release, B7; the app's side of B6, 14.14, to come)                                                                    |
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

**Part B, a lock.** A person who wants one turns it on for a device, once signed in, with a passkey on that device. Core then locks the
session after 15 minutes idle (or the time they chose), or when they leave the app if they asked; a locked session gets the lock page and
nothing of the person until a passkey or the password unlocks it, and its keys stay closed. Apps lock through core.

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

## Part B: a lock

Decided with the goal owner on 2026-11-19, from the device check (research 0012, "What the devices showed").

### B1. Opt-in, per device, after signing in

Signing in does not change: email and password, a passkey, and the second step when it is on. The lock is something a person turns on for
themselves, on the Security page, for opening core on **this device** from then on. An operator cannot require it.

- **It needs a passkey on this device.** Turning it on runs a passkey ceremony, checked by the server (user verified, one of the account's
  own passkeys, a challenge given to this session). With none, the page asks the person to add one first (the existing flow, §3.4.2).
- **The device is the browser.** A long-lived, host-only cookie (`__Host-sv_device`, a random id) names it, and a table keyed by the account
  and that id (`device_locks`) holds the setting. A new session in the same browser, for the same account, takes the setting up; another
  account in that browser has none.
- **The settings:** the idle time, **15 minutes** by default, from 1, 5, 15 or 60; and **"Also lock when I leave the app"**, off by default
  and offered on every device once the lock is on. Turning the lock off needs the session unlocked, and nothing more.

### B2. When a session locks

A session gains `locked_at` and `last_active_at`.

- **Idle.** `last_active_at` is updated by a request of the session at most each half minute. A session whose device has a lock and whose
  last activity is older than the idle time is locked by the next request, before it is answered. The page also keeps a timer and shows
  the lock page when the time passes, so a screen left open does not go on showing the person's data; the server's check is the one that
  counts.
- **Leaving the app.** With "Also lock when I leave the app", the page sends a beacon when it is hidden (`visibilitychange`), and the
  server locks the session. iOS may end a Home Screen app in the background without a word; the stored times decide on the next request,
  never memory.

### B3. What a locked session is given

Nothing of the person, from anywhere:

- **Pages.** `requireSignedIn` (and `requireConsole`, `sessionFor`) sends a locked session to `/lock?returnTo=…`, and only the lock page
  and signing out are open to it.
- **Routes and server actions.** `requireSession` and `requireCapability` treat a locked session as none.
- **better-auth's own routes.** Every one but signing out and signing in afresh refuses a locked session, `get-session` included.
  Signing in afresh asks for everything signing in asks for, and gives a new session.
- **Apps.** The authorization endpoint sends a locked session to the lock page with the app's request as `returnTo`, so an app's sign-in
  or its hourly check (part A) waits for the unlock, `prompt=none` included: the check redirects through the browser anyway, so the
  person unlocks and the app carries on, where `login_required` would have sent them to sign in again.
- **The session, not the cookie.** A session is put under a device's lock the first time it is seen with that device's cookie, and the
  lock follows the session from then on, so dropping the cookie, or taking the session's token to another browser, does not escape it.

### B4. Unlocking

The lock page shows whose session it is, an **Unlock** button and **Use your password**, and **Sign out**.

- **Unlock** runs a passkey ceremony after the tap, checked by the server against the locked session itself, with a challenge given to
  it: user verified, one of the account's own passkeys. It opens no new session: a passkey sign-in would, and would end the locked one,
  and every app's session with it (§3.6.5). The page never
  depends on a prompt appearing without a tap, which the device check found possible but not dependable; asking on its own as the page
  opens may be added where a platform allows it.
- **Use your password** goes through `confirmPassword`, counted with every other time it is asked (§3.2.1).
- Either clears `locked_at` on the same session and sends the person on to `returnTo`. A session that cannot be unlocked can always sign
  out.

### B5. Keys closed while locked

The browser keeps the account key wrapped by a key from the session's secret, which the server gives only to a live session (§5.4). A
locked session is refused that secret, so what the browser kept cannot be opened while it is locked. Unlocking with a passkey reopens the
key from its PRF output (§5.5); a passkey that gives none, or the password, reopens it from the password's secret, as signing in does. The
device check found a passkey that gave no PRF output, so the fallback is needed, not only kept.

### B6. Apps

An app gets the lock through core: its hourly check (part A) and any sign-in go through the authorization endpoint, which a locked session
cannot pass (B3). An app that wants the person to prove themselves again before something sensitive asks for a recent sign-in, `requireSession(returnTo,
{ maxAgeSeconds })` (sdk §9.6). As built, unlocking does not count as one: `max_age` is held to the time the session signed in, which an
unlock leaves as it was, so such a request asks for a fresh sign-in. Whether an unlock should count, and how an app shows that it asked
for one, is the app's side of this part (14.14), still to come. Related origins, letting an app use core's passkey without the redirect,
stay for later.

### B7. What is confirmed with the release

The device check saw the lock's path work in a desktop browser and in Safari on an iPhone. An installed app on iOS and Android were not
seen. Nothing in B1 to B6 depends on them: the Unlock button, the password and the stored times work whatever they show. The release that
builds the lock is tried in an installed app on an iPhone before it is called done, and on Android when a device is at hand. If an
installed app cannot use passkeys there, people unlock with the password on it.

## Alternatives considered

- **Shorter app sessions with no renewal.** Simple, but the person signs in again every hour in every app.
- **Core refusing refresh once its session is over.** Ties apps to core's session for apps that refresh, but breaks acting for a person who
  is away, which `offline_access` exists for.
- **A front-channel iframe check.** Core's session cookie is `SameSite=Lax`, which a browser does not send to a frame on another
  site, and Safari blocks third-party cookies besides; the check would see no session.
- **Polling core from the app's server.** Core cannot know the browser without its cookie.

## Rollout

| Order | Task  | What                                                                                         | State                                      |
| ----- | ----- | -------------------------------------------------------------------------------------------- | ------------------------------------------ |
| 1     | 4.15  | The device check, run; research 0012's table filled                                          | Done: desktop and iPhone in a browser (B7) |
| 2     | 4.16  | This RFC accepted, part B decided                                                            | Done                                       |
| 3     | 14.14 | A2, A3, A5 in the SDK, the fake core and the template; B6 documented                         | A done; the app's side of B6 to come       |
| 4     | 4.17  | A1; B1 to B4 in core: the device setting, locking, what a locked session gets, the lock page | Done; B7 with the release                  |
| 5     | 16.24 | B5: keys closed while locked                                                                 | Done, with 4.17                            |

Part A did not wait for part B. Part B is built in one release, tried in an installed app on an iPhone before it is called done (B7).

## Open questions

1. ~~Is one hour the right interval?~~ Decided (2026-11-19): one hour, set by each app; the template sets it.
2. ~~Should core's session lifetime be an operator's setting?~~ Decided (2026-11-19): no, it stays fixed in core, so apps have one
   lifetime to plan against.
3. ~~Part B's four questions.~~ Decided (2026-11-19): no operator requirement, the lock is the person's own choice once signed in (B1);
   15 minutes by default (B1); "lock when I leave the app" offered on every device once the lock is on (B1); a passkey on the device
   first (B1).
