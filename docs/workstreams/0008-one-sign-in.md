# Workstream 0008 — One sign-in for core and every app

**Status:** ⏳ In Progress\
**Date:** November 2026\
**Author:** Claude Code\
**Goal owner:** kasunben\
**Governs:** [RFC 0007](../rfcs/0007-one-sign-in.md); [epic 17](../epics/one-sign-in.md) (17.1 to 17.5), [epic 2](../epics/design-system.md)
(2.6, 2.7), [epic 6](../epics/oidc-provider.md) (6.5, 6.6), [epic 13](../epics/operator-cli.md) (13.35), [epic 14](../epics/sdk.md) (14.15, 14.16)\
**Research:** [0004](../research/0004-a-kit-for-apps-of-their-own.md)

---

## Goal

Core and every Sovereign app sign people in with one published package, `@sovereignfs/auth`, made from core's own sign-in. An app runs
on its own with accounts of its own, through an instance's core, or both, from its environment alone, with the same rules core holds:
the sign-in value, no fresh session, user-verified passkeys, one owner for core's refresh token. Its sign-in and security pages are the
design system's. Signing out of a hosted app signs the person out of the suite; signing out of an external app does not. A new app
starts this way from the template, and the SDK's own sign-in is deprecated.

## Definition of done

- [x] RFC 0007 accepted and `docs/specs/auth.md` written (17.1)
- [x] Core's sign-in made from the package (17.2, 17.3, 2.6, 17.4); two looks changed to the design system's, recorded in 2.6
- [x] The account panels that remain (2.7)
- [ ] Signing out and `amr` at core (6.5, 6.6)
- [x] The SDK signs in for a session the app keeps (14.16)
- [x] A fixture app signs in through core, locally, and both; the template makes such an app (17.5, 13.35); PostgreSQL only, the other two
      database forms are 13.36, after the workstream
- [x] A typed `user`, and `nextAuth` deprecated (14.15)
- [ ] `@sovereignfs/auth` published; workstream status ✅; epic 17 ✅

Tusk and Fjord moving onto the package is work in their own repositories, after 13.35, and not part of this workstream.

## Decisions locked

| Decision                                 | Choice                                                                                       | Rejected alternative and why                                                                                           |
| ---------------------------------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Where the shared sign-in comes from      | Core's, moved into a package core uses too                                                   | Tusk's and Fjord's: core would keep a second copy, and core's is the one that holds the hard rules                     |
| A hosted app's session                   | One session layer (better-auth) in every app, core one way in                                | `nextAuth` for hosted apps and the package for the rest: two sign-ins to keep                                          |
| How pages reach an app                   | Components in `@sovereignfs/ui`, actions in the package, thin pages from the template        | Whole pages from the package: hard to change; pages copied by the template: fixes copied by hand into every app        |
| Core as a way in                         | A better-auth plugin on the SDK, which alone holds core's refresh token                      | better-auth's `genericOAuth`: it stores and refreshes the token itself, and core takes a token used twice for theft    |
| Signing out of an app that came via core | Hosted app: out of core too; external app: the app only; held by core, a setting on each app | Left to each app: any app with end-session can end core's session today, and an off-the-shelf client cannot be changed |
| `nextAuth`                               | Deprecated once the template moves off it; removed in a later major version of the SDK       | Kept for hosted-only apps: they use the package with local accounts off                                                |
| Core's migrations                        | Core keeps its history; the package ships a set for apps, and a test holds the two together  | A baseline handover in core: a changed migration refuses to boot, and core's `users` has columns no app has            |
| The package's license                    | MPL-2.0, like `ui` and `sdk`                                                                 | AGPL, like `tools/`: the package is a library apps link                                                                |

## Prerequisites

- Core's lock (4.17's code) on the branch the work is built on: the lock is one of core's additions on top of the package, and 17.2
  and 17.3 move the code it touches. At the goal owner's request the whole workstream runs on one branch, `feat/one-sign-in`, stacked
  on the lock's (`feat/device-lock`), with each leg still a review gate; the lock's branch is merged first. Owner: kasunben.
- RFC 0007 read by the goal owner before leg 1 ends.

## Legs

| Leg | Name                        | Epic tasks              | Gate? | Done when                                                                                      |
| --- | --------------------------- | ----------------------- | ----- | ---------------------------------------------------------------------------------------------- |
| 1   | The specification           | 17.1                    | Yes   | RFC 0007 accepted; `docs/specs/auth.md` and the core-app sections merged                       |
| 2   | Core's sign-in in a package | 17.2, 17.3              | Yes   | Merged; `pnpm e2e`, `pnpm test:db` and the populated stores pass unchanged                     |
| 3   | The pages from the package  | 2.6, 17.4               | Yes   | Merged; core's pages thin, on the design system's components, `pnpm e2e` unchanged             |
| 4   | Core's side of the contract | 6.5, 6.6                | Yes   | Merged; hosted and external sign-out differ as decided; 6.6's discovery fix (its `amr` parked) |
| 5   | Apps sign in with it        | 2.7, 14.16, 17.5, 13.35 | Yes   | A fixture app and a scaffold sign in through core, locally, and both                           |
| 6   | The SDK follows             | 14.15                   | Yes   | The SDK released with a typed `user` and `nextAuth` deprecated; the package published          |

One leg is one branch, one draft PR, one review gate ([README](README.md#legs)). Leg 4 needs only leg 1, and can run beside legs 2
and 3.

## Leg detail

### Leg 1 — The specification

**Epic tasks:** 17.1

**Why here:** the package becomes a published contract, and the per-app sign-out setting and `amr` change core's spec; both are written
before any code moves.

**Do not proceed if:** a rule core's sign-in holds today has no home in the spec.

### Leg 2 — Core's sign-in in a package

**Epic tasks:** 17.2, 17.3

**Why here:** the extraction changes nothing anyone sees, so it is proven by core's existing tests before anything new is built on it.

**Technical notes:** the split of `apps/core/src/auth/auth.ts` is RFC 0007's "Current state" table. `resolveAuthSettings`
(`src/auth/settings.ts`) already takes a prefix. The package's migrations use `@sovereignfs/database`'s `migrate(…, { table })`, as
the SDK's vault does (`vaultMigrations`). The guard tests that scan `apps/core` (`requireCapability`, `requireSameOrigin`,
`server-auth-calls.test.ts`) must scan `packages/auth` in the same change, or the rules stop being held. The `auth-store` fixtures in
`apps/core/src/__tests__/fixtures/` move with the better-auth setup.

**Do not proceed if:** a test of core's has to change what it expects, other than an import path; that is a change in behaviour.

### Leg 3 — The pages from the package

**Epic tasks:** 2.6, 17.4

**Why here:** the components and the actions are built together, since each component's props are an action's answer.

**Technical notes:** core's forms call its key store directly (`src/keys/session.ts`: `afterPasswordAccepted`, `afterPasskeyAccepted`,
`afterSecondStep`, `before/afterPasswordChange`); these become the pluggable hooks. `packages/ui` already has `AuthShell`, `AuthCard`,
`AuthField`, `AuthCodeInput`, `AuthNotice` and `UserMenu`; core has its own copies to remove. Every new component gets a story and a
Gallery entry (`sv-ui-design`).

**Do not proceed if:** a component would need `next/*`, or core's pages would look or behave differently.

### Leg 4 — Core's side of the contract

**Epic tasks:** 6.5, 6.6

**Technical notes:** end-session is turned on by itself for an app with a post-logout or back-channel address
(`apps/core/src/clients/registry.ts`); the new setting is separate, so an external app keeps its `sid` and its notices. `sv apply`
registers apps through `src/admin/run.ts` (`inputOf`).

**Do not proceed if:** turning the setting off for an external app would stop its logout notices.

### Leg 5 — Apps sign in with it

**Epic tasks:** 2.7, 14.16, 17.5, 13.35

**Why here:** `./core` needs the SDK's sign-in without an SDK session first (14.16, sdk §9.8); 14.16 needs only leg 1 and may be
built earlier, beside leg 4.

**Technical notes:** Tusk's `src/auth/auth.ts` is the working "local and/or core" setup to read for account linking
(`disableImplicitLinking`, `allowDifferentEmails: false`) and for a core-only account's missing password, but not for core's token,
which it leaves to `genericOAuth`. The SDK's sign-in, renewal and notices are `packages/sdk/src/auth.ts` and `tokens.ts`.

**Do not proceed if:** better-auth would hold or refresh core's refresh token anywhere.

### Leg 6 — The SDK follows

**Epic tasks:** 14.15

**Technical notes:** the SDK and the package are published contracts: version and changelog in the same commit, a `docs/upgrade.md`
note for the deprecation.

**Do not proceed if:** deprecating would break an app on `nextAuth` today.

## Risks

- The package's schema and core's tables can drift; the test that holds them together is the only guard (17.2).
- better-auth pinned in a published package: an app that installs another version gets two copies; the start-up refusal is what
  catches it.
- Core's guard tests scan paths; code that moves out of `apps/core` leaves them silently unless they move with it.
- The extraction touches the hard rules' code paths (the sign-in value, the lock, the second step): `sv-security-check` on legs 2, 3
  and 5.

## Kill criteria

If leg 2 cannot move core's sign-in without a change anyone can see, the workstream stops there and the package is not published.
Leg 1's spec and leg 4's sign-out setting and `amr` stand on their own.

## Changelog

| Version | Date       | Change                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0.1     | 2026-11-19 | Initial draft                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 0.2     | 2026-11-19 | One branch for the whole workstream, `feat/one-sign-in`, stacked on the lock's, at the goal owner's request. 14.16 added to leg 5: the SDK's sign-in without an SDK session, which `./core` is built on (found writing the specification).                                                                                                                                                                                             |
| 0.3     | 2026-11-19 | Leg 1 done: RFC 0007 accepted, `docs/specs/auth.md` written, 17.1 ✅.                                                                                                                                                                                                                                                                                                                                                                  |
| 0.4     | 2026-11-19 | Leg 2 done: core's sign-in runs on `@sovereignfs/auth` (17.2, 17.3 ✅), platform 0.117.0, core 0.78.0. Legs run on without a stop between them, at the goal owner's request, committed locally.                                                                                                                                                                                                                                        |
| 0.5     | 2026-11-19 | Leg 3 done: the sign-in forms and two account panels are the design system's (2.6), their flows the package's (17.4), platform 0.118.0. Changed for people, to the design system's way: the card's padding breakpoint (768px, not 400px) and code boxes that select on focus. The passkey, second-step setup and profile panels and the account menu moved to a new task, 2.7, in leg 4. Server actions stay the app's (auth.md §7.1). |
| 0.6     | 2026-11-19 | Leg 4 done: signing out follows whose app it is (6.5), platform 0.119.0, toolkit 0.20.0. 6.6 parked: better-auth's provider owns `amr` and `acr`; only its discovery fix is built. 2.7 moves to leg 5, ahead of the template that needs it.                                                                                                                                                                                            |
| 0.7     | 2026-11-20 | Leg 5 under way: 2.7, 14.16 and 17.5 built. Making `@sovereignfs/auth` publishable moves ahead of 13.35, from leg 6, since an app made from the template must be able to install it.                                                                                                                                                                                                                                                   |
| 0.8     | 2026-11-20 | Leg 5 done: the template signs in with the package (13.35), PostgreSQL only; sqld and SQLite are 13.36, outside the workstream. An app made with `--encryption` keeps `nextAuth`. Platform 0.120.0, core 0.80.1, toolkit 0.21.0.                                                                                                                                                                                                       |
| 0.9     | 2026-11-20 | Leg 6 done: a typed `User` in the SDK and the package (14.15), `nextAuth` deprecated. Platform 0.121.0, SDK 2.10.0, sign-in package 0.4.0, toolkit 0.22.0. Left: publishing the package, and 6.6 (parked).                                                                                                                                                                                                                             |
