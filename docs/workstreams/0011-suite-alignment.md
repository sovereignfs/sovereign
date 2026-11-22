# Workstream 0011 — The apps on the suite's design

**Status:** 📋 Planned\
**Date:** November 2026\
**Author:** Claude Code\
**Goal owner:** kasunben\
**Governs:** [epic 20](../epics/suite-alignment.md) (20.1 to 20.16); [11.15](../epics/pwa.md), carried out by 20.8 to 20.13; [13.36](../epics/operator-cli.md)
as a prerequisite of leg 4\
**Research:** [0014](../research/0014-suite-alignment.md)

---

## Goal

Every app in development is built the way an app made from the template today is: on the current packages and manifest 5, answering
core's export, installing from `@sovereignfs/pwa`, and signing in with `@sovereignfs/auth`, so that no app keeps a sign-in or a worker
of its own and none sends a password to its server. Core closes what stops them first, so each app moves once, onto a finished
package, without its people having to start again.

## Definition of done

- [ ] The contracts and the guide name what the template uses (20.1)
- [ ] Ledger, Tally, Tusk, Wallet, Waymark and Fjord Web are on the current packages, manifest 5, core's export and the shared worker;
      11.15 is ✅
- [ ] RFC 0007's amendment is accepted and built: existing accounts move, the key secret is the package's, a person's core `sub` comes
      from the package; the template has one design
- [ ] Shopper, then the six, sign in with `@sovereignfs/auth`; a released version's database of each signs in after the move, on each
      database
- [ ] Foundry, Loom and PaperTrail's designs name the packages
- [ ] Research 0014 says Decided; epic 20 is ✅

## Decisions locked

| Decision                       | Choice                                                                                                                  | Rejected alternative and why                                                                                                          |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Where it is tracked            | One workstream and epic here; each app keeps its own task notes                                                         | Only in each app: core's half is then requests nobody owns, as Shopper's epic 16 is today                                             |
| The order                      | Everything but sign-in in every app, while core closes the package's gaps; then sign-in, Shopper first                  | Sign-in first: blocked on a decision and three builds, it would hold back everything else                                             |
| How a change reaches `develop` | **Committed directly on `develop`** in this repository and in each app's, as the goal owner chose; one task, one commit | A feature branch and pull request per task: the owner asked for direct commits; the gates below are where they review                 |
| What an app task is            | One commit in the app's repository, with its version and changelog; its own task notes updated in the same commit       | A branch here per app: an app's code is not in this repository                                                                        |
| Sign-in in the six apps now    | Left as it is until leg 4                                                                                               | Fixing the password, `genericOAuth` and the session check in place: each is replaced by the package, so the work would be thrown away |
| Push                           | Stays workstream 0010's (19.7); it may land in the same commit as 20.10 or 20.12                                        | Taking 19.7 in: two workstreams would own one task                                                                                    |
| Haven                          | Nothing now; its web client starts from the template when it is built                                                   | A task now: there is no web client to align                                                                                           |

## Prerequisites

- The apps' `develop` branches are clean and current (`git pull`), and each app's `verify` passes before its task starts.
- `@sovereignfs/create` 0.27.1 and the packages it names are on npm (they are, 2026-11-22). Each later release a leg needs is published
  before the app task that uses it.

## Legs

| Leg | Name                         | Epic tasks                             | Gate?                                                 | Done when                                                 |
| --- | ---------------------------- | -------------------------------------- | ----------------------------------------------------- | --------------------------------------------------------- |
| 1   | Core, what needs no decision | 20.1, 20.2, 20.3                       | No                                                    | All ✅ on `develop`; `pwa` and `auth` released            |
| 2   | The six apps current         | 20.8, 20.9, 20.10, 20.11, 20.12, 20.13 | **Yes: the owner reviews 20.8 before the other five** | All six on their `develop`; 11.15 ✅                      |
| 3   | Core, the package finished   | 20.4, 20.5, 20.6, 20.7, 13.36          | **Yes: the owner accepts 20.4 before 20.5**           | All ✅; `auth`, `sdk` and `create` released               |
| 4   | Sign-in in the apps          | 20.14, 20.15                           | **Yes: the owner reviews 20.14 before 20.15**         | Shopper and the six on the package, each on its `develop` |
| 5   | The planned apps             | 20.16                                  | No                                                    | The three designs updated                                 |

**How this workstream differs from the README's legs:** nothing is a branch or a pull request. Each task is one commit (with its
version bump) pushed directly to `develop` of the repository it changes; a gate is where the owner reviews those commits before the
next task. Legs 1 and 2 run side by side; leg 5 can run at any time.

## Leg detail

### Leg 1 — Core, what needs no decision

**Epic tasks:** 20.1, 20.3, 20.2

**Why here:** None needs the owner's decision, and 20.2 and 20.3 are releases the apps need before legs 2 and 4.

**Technical notes:** 20.3 follows the rule for a better-auth bump: verified against the populated stores, every manifest naming one exact
version (held by a test). 20.2 must keep the worker's allow-list rule; the extension point is text the app gives, as `onPushKind` is.
Each releases through a promotion (`pnpm promotion:draft`), which needs the owner.

**Do not proceed if:** the newest 1.7 patch changes the store's shape: stop and record it before bumping.

### Leg 2 — The six apps current

**Epic tasks:** 20.8 (Ledger), then 20.9 to 20.13 in any order

**Why here:** It needs nothing new from core and removes the largest part of the drift at once.

**Technical notes:** Shopper's alignment epic, tasks 17.1 and 17.2, is the recipe; read their "Done as" notes first. `create sync`
brings the `Dockerfile`, `.dockerignore` and `compose.yml` in as shared: an app whose image serves three databases lists them under
`sovereign.unmanaged`. Pins are exact and listed in `minimumReleaseAgeExclude` as Shopper's are. The export route works over the app's
own better-auth session (Shopper's `src/portability/core-export.ts`). With the package's worker, every offline navigation answers the
kept shell, so an app's offline screen decides what needs a connection. Tusk's wake and Waymark's tiles keep a handler of their own
until 20.2 is released.

**Do not proceed if:** an app's browser tests fail for reasons the move did not cause: record and stop, rather than fix unrelated tests
in the same commit.

### Leg 3 — Core, the package finished

**Epic tasks:** 20.4, then 20.5, 20.6, 13.36, 20.7

**Why here:** Every app's sign-in move rests on it; deciding it once in core keeps six apps from each deciding it.

**Technical notes:** 20.4 is an RFC 0007 amendment and the spec changes, nothing else. Shopper's fix `45b9319` (2026-11-22) is the
evidence for 20.5's core `sub` lookup: an app needs it from a user id, and the account id of the `sovereign` account row is it. 13.36
gives the package a SQLite and sqld database as well as the template's. 20.6 removes the template's second design.

**Do not proceed if:** 20.4 is not accepted; or a populated app store cannot be moved without data loss.

### Leg 4 — Sign-in in the apps

**Epic tasks:** 20.14 (Shopper), then 20.15 app by app

**Why here:** Last, onto a finished and released package.

**Technical notes:** Shopper's 17.5 is written in its repository and is the pattern. Each app keeps its prefix's settings through
`resolveAuthSettings`, its user-create hook for its own rows, and its sign-up policy. Tusk's ten-minute fresh session becomes the
password asked again (RFC 0007, "Decided in review").

**Do not proceed if:** a released version's database of the app does not sign in after the move.

### Leg 5 — The planned apps

**Epic tasks:** 20.16

**Technical notes:** Their designs follow Tally's; their first build tasks make the repository from the template, at a version after
leg 3.

## Risks

- **Direct commits on `develop`** have no pull request to stop a bad change; each app's pre-push hook (`verify`) is the only check
  before it lands. Run each app's browser tests before pushing.
- **Six lineages, not one:** the apps' `src/auth/` and workers differ from Tusk's in 18 to 20 files; a change copied blindly from one
  app breaks another.
- **better-auth versions:** Tally and Wallet resolve 1.7.22; leg 4 waits on 20.3 so none goes down.
- **People locked out:** a mistake in 20.5 stops every person of an app signing in; it is tested on a populated store of each dialect
  before release.

## Kill criteria

If 20.4 is decided against moving existing accounts, leg 4 stops at Shopper's decision, and legs 1, 2 and 5 still stand: every app current,
the shared worker, core's export, and true contracts.

## Changelog

| Version | Date       | Change        |
| ------- | ---------- | ------------- |
| 0.1     | 2026-11-22 | Initial draft |
