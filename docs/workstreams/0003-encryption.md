# Workstream 0003 — Encryption the server cannot read

**Status:** ⏳ In Progress (legs 1 to 7 done)\
**Date:** November 2026\
**Author:** Claude Code, for kasunben\
**Goal owner:** kasunben\
**Governs:** [RFC 0005](../rfcs/0005-end-to-end-encryption.md) (Accepted); epic [16](../epics/encryption.md) (Encryption), tasks 16.1 to
16.14; milestone M15 of the [roadmap](../../ROADMAP.md)\
**Research:** [0008](../research/0008-end-to-end-encryption.md), which builds on [0006](../research/0006-data-at-rest.md)

---

## Goal

An app can keep what people give it (documents, notes, files) so that nobody who reads the server, its disk or its backups can read it,
and a person does nothing unusual to get that: they register once, keep a recovery kit, and sign in with their password or a passkey on
any device. Core never receives a password, on any instance. An app that runs with no core encrypts the same way, and an app that only
signs in through core sees no difference at all.

## Definition of done

- [x] `16.1` — The specifications
- [x] `16.2` — The password derivation
- [x] `16.3` — Signing in with a derived value
- [x] `16.4` — Keys and formats
- [x] `16.5` — A locked state and the recovery kit, in the design system
- [x] `16.6` — Core's vault and the recovery kit
- [x] `16.7` — Staying unlocked until the session ends
- [x] `16.8` — Passkeys that unlock
- [x] `16.9` — Manifest 4, and allowing an app to use encryption
- [x] `16.10` — Key release
- [ ] `16.11` — Sharing between people
- [ ] `16.12` — Escrow
- [ ] `16.13` — A vault for an app with no core
- [ ] `16.14` — An encrypted app, end to end
- [ ] The acceptance list task 16.1 writes into core-app holds, each item shown by a named test in `apps/e2e`
- [ ] No guide or screen says more than RFC 0005 promises, and each says the feature is not yet audited

## Decisions locked

Settled with the goal owner on 2026-11-16, and recorded in research 0008 and RFC 0005. An agent running a leg does not reopen them; one
that finds a decision cannot be built as written stops and says so.

| Decision                 | Choice                                                                                                                                | Rejected alternative and why                                                                                                              |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| What is promised         | Safety from anyone who reads the server. The formats also detect a swapped key or file, but that is not promised                      | Promising safety from a malicious operator: a web app's code comes from the server, so it cannot be kept. "Zero-knowledge" is never said  |
| Where the model lives    | In `@sovereignfs/crypto`, with a vault in core for a connected app and in the app for one that runs alone                             | Only in core: an app with no core would have none (RFC 0003). Only in each app: a kit and an unlock for every app                         |
| What unlocks             | The sign-in password, derived in the browser so core never receives it; each passkey, by the PRF extension; the recovery kit; escrow  | A separate encryption passphrase: one more secret, and people know the one-password way from services they use                            |
| How core takes the value | The browser sends a derived value where it sent the password, and better-auth hashes it as before                                     | SRP or OPAQUE: they replace better-auth's password sign-in and every flow that touches a password                                         |
| Which instances          | Every instance signs in this way, with encrypted apps or none                                                                         | Only instances that turn encryption on: two ways of signing in are twice as much to get wrong                                             |
| The password policy      | Checked in the browser; the server checks only that a value has the derivation's shape. The old hard rule is retired, in 16.3         | Keeping the policy on the server: it would need the password                                                                              |
| A reset by email         | Gives back the account and not the data, until a passkey that unlocks, the kit, or escrow is used. Said where it matters              | A reset that restores data: the server would have to be able to unlock it                                                                 |
| Existing accounts        | Set their password again through the reset link, after a backup. No second way of signing in is kept                                  | Upgrading at next sign-in: the server would receive a password once more, and accounts are few                                            |
| The salt                 | A random id the instance makes once and publishes, and the address. Not the instance's address                                        | The instance's origin: an instance that moved would lock everyone out of their accounts and their data                                    |
| The root key             | A random account key, wrapped once for each way in                                                                                    | A key made from the password: changing the password would re-encrypt everything                                                           |
| An app's key             | Random, stored wrapped by the account key. An app gets its own and never the account key                                              | Derived from the account key: it could never be replaced, or moved when an app that ran alone is connected                                |
| Readers                  | People, one by one. The record says what kind of reader it is for                                                                     | Groups and roles now: a shared key and its rules are a design of their own                                                                |
| From core to an app      | Key release: a top-level redirect to core's page and back, the answer sealed to a one-use key and returned in the fragment            | Inside the OpenID Connect redirect: no page of core's runs when a session exists. A hidden frame: browsers partition its storage          |
| Asking people            | The operator allows an app to use encryption; people are not asked app by app                                                         | A consent line for each app: one more screen, and an app only ever gets its own key                                                       |
| Staying unlocked         | Until the session ends. The key is kept wrapped twice, and the server's half is deleted with the session                              | Memory only: a prompt at every reload. A preference for a prompt at each browser session: later, if asked for                             |
| Recovery                 | A kit for everyone, as groups of letters and digits with a check group. Escrow only if the owner turns it on, and people are told     | Words: a word list in one language, and longer to type. Escrow by default: its holder can read everything                                 |
| Algorithms               | RFC 0005 §1: Argon2id, HKDF-SHA-256, AES-256-GCM, HPKE over X25519, Ed25519, as WebCrypto keys that cannot be exported where possible | A WebAssembly library for everything: its keys are bytes any script can read                                                              |
| Whose code               | Audited implementations where they exist, shipped from the app's own origin; written here only where none fits                        | Writing all of it: more for a reviewer to read and more to get wrong                                                                      |
| Core's own data          | Unchanged. Research 0006 stands for names, addresses and roles                                                                        | Encrypting core's columns: core must read them, and the key would be on the same disk                                                     |
| Review                   | A cryptographer reads the RFC before anything stores a key; a code audit follows before the guides claim protection                   | One audit at the end: a flaw in a format found then costs a rebuild                                                                       |
| Review, waived as a gate | On 2026-11-16 the goal owner decided to build legs 5 to 11 before the cryptographer's review, which is still to come                  | Waiting: the goal owner chose to have the whole feature built and reviewed after. Findings that change a stored format become a new suite |
| Execution                | Legs, each one branch, one draft PR and one review                                                                                    | One long branch: nothing could be reviewed or released on the way                                                                         |

## Prerequisites

- **A backup before leg 3** (`sv backup`, [operating](../operating.md)): leg 3 changes how every account signs in. Owned by the goal owner.
- **Phones to measure on, after leg 2**: an ordinary one and a slow one. Owned by the goal owner.
- **A cryptographer's review of RFC 0005, before leg 5.** The [review brief](../rfcs/0005-review-brief.md) is what they are sent. Owned by
  the goal owner; no agent arranges it or stands in for it.
- **Nothing else.** RFC 0005 is accepted, and the passkey plugin already passes WebAuthn extensions through
  (`@better-auth/passkey`, read at 1.7.13).

## Legs

| Leg | Name                               | Epic tasks      | Gate?                                   | Done when                                                 |
| --- | ---------------------------------- | --------------- | --------------------------------------- | --------------------------------------------------------- |
| 1   | The specifications                 | `16.1`          | No                                      | 16.1 ✅, reviewed and merged                              |
| 2   | The password derivation            | `16.2`          | **Yes: the cost is measured and fixed** | 16.2 ✅, and the goal owner has recorded the measurements |
| 3   | Signing in with a derived value    | `16.3`          | No                                      | 16.3 ✅, and the goal owner's own account signs in        |
| 4   | Keys, formats and components       | `16.4`, `16.5`  | **Yes: the cryptographer's review**     | Both ✅, and the review's findings are answered           |
| 5   | Core's vault, and staying unlocked | `16.6`, `16.7`  | No                                      | Both ✅                                                   |
| 6   | Passkeys that unlock               | `16.8`          | No                                      | 16.8 ✅                                                   |
| 7   | An app gets its key                | `16.9`, `16.10` | No                                      | Both ✅                                                   |
| 8   | Sharing                            | `16.11`         | No                                      | 16.11 ✅                                                  |
| 9   | Escrow                             | `16.12`         | No                                      | 16.12 ✅                                                  |
| 10  | An app with no core                | `16.13`         | No                                      | 16.13 ✅                                                  |
| 11  | End to end                         | `16.14`         | **Yes: a code audit before any claim**  | 16.14 ✅                                                  |

One leg is one branch, one draft PR, one review gate ([README](README.md#legs)). Legs run in this order. Legs 6, 9 and 10 need only
leg 5 and may be taken in any order after it; leg 4 may be started while leg 3 is in review, since it stores nothing.

## Leg detail

Read RFC 0005 whole before any leg. Each leg's tasks, deliverables and checklists are in [the epic](../epics/encryption.md); what follows
is only what no single task holds.

### Leg 1 — The specifications

**Epic tasks:** `16.1`

**Why here:** the spec wins over code and over the RFC (AGENTS.md). Every later leg implements what this one writes.

**Technical notes:** core-app's Phase 2 is §4 (§4.1 to §4.6); the keys section is new and goes beside them. Give it an acceptance list
with numbered items, as §3.17 has, because leg 11 must show one named test for each (`scripts/__tests__/acceptance-map.test.ts` holds
that for §3.17 today; read it before choosing the numbering). Two claims in the RFC are worded more strongly than its design: that an
older version of a document does not open (§1.3), and that a reader of the server's memory gets no more than a reader of the database
(Security and privacy). Word them to what is designed, and leave the questions to the reviewer; do not design an answer. This leg changes
no code and bumps no version.

**Do not proceed if:** writing the spec shows a place where RFC 0005 cannot be implemented as written. Stop and ask; do not resolve it in
the spec.

### Leg 2 — The password derivation

**Epic tasks:** `16.2`

**Why here:** signing in and every key start from it, and its cost has to be measured before anything depends on it.

**Technical notes:** `packages/crypto` today is server-only: it imports `node:crypto`, builds with `tsc`, and exports one entry point
(`package.json`). Add a second entry point that is safe in a browser, and keep the existing one working unchanged: `apps/core` uses it
for the SMTP password (`src/settings/store.ts`). The derivation is RFC 0005 §1.1 exactly; the address is trimmed and lower-cased, the
password is NFKC, and `sign-in` is `svp1.` and 43 base64url characters. Begin by looking for an audited Argon2id that can be shipped in
the package and run in both a browser and Node; write down what was looked at and why the choice was made. A new dependency goes in the
pnpm catalog first, and pnpm refuses a release less than a day old. The timing page is a development tool: keep it out of any shipped
bundle. The cost was fixed at 19 MiB and 3 passes (iPhone 15 Pro, about one second).

**Gate:** after this leg the goal owner opens the timing page on real phones and fixes the cost by the rule of RFC 0005 §1.4 (about a
second on an ordinary phone, two at most on a slow one, memory lowered before passes, never below 19 MiB and 2 passes). Leg 3 does not
start until the constant holds the measured cost.

**Do not proceed if:** no audited Argon2id fits and one would have to be written from the reference. Stop and ask.

### Leg 3 — Signing in with a derived value

**Epic tasks:** `16.3`

**Why here:** it is the one part useful with no encrypted app, and the unlock key cannot exist before it.

**Technical notes:** the hash is made in `policedHash` (`apps/core/src/auth/auth.ts`), which every way of setting a password passes
through, including a server-side `setPassword` no route reaches: that is where the shape check goes. The policy is `passwordProblems`
(`src/auth/password-policy.ts`) and must run in the browser unchanged, so the words stay the same. The forms are under
`apps/core/app/(auth)/` (sign-in, sign-up, reset), `app/security/` (change, two-factor), `app/delete-account/` and
`app/console/ownership/`; `confirmPassword` (`src/auth/confirm-password.ts`) is what asks again on the server and keeps its counting.
Find every one by searching for what posts a password, not from this list. The seed is `src/dev/seed.ts` and `sovereign-admin` is
`src/admin/main.ts`: both make accounts with passwords and must derive from the address and the instance id, read from the database. The id is a setting
(`src/settings/store.ts`), made once before any account can be and never rewritten; the public instance document is
`src/instance/branding-document.ts`, typed from the contract and always current. The policy is `buildCsp` in
`src/csp.ts`. A better-auth change is verified against a populated store (`src/__tests__/fixtures/auth-store`): make the fixtures again
with derived values. Sign-in now needs JavaScript; check `(auth)` pages for anything that posted without it. This is a breaking change
for accounts: note it in `docs/upgrade.md`.

**Do not proceed if:** the cost is not yet fixed (the gate of leg 2), no backup was taken, or any flow turns out to need the password on
the server (better-auth comparing or transforming it before `policedHash`, say). Stop and ask.

### Leg 4 — Keys, formats and components

**Epic tasks:** `16.4`, `16.5`

**Why here:** neither stores anything, so both can be finished and reviewed before the gate, and the reviewer's findings can change them
cheaply.

**Technical notes:** the associated data of every record is RFC 0005 §1.2's table; follow the field cipher's habit of binding a value to
its context (`packages/crypto/src/field-cipher.ts`). Keep the vault an interface here, with the shapes core's tables (leg 5) and an
app's (leg 10) will both satisfy. `packages/ui` components are framework-agnostic and RSC-safe, take links from the consumer, and use
semantic colour tokens only; `DeviceOnlyGate` and `DeviceStorageKeyGate` exist from an earlier design and may already say part of what
`LockedState` must. Use the `sv-ui-design` skill for both components and their words. `@sovereignfs/ui` is published: its version and
changelog section go in the same commit.

**Gate:** the cryptographer's review of RFC 0005. When the findings arrive they are answered in the RFC (and the spec, and this leg's
code where a format changes) before leg 5 starts. A finding that changes a decision locked above goes to the goal owner.

**Do not proceed if:** an audited HPKE cannot be found and the RFC 9180 vectors cannot be met by one written over WebCrypto.

### Leg 5 — Core's vault, and staying unlocked

**Epic tasks:** `16.6`, `16.7`

**Why here:** the first leg that stores a key. Unlocking without staying unlocked would ask at every page, so the two ship together.

**Technical notes:** schemas are `apps/core/src/db/schema/postgres.ts` and `sqlite.ts`; every change is made for every dialect, the
parity test catches a column added to one, and `pnpm --filter @sovereignfs/core db:generate` strips PostgreSQL's schema name. Timestamps in
milliseconds are `bigint` on PostgreSQL. Deleting an account is one transaction in `src/accounts/manage.ts` (`AccountManager`), shared by
an operator's deletion and a person's own: the key tables join it. Sessions are ended through better-auth's endpoints and never by
deleting a row, so `key_session_secrets` must go when better-auth removes the session, by a foreign key that cascades or by the same
hook. Server actions call `requireCapability` themselves (a test fails otherwise) and act for the session's account. Setting up runs in
the browser at the first sign-in after this ships; a person who closes the page before confirming the kit must be shown it again and
not left with an account key no kit wraps. Nothing here is read in a `useState` initialiser or in render. The service worker's
allow-list (`src/sw/source.ts`) is untouched.

**Do not proceed if:** the review's findings are not answered, or a changed password cannot be made one request that applies both the
new sign-in value and the re-wrapped key together.

### Leg 6 — Passkeys that unlock

**Epic tasks:** `16.8`

**Why here:** it needs an account key to wrap, and nothing later needs it.

**Technical notes:** the plugin is configured in `src/auth/auth.ts` (`passkey({...})`), and its client (`src/auth/client.ts`) takes
`extensions`, removes the extensions' results before answering the server, and returns them when `returnWebAuthnResponse` is set: read
`@better-auth/passkey`'s `dist/client.mjs` again at the installed version before relying on it. Core's own hooks refuse a passkey that
was not user-verified; that must still hold. The passkey page is `app/security/passkeys/`. Platform passkeys made before this ships
usually answer PRF; some security keys do not, so "does not unlock" is a normal state to show, not an error.

**Do not proceed if:** the installed plugin sends an extension's result to the server, or no longer returns it to the page.

### Leg 7 — An app gets its key

**Epic tasks:** `16.9`, `16.10`

**Why here:** release needs the vault and somewhere to return to, and the return address comes from the manifest.

**Technical notes:** an app is written only through `ClientRegistry` (`src/clients/registry.ts`), and the Console says "app" except in
the technical settings, where these two fields go. Manifest schemas are `contracts/schemas/app-manifest-v*.schema.json` and
`packages/manifest/src`; every version stays readable for good, and `@sovereignfs/manifest` is published. `/keys/release` is a signed-in
page: rendered per request, with the nonce, the hardening headers and `frame-ancestors 'none'` as every page has, and it answers anything
that fails its checks with the page that is not there. The redirect back is made by the page, since a fragment must be written by the
browser. In the SDK, sign-in is `packages/sdk/src/auth.ts` and the browser side `src/browser.ts`; `getSession` makes no call to core and
that must stay true. The SDK now depends on `@sovereignfs/crypto`, which is `private` today: publishing it means `docs/releasing.md`,
the list in AGENTS.md, `pnpm packages:check`, a first version and changelog.

**Do not proceed if:** key release cannot be done without changing how core's OpenID Connect provider answers.

### Leg 8 — Sharing

**Epic tasks:** `16.11`

**Technical notes:** the Core API is defined only in `contracts/core-api/openapi.yaml`; `packages/api-client` is generated
(`pnpm generate:api-client`) and never edited, and every handler's answer is checked with `expectMatchesContract`. A route under
`/api/v1` calls its guard first. The two calls return public and wrapped keys only; document keys stay in the app's own database.

**Do not proceed if:** a call would have to return anything a server could use to read a document.

### Leg 9 — Escrow

**Epic tasks:** `16.12`

**Technical notes:** `sv key recovery` (`tools/cli/src/commands/key.ts`, operator-cli §9.4) is the pattern: a key made on the operator's
machine, its private half never on the server. Instance settings are changed only by `InstanceManager` (`src/instance/manage.ts`), and
this one needs the owner-only capability. A person's browser can add an escrow wrap only while unlocked, so turning escrow on covers each
person from their next unlock, and the page must say which accounts are not yet covered.

**Do not proceed if:** opening an account's key would need the escrow private key on the server.

### Leg 10 — An app with no core

**Epic tasks:** `16.13`

**Technical notes:** shared packages work with no core present and never import `apps/core`. The vault's driver sits over
`@sovereignfs/database`, for every dialect. An app whose sessions are someone else's (RFC 0003) has no password of its own to derive
from, and asks for a passphrase.

**Do not proceed if:** the interface of leg 4 has to change in a way core's vault would notice.

### Leg 11 — End to end

**Epic tasks:** `16.14`

**Technical notes:** the template is `tools/create/template`, and a test holds it to the repository's conventions. Acceptance is
`apps/e2e`, run against a built core on each database; its apps ask from addresses of their own. Read the test instance's database and
files after the run and find no plaintext.

**Gate:** a code audit, before any guide says the feature protects anything. Until then the words "not yet audited" stay.

**Do not proceed if:** any guide would have to say more than RFC 0005's promise to be useful.

## Risks

- **Leg 3 can lock the only account out.** A mistake in the derivation, the address's normalisation or the instance id makes a
  value that no later sign-in reproduces. The backup, a test that signs in from a second browser, and the seed signing in from a browser
  are what catch it.
- **The instance id is in every salt.** It is made once and must never change: an id that is made again (an empty settings table after a
  bad restore, a migration that runs twice) locks everyone out as surely as a lost database. Making it must refuse to run when accounts
  exist and no id does, and say so, never make a new one.
- **The reviewer may change a format.** Legs 2 to 4 are built before the review on purpose. The number after `svp` and the `suite` in
  every record exist so a change is a new version and not a break; do not ship either without it.
- **A lost kit and a reset password lose the data**, for good, on an instance without escrow. The screens that say so are part of the
  feature, not decoration.
- **WebAssembly in the policy.** `'wasm-unsafe-eval'` is the only loosening. A test must hold `'unsafe-eval'` and `'unsafe-inline'` out.
- **Browser storage is new for core.** Until now core kept nothing of a person in a browser but its cookie. The keys are wrapped twice
  and useless without the server's half, and the service worker must never see them.
- **Support differs by device.** Passkeys that unlock depend on the PRF extension, which is uneven; the password is always the other way.

## Kill criteria

- **If the review finds the design unsound** in a way a new version cannot mend, the workstream stops after leg 4. What survives is
  signing in without core receiving a password (legs 1 to 3), which stands by itself, and the library, unused.
- **If the derivation cannot be made fast enough on a slow phone** at or above the minimum cost, the workstream stops after leg 2 and
  nothing has changed for anyone.
- Each leg from 5 on ships by itself; stopping after any of them leaves what came before working.

## Changelog

| Version | Date     | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0.1     | Nov 2026 | Initial draft                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 0.2     | Nov 2026 | Leg 1 done (16.1, no version): core-app §5 specifies keys, not built, with an acceptance list (§5.10); §2 and §3.16 say so. The reset page is given the account's address (a decision taken with the goal owner); the manifest's `encryption` (§2.8, manifest 4), sdk §9.3, operator-cli §9.5 and the design system's two components are specified, not built. RFC 0005 is worded to what is designed on versions and on a reader of the server's memory. Run on the planning branch, not a branch of its own, at the goal owner's request.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 0.3     | Nov 2026 | Leg 2 built, not complete (16.2): `@sovereignfs/crypto/web` with the derivation, Argon2id from libsodium's sumo build (chosen with the goal owner, since no browser Argon2id is fully audited; the salt is cut to libsodium's 16 bytes), vectors from noble-hashes, and the timing page, checked in a browser on the development Mac. Waiting at the gate: the cost is measured on phones before 16.2 is done and leg 3 starts.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 0.4     | Nov 2026 | Leg 4, 16.4 built (not yet complete, with 16.5 to come in the same leg): HPKE written over WebCrypto (no audited one found) and held to RFC 9180 A.1.1 and to `@hpke/core` both ways; every record of RFC 0005 §1.2, bound by length-prefixed fields; the recovery kit in Crockford base32 with a check group; documents in chunks as streams; the vault as an interface and remembered keys. The timing page gained browser checks, which held in Chromium. A test now holds what "cannot be exported" does not buy (a script on the page can open what a usable key wraps), and the RFC and brief say so.                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 0.5     | Nov 2026 | Leg 4 done (16.4, 16.5; root 0.98.0, ui 0.97.0, crypto 0.1.0): `LockedState` and `RecoveryKit` in the design system, from wireframes the goal owner approved as drawn (no third "security details changed" state; Save as a file kept), checked live in both themes and below 768px. Since the 0.4 row: the timing page pre-checks with the 1 MiB vector only, so a phone short of memory still reaches the timing; copies of secrets handed to WebCrypto are no longer made; small-order X25519 keys are refused; frozen vectors pin every stored format; the RFC and spec describe the formats as built. Leg 2 stays at its gate.                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 0.6     | Nov 2026 | Leg 2 done (16.2, root 0.99.0, crypto 0.2.0): the goal owner timed an iPhone 15 Pro (64 MiB and 3 passes took 3.4 s), so the cost is 19 MiB and 3 passes (about one second), and the password vectors were made again at it. The goal owner waived the review as a gate for legs 5 to 11 (Decisions locked). The file store's flaky test is fixed (one run in sixteen, not sixty-four).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 0.7     | Nov 2026 | Leg 3 done (16.3, root 0.100.0, core 0.64.0), and 16.9 of leg 7 built ahead (manifest 0.3.0, toolkit 0.15.0): core never receives a password. Decided while building: the instance id is made at start-up when missing and an upgraded instance says so, rather than refuse to start (every existing instance has accounts and no id); core's pages read it from the instance document rather than each page being given it; `sovereign-admin accounts reset-link` gives a way back with no mail; signing in with anything but a sign-in value is refused before any lookup, since otherwise the dummy hash better-auth makes for an unknown address answered differently from a known one; one key return address decides encryption, where the spec had two settings.                                                                                                                                                                                                                                                                                                     |
| 0.8     | Nov 2026 | Leg 5 done (16.6, 16.7; root 0.101.0, core 0.65.0), built ahead of the review at the goal owner's decision. Keys are set up silently at the first password sign-in and the kit is shown at the first encrypted app (the goal owner's choice), so the kit's page comes with key release. Changed from the spec: a password change wraps for the new password beside the old and drops the old after, since it cannot share better-auth's transaction; a reset leaves the password's way in stale instead of a hook removing it; the password's secret crosses the second step through IndexedDB, once; a session's secret is served only through a join on a live session, and deleting an account deletes the vault in its transaction rather than trusting cascades. Checked on SQLite and PostgreSQL, and in a real browser (§5.10.2).                                                                                                                                                                                                                                    |
| 0.9     | Nov 2026 | Leg 6 done (16.8; root 0.102.0, core 0.66.0, crypto 0.3.0). Changed from the spec, and put to the review: the PRF input is one per instance and the HKDF salt one per passkey, since WebAuthn takes an input per credential only with a list of credentials and core's passkey sign-in is discoverable; a random input per passkey would have needed a second touch. The installed passkey client was read first: it leaves extension results out of what it sends and returns them to the page. A passkey's way in must name one of the person's own passkeys, is not read once its passkey is gone, and is deleted by an after-hook on removal. The local ceremony reads the user-verified flag itself. Checked with Chromium's virtual authenticator, with and without PRF, and on SQLite and PostgreSQL.                                                                                                                                                                                                                                                                |
| 0.10    | Nov 2026 | Leg 7 done (16.9, 16.10; root 0.103.0, core 0.67.0, sdk 2.2.0, crypto 0.4.0). Changed from the spec: `@sovereignfs/crypto` stays private and is bundled into the SDK's new `/keys` entry, as `api-client` is, rather than published (19 KB, no libsodium, since the password derivation is not reached); the browser key store moved into `@sovereignfs/crypto` so core and apps keep keys the one way; the answer carries the account's signing public key so a first release can be remembered; the app's key secret is kept in the app's own session record and served by `nextAuth` at `/auth/key-secret` to same-origin requests only; the kit is shown on the release page, at the first encrypted app. Added while building, and put to the review: release is silent only when the `Referer` is the app's origin and asks otherwise, since the request's public key is the asker's to choose. The release format's refusals are tested in the library, the SDK's in a full round trip against core's sealing, and §5.10.5 in a real browser through the SDK itself. |
