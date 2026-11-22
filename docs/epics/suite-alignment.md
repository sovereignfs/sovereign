# Epic 20: Suite alignment

> Every app in development is on the design the template carries: the current packages, manifest 5, core's export, the shared worker
> and, last, the one sign-in package.

## Status

📋 Planned

## Overview

Workstreams 0003 to 0010 changed what an app is, and the template carries all of it; the apps made before them do not.
[Research 0014](../research/0014-suite-alignment.md) found one app (Shopper) on the current packages and six (Ledger, Tally, Tusk,
Wallet, Waymark, Fjord Web) thirteen template releases behind, with a sign-in of their own that sends the password to the server.
This epic holds core's half (what stops the apps moving: chiefly existing password accounts and the key secret on
`@sovereignfs/auth`) and one task per app for theirs. Tasks in an app are built in that app's repository; their notes there say how,
and the task here is marked done when the app's change is on its `develop`.

## Related

- [docs/research/0014-suite-alignment.md](../research/0014-suite-alignment.md): the findings, options and recommendation
- [workstream 0011](../workstreams/0011-suite-alignment.md): the order the tasks run in
- [RFC 0007](../rfcs/0007-one-sign-in.md) and [docs/specs/auth.md](../specs/auth.md): the package the apps move onto
- [epic 11](pwa.md) (11.15, carried out by 20.8 to 20.13), [epic 13](operator-cli.md) (13.36), [epic 19](push.md) (19.7)
- [docs/building-an-app.md](../building-an-app.md): what an app is

## Tasks

#### ✅ 20.1 — The contracts and the guide say what apps use `[parallel]`

**Goal:** An app's author finds in the contracts and the guide what the template and the packages actually use.

**Deliverables:**

- `contracts/env.md`: `<PREFIX>_VAPID_PRIVATE_KEY` (and `_FILE`) and `<PREFIX>_VAPID_SUBJECT`; the field-encryption variables an app
  uses (`<PREFIX>_ENCRYPTION_KEY`, `_PREVIOUS`) reconciled with `FIELD_ENCRYPTION_KEYS`
- `contracts/app-manifest.md` names manifest 5 in its heading and version table
- `docs/building-an-app.md`'s package table lists `@sovereignfs/auth` and `@sovereignfs/export`, and says what is not built yet
  truthfully

**Dependencies:** none

**Spec reference:** contracts/env.md, contracts/app-manifest.md

**Review checklist:**

- Every variable the template's `_env.example` names is in `contracts/env.md`
- `pnpm docs:check-links` passes

#### ✅ 20.2 — The shared worker takes an app's own handlers `[parallel]`

**Goal:** An app on `@sovereignfs/pwa` adds Background Sync and its own fetch rules without appending to the package's text.

**Deliverables:**

- `serviceWorkerSource` takes an app's `sync` handler, posting the event to the app's open pages by default, as it takes push kinds
  (`onPushKind`)
- a documented way for an app to answer its own paths (Tusk's wake, Waymark's map tiles), held to the rule that nothing of a person
  is stored
- `@sovereignfs/pwa` minor bump, changelog, the template unchanged unless it uses them

**Dependencies:** none

**Spec reference:** RFC 0001; 11.11

**Review checklist:**

- An app's handler runs in a worker test, and an allow-list widened to a person's data still fails the package's test

**Done as (0.133.0):** `@sovereignfs/pwa` 0.3.0. `sync: { tags, message?, handlers? }` posts `{ type, tag }` to every open window
(`SYNC_MESSAGE` by default), or runs the app's `onSync(tag)`; `fetchHandlers` defines `onFetch(request, url)`, asked only about what the
worker leaves to the network, never a navigation or a kept file. The worker's own allow-list and its tests are unchanged; the new tests
(`worker-extend.test.ts`) fail against 0.2.0's worker. The template takes `^0.3.0` and does not use either.

#### ✅ 20.3 — `@sovereignfs/auth` on the newest better-auth `[parallel]`

**Goal:** No app moves onto the package with a downgrade of better-auth.

**Deliverables:**

- better-auth and its plugins at the newest 1.7 patch at least a day old (1.7.22 or later), in core, the package and the template,
  each named exactly
- verified against the populated stores (`apps/core/src/__tests__/fixtures/auth-store`)
- `@sovereignfs/auth` and core bumped; the template's version follows

**Dependencies:** none

**Spec reference:** auth.md §11

**Review checklist:**

- `pnpm test:db` on each database and `pnpm e2e` pass; the populated stores open

**Done as (0.132.0):** 1.7.27, the newest 1.7 patch. The store it writes has the same shape as 1.7.18's; its capture is kept beside the
older two. One change in behaviour: the provider now refuses a web app's `http` redirect address unless `allowInsecureRedirectUri`
says yes, which broke a development instance's `localhost` apps (two tests in `oauth.suite.ts` and `clients.test.ts` failed); core
passes its own rule (core-app §3.7.1). `@sovereignfs/auth` 0.5.0, core 0.85.4, the toolkit 0.28.0.

#### ✅ 20.4 — The specification: accounts an app already has, and the key secret

**Goal:** How an app with people already signed in moves onto the package is decided before it is built.

**Deliverables:**

- an amendment to RFC 0007: existing password accounts (moved at the next sign-in, reset, or both, research 0014 option C, with rule
  1's one exception named if one is taken); accounts from core written by `genericOAuth` (rows kept, tokens dropped, one sign-in
  through core again); a person's core `sub` from their user id; the key secret and key release over the package's session
- `docs/specs/auth.md` §4, §8 and §10 changed to match; `docs/specs/sdk.md` §9.3 where the key secret moves

**Dependencies:** none. **Gate:** the goal owner accepts the amendment.

**Spec reference:** RFC 0007 §4, §6; auth.md §4, §8

**Review checklist:**

- The open questions of research 0014 are answered or carried as the amendment's own

**Done as (accepted by the goal owner, 2026-11-22):** RFC 0007 amendment 1 (A1 to A6), auth.md rule 1 and §8.1, §10, sdk §9.3 and `building-an-app` §15. It
proposes option C: passwords moved at the next sign-in for 90 days through one route that exists only while a mark is open, then a reset
(mail, or `resetLink` from an app's own command); `genericOAuth` rows kept with their tokens cleared and their sessions checked against
core; `coreSubOf`; the key secret at `/api/auth/sv/key-secret`, in `sv_key_secrets`, keyed by the core `sub` for a core session.

#### 📋 20.5 — Accounts an app already has, across to the package

**Goal:** An app's people keep signing in after the app moves onto `@sovereignfs/auth`, without a reset unless 20.4 chose one.

**Deliverables:**

- as 20.4 decided: the password account's move (the server's check of the old hash, the new stored, the account marked moved, never a
  password again) and the form's side in `./client`, or the reset path an app with no mail can use
- a checking migration for an app's better-auth tables (RFC 0007 §6) that keeps `sovereign` account rows and clears any token in them
- a person's core `sub` from their user id, exported from `./core` beside `userIdForSub`
- a populated store from an app (Tusk's shape) as the test's fixture

**Dependencies:** 20.4

**Spec reference:** RFC 0007 §6 as amended; auth.md §10

**Review checklist:**

- A store made by a 0.1.0 app's sign-in signs in with the same password after the move, on each database
- A moved account refuses the password itself; no token is left in an `accounts` row

#### 📋 20.6 — The key secret over the package's session

**Goal:** An app on `@sovereignfs/auth` gets its keys from core, so the template has one design.

**Deliverables:**

- `./core` serves the per-session key secret and key release as `nextAuth` does (sdk §9.3), kept with the better-auth session and
  ended with it
- the template's `--encryption` form on `@sovereignfs/auth`; `ENCRYPTION_LEAVES_OUT` removed

**Dependencies:** 20.4

**Spec reference:** RFC 0007 §4 as amended; sdk §9.3; RFC 0005

**Review checklist:**

- A generated `--encryption` app releases keys and encrypts a note, signed in through the package
- The secret is gone when the session ends by sign-out or a back-channel notice

#### 📋 20.7 — Linking a local account to core `[parallel]`

**Goal:** A person with a local account in an app links it to core from a signed-in session, as Tusk does today.

**Deliverables:**

- the linking flow in `./core`, refused for an address that is another account's; its panel in `@sovereignfs/ui`'s account panels

**Dependencies:** 20.4

**Spec reference:** RFC 0007 §5; auth.md §8

**Review checklist:**

- Implicit linking stays off; a link needs the signed-in person's password or second step

#### ✅ 20.8 — Ledger on the current packages

**Goal:** Ledger is on the template's packages and manifest, answers core's export and installs from `@sovereignfs/pwa`; its sign-in
is unchanged.

**Deliverables (in Ledger's repository):**

- `@sovereignfs/sdk`, `ui`, `manifest` and `create` at the template's versions, each exact; `create sync`, with an image that serves
  three databases listed under `sovereign.unmanaged`
- manifest 5 with the template's `core` floor and `signIn.export`
- `POST /api/sovereign/export` with the SDK's `handleExportRequest` over Ledger's own session
- the worker, web manifest and registration from `@sovereignfs/pwa` (11.15), keeping what the app's own tests require
- the app's version and changelog

**Dependencies:** none. Shopper's 17.1 and 17.2 are the recipe.

**Spec reference:** building-an-app; contracts/app-manifest.md; 11.15

**Review checklist:**

- The app's `verify`, `manifest:check` and browser tests pass; `create sync --check` reports nothing
- No response with a person's data is cached by the worker (its test, seen to fail with the allow-list widened)

**Done as (Ledger 0.3.0, `7715836` on Ledger's `develop`):** sdk 2.11.0, ui 0.105.0, manifest 0.4.0 (manifest 5, core `>=0.126.0`), pwa
0.2.0, create 0.27.1 synced with Ledger's image files unmanaged. Core's export holds the person's book (`src/portability/core-export.ts`): the
book file Ledger already exported, its settings as `book` and a records file per table, times in ISO 8601. The worker is the package's with
Ledger's cache prefix, build files and colours, no shell, so offline is the suite's page (503, "You’re offline"); Ledger's own worker tests were
kept and run against it, with the sandbox given what a browser has (`basic` responses, `clients`, timers). What changed for the person: a new
version is announced with Reload, and the offline page's words. For the five apps that follow: the sandbox fixes in `src/sw/source.test.ts`,
the `/api/sovereign/export` access row, and the e2e offline heading.

#### ✅ 20.9 — Tally on the current packages

**Goal, deliverables and checklist:** as 20.8, in Tally's repository.

**Dependencies:** 20.8 (its notes)

**Done as (Tally 0.3.0, `6024415`):** as 20.8, with Tally's shell (`/shell`). The package answers every offline navigation with the shell, so
`OfflineShell` now says an address that is not a screen of the groups needs a connection. Background Sync is appended after the package's text until
pwa 0.3.0 is released. Core's export reads the person's groups on the server with what people wrote still sealed, marked end to end. The shared
worker claims the page as it starts, and WebKit does not apply Playwright's `page.route` to a controlled page: the two key tests that rewrite
`/api/keys` on a second device run it with `serviceWorkers: 'block'` (they failed after the change and passed before it).

#### ✅ 20.10 — Tusk on the current packages

**Goal, deliverables and checklist:** as 20.8, in Tusk's repository; its wake keeps a handler of its own until 20.2 is released.
19.7 (push) may land with it and stays workstream 0010's.

**Dependencies:** 20.8 (its notes)

**Done as (Tusk 0.5.0, `2e8adef`):** as 20.8, with Tusk's shell. Core's export is the "Everything" file a backup holds (`takeSnapshot`), a Desk
sealed with the person's own key marked end to end. Background Sync, Web Push and the wake are appended after the package's text until 20.2's
release and 19.7. `OfflineApp` says an address that is not the Desk needs a connection. 8 of 368 browser tests failed in the long run and passed
on a rerun.

#### ✅ 20.11 — Wallet on the current packages

**Goal, deliverables and checklist:** as 20.8, in Wallet's repository; its stale task for a VAPID key in `generate` is closed.

**Dependencies:** 20.8 (its notes)

**Done as (Wallet 0.3.0, `0fd5164`):** as 20.8, with Wallet's shell and its sync appended. Core's export is the vault and the entries, sealed as
stored, in base64url, marked end to end. Wallet's 21.6 (a VAPID key in `generate`) is closed. Its camera scan browser test fails on this machine
before and after the change.

#### ✅ 20.12 — Waymark on the current packages

**Goal, deliverables and checklist:** as 20.8, in Waymark's repository; its map tiles keep a handler of their own until 20.2 is
released. 19.7 may land with it.

**Dependencies:** 20.8 (its notes)

**Done as (Waymark 0.3.0, `5138aff`):** as 20.8, with Waymark's shell. The map's files are answered by a second fetch listener and Web Push is
appended, until 20.2's release and 19.7. Core's export is what its own export gathers (`gather`), with photos and attachments as files. The planning
browser test that rewrites the place search runs with `serviceWorkers: 'block'`, as Tally's key tests do.

#### ✅ 20.13 — Fjord Web on the current packages

**Goal, deliverables and checklist:** as 20.8, in `fjord/clients/web`; the Rust crates are untouched.

**Dependencies:** 20.8 (its notes)

**Done as (Fjord Web 0.7.0, `4b41ac7`, after `bc6565b`, Next.js 16.4.6, which `next build` now requires):** the packages, manifest 5 and the
shared worker, with Fjord's cache name by release and `/offline` as the kept page; `create` 0.27.1 synced at the repository's root. **Core's export
is not in it:** a local repository is Git objects in Fjord's store and a journal may be encrypted, so what goes in is the owner's decision first,
recorded as Fjord's own task H5. Its browser tests that load the WASM module were not run (no `wasm-pack` on the machine); the rest passed but two
that fail before the change too, for the same missing build.

#### 📋 20.14 — Shopper on `@sovereignfs/auth`

**Goal:** Shopper's sign-in is the package's: the pilot for every app with people already signed in.

**Deliverables (in Shopper's repository):** its task 17.5 as written there, on the released 20.3, 20.5, 20.6 and 13.36; ADR 0001
accepted.

**Dependencies:** 20.3, 20.5, 20.6, 13.36

**Spec reference:** auth.md; RFC 0007

**Review checklist:**

- A 0.2.x database's accounts, local and through core, sign in after the move on each database; core's accounts get their keys

#### 📋 20.15 — The six apps on `@sovereignfs/auth`

**Goal:** Ledger, Tally, Tusk, Wallet, Waymark and Fjord Web sign in with the package; no app keeps a sign-in of its own.

**Deliverables (in each app's repository, one change each):** `src/auth/` replaced by the package as in 20.14; the forms on
`SignInForm` and `SignUpForm`; the session following core's; sign-out as 6.5 decided; better-auth at the package's version.

**Dependencies:** 20.14 for each; 20.7 for Tusk and any app with both ways in

**Spec reference:** auth.md; RFC 0007

**Review checklist:**

- Per app: a released version's database signs in after the move, on each database; nothing of a password reaches the server

#### 📋 20.16 — The planned apps' designs name the packages `[parallel]`

**Goal:** Foundry, Loom and PaperTrail start on the final design.

**Deliverables (in each workbench folder):** `DESIGN.md` and the epics name `@sovereignfs/auth`, `pwa`, `push`, `export` and manifest
5 where they now describe Tally's pattern; each repository's first task makes it from the template at a version with 20.6 and 13.36

**Dependencies:** none

**Review checklist:**

- No design names `genericOAuth`, `nextAuth` or a worker of the app's own
