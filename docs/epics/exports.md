# Epic 18: Exports

> An operator and every person can take a copy of their data with them, from core and from every app, on demand.

## Status

📋 Planned

## Overview

[RFC 0008](../rfcs/0008-exports-and-backups.md) is the design. These tasks build its milestone 1: exports on demand, as downloads, with
no destination and no schedule. An owner downloads core's data from the Console, encrypted to their age recipients so that the server cannot
read it; a person downloads everything of theirs, from core and from each app they use, from their account; an app has the same two
exports, hosted by core or running alone, from one shared package.

An export copies what is at rest: data a person keeps end-to-end encrypted stays ciphertext, with their vault records. `sv backup` stays the
instance's backup; an export is a portable copy, never a restore. Milestone 2 (destinations and schedules) is tasks
[13.17](operator-cli.md) and [13.18](operator-cli.md), and is not sequenced here.

[Workstream 0009](../workstreams/0009-exports.md) holds the order and the decisions.

## Related

- [RFC 0008](../rfcs/0008-exports-and-backups.md)
- [docs/specs/core-app.md](../specs/core-app.md): §2, §4.4, §4.5, §5.3, §5.8, and the section task 18.1 adds
- [contracts/app-manifest.md](../../contracts/app-manifest.md); [docs/specs/sdk.md](../specs/sdk.md) §9.1, §9.2, §9.5;
  [docs/specs/operator-cli.md](../specs/operator-cli.md) §9
- [RFC 0005](../rfcs/0005-end-to-end-encryption.md): what stays ciphertext

## Tasks

#### ✅ 18.1 — The specifications

**Goal:** What RFC 0008's milestone 1 designs is written into the documents that hold authority, so every later task implements a
specification and not an RFC.

**Priority:** 1. Nothing is built from the RFC directly.

**Deliverables:**

- `docs/specs/core-app.md`: §2 (export leaves "Later"); §4.4 (the Console may export core's data; `sv backup` stays the instance's
  backup; what the Console says about backups); a new section for exports (the format's place, the operator's export, a person's export,
  apps' parts, what is never exported, the jobs and downloads); the operator's recipients as an instance setting; `instance:export` in the
  matrix as owner-only; a changelog row
- `contracts/app-manifest.md`: manifest 5 and `signIn.export` (the schema itself is 18.6's)
- `docs/specs/sdk.md` §9.1: the export handler; §9.5: an app with no core's two exports and its operator
- `docs/specs/operator-cli.md` §9: `sv key export` and `sv export open`
- the format, written once, where core, the SDK and the package all point to it (a contract file, `contracts/export.md`)
- RFC 0008's `Status:` and `docs/rfcs/README.md` say which tasks carry it

**Dependencies:** none

**Spec reference:** RFC 0008, milestone 1

**Review checklist:**

- Every MUST can be traced to a section of the RFC, and nothing in the RFC that binds an implementation is missing
- The list of what a person's export never holds is explicit, and matches the RFC
- `pnpm docs:check-links` and `pnpm format:check` pass; no code changes

#### ✅ 18.2 — The format and the package `[parallel]`

**Goal:** One package writes, reads and checks an export, and encrypts one to age recipients, with no core present.

**Priority:** 2.

**Deliverables:**

- `packages/export` (`@sovereignfs/export`, published): a streaming tar writer that puts `export.json` first and records each file's
  SHA-256 and size; a reader that checks the manifest (every file listed and matching, nothing unlisted, no path outside the archive, an
  unknown `format` refused); a `.zip` of the same tree for a person's export
- encryption to age X25519 recipients as a stream, and parsing and checking a recipients line; the age implementation chosen and its
  reason written in the package's README
- the handler's verification for an app (the `export-request+jwt` checks) as a framework-free function the SDK calls. As built: it
  lives in the SDK beside the logout and account-deleted checks it shares (18.6), so the package needs no JWT code
- added to `docs/releasing.md`, `pnpm packages:check`, the Dockerfile's copied manifests, and the catalog for any new dependency

**Dependencies:** 18.1

**Spec reference:** `contracts/export.md`; RFC 0008 §2, §3

**Review checklist:**

- A changed byte, a missing file, an unlisted file and a path outside the archive each fail the check
- An archive many times larger than the process's memory limit is written and checked without holding it
- What is encrypted opens with `age -d` and the identity, and with nothing the writer held
- The package imports nothing of core's

#### ✅ 18.3 — The operator's recipients

**Goal:** The owner gives core the public keys an export is encrypted to, and opens an export on their own machine.

**Priority:** 3.

**Deliverables:**

- the instance setting, written only by `InstanceManager` with `instance:configure-secrets`, checked for its shape there
- Console > Data > Export: the recipients field, what it means, and how to get the line (follow `sv-ui-design`)
- `sv key export`, which prints the instance's recipients from `secrets.recipients` as one line; `sv export open FILE [--key FILE]`,
  which decrypts on the operator's machine and checks the manifest

**Dependencies:** 18.1, 18.2

**Spec reference:** core-app (the exports section); operator-cli §9

**Review checklist:**

- No route or action but `InstanceManager` writes the setting; an admin cannot
- A line that is not age X25519 recipients is refused with a message that says what is expected
- `sv export open` refuses an archive whose manifest fails

#### 📋 18.4 — The operator's export in core

**Goal:** The owner downloads core's data in one file that only their key opens.

**Priority:** 4.

**Deliverables:**

- `instance:export`, owner-only, in the matrix and its migration for every dialect
- the action: `requireCapability`, the password through `confirmPassword`, refused without recipients; one export at a time
- the job, run as the deletion and logout schedulers are: core's records and core's folder of `sovereign-data`, encrypted as written,
  never in the clear on disk; sessions, tokens and revocations left out
- a notification when it is ready; the download once, for the session that asked, within an hour, `Cache-Control: no-store`; the file
  deleted after
- what the page says before the export starts: that the file holds the people there now, and that `sv backup` is the instance's backup

**Dependencies:** 18.2, 18.3

**Spec reference:** core-app (the exports section), §4.4

**Review checklist:**

- The file opens with the operator's identity and with no key the server holds
- A test that lists the tables and columns exported fails when a table is added and not decided
- Refused without the capability, without the password, without recipients; the route calls `requireSameOrigin`
- Works on sqld, PostgreSQL and SQLite (`pnpm test:db`)

#### 📋 18.5 — A person's export in core

**Goal:** Anyone downloads what core holds of them, from their account.

**Priority:** 5.

**Deliverables:**

- Account > Data > Download my data, for the session's own account, after the password; one export per person at a time
- core's part: profile, preferences, email addresses, connected apps and consents, notifications, activity, files, vault records as stored;
  never the password's hash, TOTP secrets, backup codes, passkeys' credentials, sessions or tokens
- the job, the notification and the single download as in 18.4, not encrypted; `.zip` by default
- `export.json`'s `parts` listing core's part, with room for apps' parts (18.6)

**Dependencies:** 18.2

**Spec reference:** core-app (the exports section)

**Review checklist:**

- A test that lists what a person's export may carry fails when a table gains a column
- None of the excluded secrets is in an export, checked against a seeded account with TOTP and a passkey
- End-to-end ciphertext in the archive equals what is stored
- Another person's export cannot be asked for or downloaded

#### 📋 18.6 — Apps' parts

**Goal:** A person's export holds what each app they use holds of them.

**Priority:** 6.

**Deliverables:**

- manifest 5 in the schema (`contracts/schemas/`), `sv app add` registering `signIn.export`, and the Console's technical settings showing it,
  written through `ClientRegistry`
- core's requests: for each app the person used (core-app §4.5's sense), a `POST` with `export_request_token`, signed with the key that
  signs logout tokens; no redirect followed; a time and a size limit; the answer written to disk and checked against its manifest
- an app that declares nothing, fails or answers wrongly listed as `missing` with a reason, and the person told which
- the SDK's handler (sdk §9.1), through 18.2's verification: a replayed `jti` refused, the app's function called with the `sub` to stream
  its part

**Dependencies:** 18.5

**Spec reference:** core-app (the exports section), §4.5; app-manifest; sdk §9.1, §9.2

**Review checklist:**

- Core calls only the address registered for the app, never one from a request
- A token for another app, an expired one and a replayed one are refused by the handler
- One app down leaves the rest of the export complete, and says which is missing
- Manifests 1 to 4 still validate

#### 📋 18.7 — The template's exports

**Goal:** Every new app has both exports, hosted by core or running alone.

**Priority:** 7.

**Deliverables:**

- `tools/create`'s template: the export handler and the manifest field for an app hosted by core
- for an app with no core (sdk §9.5): its first account is its operator; Console > Data with the operator's recipients and the app's
  export, encrypted; Account > Data with a person's own part, not encrypted
- the template's tests, and `docs/building-an-app.md`'s section on exports

**Dependencies:** 18.2, 18.6

**Spec reference:** sdk §9.1, §9.5; app-manifest

**Review checklist:**

- An app made from the template answers core's export request in a test against a built core
- The app's operator export opens with the operator's identity only
- The template's existing tests still pass
