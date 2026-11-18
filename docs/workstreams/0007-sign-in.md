# Workstream 0007 — Signing in keeps its place, and installed apps can lock

**Status:** ⏳ In Progress\
**Date:** November 2026\
**Author:** Claude Code\
**Goal owner:** kasunben\
**Governs:** [epic 4](../epics/identity-auth.md) (4.8 to 4.17), [epic 6](../epics/oidc-provider.md) (6.4), [epic 14](../epics/sdk.md) (14.12
to 14.14), [epic 16](../epics/encryption.md) (16.24); RFC 0006, to be written in leg 4\
**Research:** [0011](../research/0011-streamlining-sign-in.md), [0012](../research/0012-biometric-lock.md)

---

## Goal

Someone who arrives at core from an app, creates an account, verifies it or resets a password ends where they were going. An invited
person verifies their address once. Core's pages guard themselves one way, and a sign-out that fails says so. An app stops acting for
someone whose session at core has ended, and can ask core for a fresh sign-in. On a phone, an installed core and its apps can lock and
ask for Face ID, Touch ID or a fingerprint (through a passkey) when they are opened again, with the person's encrypted data closed
while they are locked.

## Definition of done

- [ ] 4.8 to 4.13 merged: no path through core's sign-in pages drops an app's request, and the guard and the leftovers are done
- [ ] 4.14, 14.12, 14.13 and 6.4 merged: one way to ask for the password again; `max_age` and `auth_time` in the SDK; logout reaches
      every app and ends what the app holds
- [ ] Research 0012's table filled from devices (4.15)
- [ ] RFC 0006 accepted (4.16)
- [ ] Core's lock, keys closed while locked, and apps' sessions that follow core's (4.17, 16.24, 14.14) merged
- [ ] Workstream status ✅; epics 4 and 6 ✅

## Decisions locked

| Decision                                 | Choice                                                                          | Rejected alternative and why                                                                                                    |
| ---------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Carrying an app's request through emails | The app's own authorization request, rebuilt from the signed one, as `returnTo` | The signed request itself: it lasts ten minutes; server-side state: more to clear, and the provider checks the request anyway   |
| Which invitations verify an address      | Only one core emailed to that address, presented by its id                      | Any invitation for the address: knowing an address would be enough; a link passed on by hand: it says nothing about the mailbox |
| How a web app reaches Face ID and alike  | A passkey with user verification, after a tap on the lock page                  | A prompt with no tap: neither platform can be relied on to show it                                                              |
| What a lock protects                     | A locked session in core, and keys closed while locked                          | A curtain over the page: the data is already in the browser; it promises more than it gives                                     |
| How an app locks                         | Through core, with OpenID Connect `max_age`                                     | Related origins: one more list core keeps, later if the redirect is the friction; a passkey per app: one passkey per app        |
| Where the lock setting lives             | Per device, with the password always a way to unlock                            | Account-wide only: a lock right for a phone is a nuisance on a desktop                                                          |
| Order                                    | The device spike (4.15) before the RFC (4.16)                                   | An RFC from documentation: the platforms' gesture rules and PRF support disagree between sources                                |

## Prerequisites

- Research 0011 and 0012 read by the goal owner: done (November 2026).
- For leg 3, a person with an iPhone (iOS 18.4 and 26), an iPad and an Android phone, and core on an https host.

## Legs

| Leg | Name                                  | Epic tasks                       | Gate? | Done when                                                                |
| --- | ------------------------------------- | -------------------------------- | ----- | ------------------------------------------------------------------------ |
| 1   | Sign-in keeps its place               | 4.8, 4.9, 4.10, 4.11, 4.12, 4.13 | Yes   | Merged into `develop`; platform and core bumped once                     |
| 2   | Apps keep up with core's sessions     | 4.14, 14.12, 14.13, 6.4          | Yes   | Merged; the SDK released with `max_age`                                  |
| 3   | A lock on the devices                 | 4.15                             | Yes   | Research 0012's table filled from devices                                |
| 4   | The specification                     | 4.16                             | Yes   | RFC 0006 accepted                                                        |
| 5   | Locks and sessions that follow core's | 4.17, 16.24, 14.14               | Yes   | Core locks on a phone, keys close with it, and an app locks through core |

One leg is one branch, one draft PR, one review gate ([README](README.md#legs)). Leg 3 needs devices, not code, and can run beside
leg 2.

## Leg detail

### Leg 1 — Sign-in keeps its place

**Epic tasks:** 4.8, 4.9, 4.10, 4.11, 4.12, 4.13

**Why here:** each is a defect a person meets today, with an answer that needs no new design. The first four were built on the branch
that also carries research 0011 and 0012.

**Technical notes:** the resume address is `resumeAddress` in `apps/core/src/oauth/signed-query.ts`, used through `signInReturnTo`
and `withReturnTo` (`apps/core/src/auth/return-to.ts`). Pages guard themselves with `getSession` and `redirect`; 4.12's guard
replaces them, and a test should list the pages that need it, as `requireConsole` has. `sessionCacheCookieNames`
(`apps/core/src/auth/cookies.ts`) may still clear cookies browsers kept from before the cache was turned off: check before removing.

**Do not proceed if:** a page's behaviour would change beyond the guard's wording, or the verification link would need to carry
anything but `returnTo`.

### Leg 2 — Apps keep up with core's sessions

**Epic tasks:** 4.14, 14.12, 14.13, 6.4

**Why here:** 14.12 is what leg 5 builds the app lock on, and 14.13 and 6.4 close the gaps that leave an app signed in after core has
ended the session.

**Technical notes:** the SDK's sign-in is `packages/sdk/src/auth.ts`; tokens are per `sub` (`tokens.ts`), so 14.13 deletes the refresh
token only with the person's last session in the app. The two senders of logout tokens are the provider plugin's session-delete hook
and `apps/core/src/oauth/logout.ts`. A published package changes: its version, changelog and `docs/upgrade.md` if anything breaks.

**Do not proceed if:** retrying notices (6.4) would need a worker process the image does not have; say so in the spec first.

### Leg 3 — A lock on the devices

**Epic tasks:** 4.15

**Why here:** every platform statement in research 0012 is from documentation, and the sources disagree on the user-gesture rule and
on PRF. The RFC is written from what is seen.

**Do not proceed if:** neither platform can make a passkey inside an installed app; stop the lock and keep legs 1 and 2.

### Leg 4 — The specification

**Epic tasks:** 4.16

**Why here:** the lock and the app sessions that follow core's change core's sessions, the key store and the SDK's contract together.

**Do not proceed if:** the RFC would need core to know a particular app, or a passkey to be shared through a parent domain (RFC 0002).

### Leg 5 — Locks and sessions that follow core's

**Epic tasks:** 4.17, 16.24, 14.14

**Technical notes:** the key store is `apps/core/src/keys/session.ts` (§5.4); a lock drops the unwrapped key, and unlocking reopens it
through `afterPasskeyAccepted` or the password's secret. The SDK's renewal sends `prompt=none` and treats `login_required` as signed
out.

**Do not proceed if:** a locked browser would still receive a page with the person's data.

## Risks

- The SDK's pending sign-in lasts ten minutes, so an app's sign-in resumed after a slow email round trip is refused by the app; leg 2
  may lengthen it or say so.
- iOS ends Home Screen apps in the background often; the lock must decide from a stored time, never from memory alone.
- A person with no passkey that verifies must never be locked out: the password always unlocks.

## Kill criteria

If leg 3 shows that installed apps cannot use passkeys on either platform, the lock (legs 4 and 5, apart from 14.14's session
renewal) stops; legs 1 and 2 stand on their own.

## Changelog

| Version | Date       | Change                                                                                                                                                                                                                                                             |
| ------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 0.1     | 2026-11-18 | Initial draft                                                                                                                                                                                                                                                      |
| 0.2     | 2026-11-18 | Legs 1 and 2 run on one branch, at the goal owner's request. 14.13's atomic `jti` mark is left out (it would need a new required method on every app's session store). 6.4 built as found: the standard allows a retry only after a failure that may be temporary. |
| 0.3     | 2026-11-19 | The rest of the workstream (legs 3 to 5, with the documentation fixes and the logout-plan fix found on the way) runs on one branch, `feat/sign-in-workstream`, at the goal owner's request.                                                                        |
