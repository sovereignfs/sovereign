# Research 0014 — The apps, brought up to the suite's design

|            |                                                                                                                                                                                                               |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Status** | For review: sequenced in [workstream 0011](../workstreams/0011-suite-alignment.md), tasks in [epic 20](../epics/suite-alignment.md)                                                                           |
| **Date**   | November 2026                                                                                                                                                                                                 |
| **Author** | Claude Code (with `kasunben`)                                                                                                                                                                                 |
| **Scope**  | The apps in development (Ledger, Shopper, Tally, Tusk, Wallet, Waymark, Fjord, Haven; Foundry, Loom and PaperTrail as designs); `@sovereignfs/auth`, `sdk`, `pwa`, the app template; workstreams 0003 to 0010 |

---

## Question

Workstreams 0003 to 0010 changed what a Sovereign app is: encryption with keys from core, one sign-in package
(`@sovereignfs/auth`), an app that installs from `@sovereignfs/pwa`, exports answered for core, and Web Push from
`@sovereignfs/push`. The template (`npm create @sovereignfs app`) carries all of it. The apps already in development were made before
most of it. How far is each from the template's design, what in core stops them closing the gap, and in what order should both be
done?

## Method

- **The reference:** the template at `@sovereignfs/create` 0.27.1 (`tools/create/template/app`, `tools/create/src/versions.ts`) and
  the packages at their versions in this repository on 2026-11-22: `auth` 0.4.0, `sdk` 2.11.0, `ui` 0.105.0, `pwa` 0.2.0, `push`
  0.2.0, `manifest` 0.4.0, `export` 0.3.0.
- **Each app's `develop`:** `package.json` and the lockfile, `sovereign.manifest.json`, `sovereign.json`, the tags, and a search of
  `src/`, `app/` and `proxy.ts` for each feature's markers. Tusk's `src/auth/auth.ts` and its sign-in form were read; for the other
  apps the same pattern was found by search and by comparing their `src/auth/` folders with Tusk's, not read line by line.
- **What the apps asked of core:** Shopper's epics `alignment` (17) and `upstream` (16), and its ADR 0001; Wallet's roadmap; the
  designs of Foundry, Loom and PaperTrail.
- **What core already planned:** tasks 11.15, 13.36, 18.8, 19.7; RFC 0007 §6 and its rollout; `docs/specs/auth.md` §8.
- **Shopper's fix of 2026-11-22** (`45b9319`, 0.2.1): its key source read core's `sub` from a column nothing set, so no account
  through core had keys. The `sub` is the account id of the sign-in through core in the auth store; Shopper reads it there now.

## Findings

### 1. One app is on the current design; six are thirteen template releases behind

| App                       | Template | `sdk` / `ui` | Manifest | Sign-in                                                                                | Worker    | Core's export |
| ------------------------- | -------- | ------------ | -------- | -------------------------------------------------------------------------------------- | --------- | ------------- |
| Shopper                   | 0.27.1   | 2.11 / 0.105 | 5        | its own better-auth; a derived value; onto the package blocked (§4)                    | `pwa` 0.2 | yes           |
| Ledger                    | 0.14.0   | 2.1 / 0.92   | 2        | its own better-auth; the password as typed; `genericOAuth` to core                     | its own   | no            |
| Tally                     | 0.14.0   | 2.1 / 0.96.1 | 2        | as Ledger                                                                              | its own   | no            |
| Tusk                      | 0.14.0   | 2.1 / 0.92   | 2        | as Ledger (read)                                                                       | its own   | no            |
| Wallet                    | 0.14.0   | 2.1 / 0.92   | 2        | as Ledger                                                                              | its own   | no            |
| Waymark                   | 0.14.0   | 2.1 / 0.96.1 | 2        | as Ledger                                                                              | its own   | no            |
| Fjord Web                 | 0.14.0   | 2.1 / 0.92   | 2        | as Ledger                                                                              | its own   | no            |
| Haven                     | 0.17.0   | none yet     | —        | Haven Mobile only; Web and Desktop not built                                           | —         | —             |
| Foundry, Loom, PaperTrail | —        | —            | —        | designs only, written to Tally's pattern; none names `auth`, `pwa`, `push` or `export` | —         | —             |

Every built app has released tags, so every one has password accounts in use. Every one runs on PostgreSQL, sqld and a SQLite file
(`<P>_DB_DIALECT`). The six older apps share one lineage (Tusk's), but their `src/auth/` folders differ from Tusk's by 18 to 20 files
and their workers differ: one recipe, adapted per app, not one patch.

### 2. What the six older apps lack that needs nothing new from core

- **Packages:** `sdk` 2.1 → 2.11 (the typed `User`, sign-in for a session the app keeps, `handleExportRequest`), `ui` → 0.105,
  `manifest` → 0.4, `create` → 0.27.1 and its `sync` (shared workflows, settings, `AGENTS.md` sections, the image files).
- **Manifest 5** with the template's `core` floor (`>=0.126.0`), `signIn.export`, and `storage`, `encryption` and `generate` where the
  app's design uses them.
- **Core's export** (18.6): `POST /api/sovereign/export` answered by `handleExportRequest`, which works over the app's own better-auth
  session (Shopper does it, `src/portability/core-export.ts`).
- **The worker and manifest from `@sovereignfs/pwa`** (11.15): `serviceWorkerSource`, `manifest()`, `ServiceWorkerRegistration`, so
  a new version is announced. Shopper's 17.2 records what changes when an app moves: every navigation offline answers the kept shell,
  the offline page is a 503, a new worker waits for a page's message.
- **Push** belongs to workstream 0010 (19.7: Tusk and Waymark off their own copies). Wallet's planned 21.6 ("a VAPID key in
  `generate`") is already in the template's manifest and is stale.

Shopper did all of this in its 17.1 and 17.2; their "Done as" notes are the recipe, including listing the `Dockerfile`,
`.dockerignore` and `compose.yml` under `sovereign.unmanaged` for an app whose image serves three databases.

### 3. What their sign-in does that auth.md forbids

Tusk's `src/auth/auth.ts` and sign-in form, and by search the other five:

- **The password reaches the server** (`authClient.signIn.email({ email, password })`), against auth.md §4 rule 1.
- **Core is reached through better-auth's `genericOAuth`**, which auth.md §8 rules out: better-auth keeps and refreshes core's
  refresh token itself, while core takes a refresh token used twice for theft.
- **The session never follows core's:** nothing sends `prompt=none` (auth.md §8, `needsCoreCheck`), so an app's session ends early
  only when a back-channel notice arrives.
- **Signing out skips core** (`disableProviderLogout`), where 6.5 decided a hosted app's sign-out goes through core's end-session.
- **better-auth drifts:** declared as `~` ranges, resolved at 1.7.14 (Fjord), 1.7.16 (Tusk), 1.7.18 (Ledger, Waymark, Shopper) and
  1.7.22 (Tally, Wallet). The package names 1.7.18 exactly, so for Tally and Wallet moving onto it today is a downgrade.

Each of these goes away when the app is on the package, and none is worth fixing in place first.

### 4. What stops an app moving onto `@sovereignfs/auth`

Shopper's ADR 0001 proposed the move, checked it against the code, and fell back: moving would have stopped 0.1.0's password accounts
signing in. In order of what they block:

1. **Existing password accounts.** An app's stored hashes are of the password; the package hashes the derived value and refuses
   anything else. RFC 0007 §6 moves the _tables_ of Tusk and Fjord by a checking migration, but nothing moves the _hashes_. Core moved
   its own by emailed resets (`docs/upgrade.md`, 0.100.0); most apps have no mail. This blocks every released app (Shopper 16.14).
2. **The key secret over the package's session** (auth.md §8, "not built"; Shopper 16.10). Key release needs a per-session secret
   that today only the SDK's `nextAuth` serves. So the template's `--encryption` form still signs in with `nextAuth`, deprecated in
   14.15: the template itself has two designs. It blocks Shopper, which encrypts, and any app that adds encryption.
3. **Accounts from core already in an app's store.** `genericOAuth` wrote `accounts` rows with `provider_id` `sovereign` and the
   account id core's `sub`, and may hold tokens in them. The package uses the same provider id and keeps tokens only in the SDK's
   store, so the rows can be kept, the tokens must go, and each person signs in through core once more. Shopper's fix of 2026-11-22
   shows the second half of the gap: an app needs a person's core `sub` from their user id, and the package gives only the reverse
   (`userIdForSub`), so each app writes its own lookup, and Shopper's first was wrong.
4. **SQLite and sqld for the package** (13.36; Shopper 16.13). The package ships `./postgres` only. Shopper can wrap its own connection
   until then; every app would write the same wrapper.
5. **Linking a local account to core from a signed-in session** (auth.md §8, "not built"). Tusk does it today; an app with both ways
   in loses it on the move.

### 5. Smaller gaps in core

- **Contracts:** `contracts/env.md` does not mention `<PREFIX>_VAPID_PRIVATE_KEY` or `_VAPID_SUBJECT`, and names
  `<PREFIX>_FIELD_ENCRYPTION_KEYS` where every app uses `_ENCRYPTION_KEY` and `_PREVIOUS`; `contracts/app-manifest.md`'s heading does
  not name manifest 5; `building-an-app.md`'s package table lacks `auth` and `export` (Shopper 16.11).
- **`@sovereignfs/pwa` has no Background Sync** and no way for an app to add a handler, as it lets one add push kinds (Shopper 16.12).
  Shopper appends its listener to the package's text; Tusk's wake and Waymark's map tiles (11.15) need the same kind of extension.
- **The SDK's encryption asks** (Shopper 16.8, 16.9, 16.15, 16.16; PaperTrail's first spike rests on 16.8) and **18.8** (exports
  with no core) are features, not alignment, and are left to the apps that need them.
- **Locks** (4.17, 14.14 part B) wait on devices and are not in the package yet; apps get them when they are.

## Options

### A. Where the work is tracked

1. **In each app's repository only**, as Shopper's 17 and 16 are. Core's half is then a list of requests no one in core owns, as it
   is today, and the apps diverge in how they do the same move.
2. **One workstream here** with an epic of tasks for core's half and one task per app for theirs, as 11.15 and 19.7 already do for
   apps. Each app keeps its own task notes; the workstream holds the order. **Recommended.**

### B. The order

1. **Sign-in first**, since it is the largest gap. It is blocked by §4 and would hold everything behind the slowest decision.
2. **The mechanical layer first in every app, while core closes §4**, then sign-in: Shopper first, then the six. Each step ships value
   alone, and the apps' sign-in move happens once, onto a finished package. **Recommended.**
3. **Rewrite each app from a fresh template.** Throws away product code that works; rejected.

### C. Existing password accounts (§4.1)

1. **Moved at the next sign-in:** the form sends the password and the derived value once; the server checks the old hash, stores the
   new, and marks the account moved; a moved account never accepts a password again. One request carries a password, once per
   account, which rule 1 must name as its single exception.
2. **A reset for everyone:** keeps rule 1 whole; needs mail, which most apps lack, or a reset by the operator.
3. **Both:** the move at sign-in for a period the app chooses, then a reset for whoever did not come back. **Recommended**, decided
   in an amendment to RFC 0007 before anything is built.

## Recommendation

1. Track it as **workstream 0011** and **epic 20**, which take in 11.15 for the six apps and point at 13.36 and 19.7 without owning
   them.
2. **Leg 1 (core, now):** the contracts and guide true; `@sovereignfs/pwa` takes an app's own worker handlers; the package on the
   newest better-auth 1.7 patch; an RFC 0007 amendment for existing accounts, the key secret and a person's core `sub`, accepted by
   the goal owner before leg 3.
3. **Leg 2 (the six apps, now, in parallel with leg 1):** each app on the current packages, manifest 5, `sync`, core's export and
   the `pwa` worker, with Shopper's 17.1 and 17.2 as the recipe. Ledger first, as it has no push and the plainest worker.
4. **Leg 3 (core):** the amendment built: moving password accounts and core's accounts, the key secret over the package's session
   (and the template's `--encryption` form onto the package), a person's core `sub`, SQLite and sqld (13.36), linking.
5. **Leg 4 (apps):** Shopper onto the package (its 17.5) as the pilot, then the six; each app's `src/auth/` deleted.
6. **Leg 5:** Foundry, Loom and PaperTrail's designs name the packages; each is made from the template only after leg 3, so it starts
   on the final design. Haven's web client, when it is built, starts from the template.
7. Keep `create sync --check` in every app's promotion check, so the shared files do not drift again.

Decisions for the goal owner: Option C; ADR 0001 as it reads in Shopper; whether the six apps' sign-out goes through core (6.5) once
they are on the package; and 6.6 (`amr`), which stays parked.

## Later, not now

The SDK's encryption features the apps asked for (sharing with no core, a key by link, a key wrapped under one's own app key, key
release in the fake core), exports with no core (18.8), and the locks (4.17, 14.14 part B). Each is taken up by the app that needs
it, against the package it belongs in.

## Open questions

- Does the move of a password account need the app to know the person's sign-in salt before the first derived sign-in, as core's
  `/api/sign-in-salt` gives? The template has the route; the six apps do not.
- How long should an app accept a moved-at-sign-in password before only a reset remains?
- Do Tusk's ten-minute fresh session pages (RFC 0007, "Decided in review") need changes beyond asking for the password again?
