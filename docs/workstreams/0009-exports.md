# Workstream 0009 — Exports

**Status:** ⏳ In Progress\
**Date:** November 2026\
**Author:** Claude Code, for kasunben\
**Goal owner:** kasunben\
**Governs:** [RFC 0008](../rfcs/0008-exports-and-backups.md) (milestone 1); epic [18](../epics/exports.md) (Exports), tasks 18.1 to 18.7;
milestone M18 of the [roadmap](../../ROADMAP.md)\
**Research:** none; RFC 0008 followed from a review of the proposal against core-app §4.4 and operator-cli §10.2

---

## Goal

An owner downloads core's data from the Console, in one file only their key opens; a person downloads everything of theirs, from core and
from every app they use, from their account; and every app has the same two exports, hosted by core or running alone, from one shared
package. Nothing is sent anywhere and nothing runs on a schedule: those are milestone 2 (tasks 13.17 and 13.18), outside this workstream.

## Definition of done

- [x] `18.1` — The specifications
- [x] `18.2` — The format and the package
- [x] `18.3` — The operator's recipients
- [x] `18.4` — The operator's export in core
- [x] `18.5` — A person's export in core
- [x] `18.6` — Apps' parts
- [x] `18.7` — The template's exports
- 18.8 (an app with no core) is outside this workstream: it waits for the template of an app of its own
- [ ] An owner's export, taken from a built core, opens with `sv export open` and passes its check; a person's export holds an app's part
      from a template app, on each database
- [x] No guide or screen says an export is a backup that restores an instance

## Decisions locked

Settled in RFC 0008 and its review on 2026-11-20. An agent running a leg does not reopen them; one that finds a decision cannot be built as
written stops and says so.

| Decision                         | Choice                                                                                                                                                       | Rejected alternative and why                                                                                                                                   |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| What the Console exports         | Core's own data (its database records and its folder of `sovereign-data`); the instance stays `sv backup`'s                                                  | The whole instance from the Console: core reaches no other app's database, no Docker socket, no `secrets/`; a second backup tool would be wrong about the keys |
| Restore                          | None in this workstream: downloads only                                                                                                                      | An import in the Console: it needs the secrets, `restored_at` and the deletions handled, a design of its own                                                   |
| What is exported                 | What is at rest, unchanged: end-to-end ciphertext stays ciphertext, with the vault's records; data not yet encrypted as stored                               | Sealing each person's data to their key: no operator could restore it                                                                                          |
| The operator's key               | age X25519 recipients pasted into the Console (`sv key export` prints `secrets.recipients`); opened with `age` or `sv export open`                           | A key derived from the server's secrets: the server could read every export; a new key pair: `sv` already has the operator's age key                           |
| A person's export                | Not encrypted, `.zip` by default (`.tar` on request), for the session's own account after the password                                                       | Encrypted to the person's key: most people have none yet; a passphrase is a later choice                                                                       |
| Who takes the operator's export  | The owner only (`instance:export`, owner-only)                                                                                                               | Admins too: the file holds every account, as the instance's secrets do                                                                                         |
| Apps' parts                      | Core asks each app at a manifest-declared `signIn.export` address with a signed `export-request+jwt`, the logout tokens' key: the one signed-token pattern   | Apps pushing to core, or a new mechanism: two patterns for one trust                                                                                           |
| The package                      | `@sovereignfs/export`, new and published, imports nothing of core's                                                                                          | A part of `@sovereignfs/storage`: exports cover records, not only files                                                                                        |
| An app with no core              | Its first account is its operator, with the same two pages                                                                                                   | No operator export for such apps: they are the ones with nothing today                                                                                         |
| End-to-end encryption by default | Its own RFC, later; this workstream relies on what is at rest                                                                                                | Folding it in: a migration with its own audit and kit questions                                                                                                |
| **Branch and commits**           | **The whole workstream on one feature branch, `feat/exports`, documentation and code together; a local commit at every checkpoint; one draft PR at the end** | One branch and PR per leg (the README's default): the goal owner asked for one branch for this workstream                                                      |

## Prerequisites

- RFC 0008 accepted (it is, 2026-11-20).
- `feat/exports` cut from an up-to-date `develop`; it carries the RFC, this workstream and every leg.
- Nothing waits on an outside party.

## Legs

| Leg | Name                         | Epic tasks     | Gate?                                        | Done when                       |
| --- | ---------------------------- | -------------- | -------------------------------------------- | ------------------------------- |
| 1   | The specifications           | `18.1`         | **Yes: the goal owner reads the spec diffs** | 18.1 ✅, committed              |
| 2   | The package and the key      | `18.2`, `18.3` | No                                           | Both ✅, committed              |
| 3   | Core's exports               | `18.4`, `18.5` | No                                           | Both ✅, `pnpm test:db` on each |
| 4   | Apps' parts and the template | `18.6`, `18.7` | **Yes: the draft PR**                        | Both ✅, the done list above    |

**How this workstream differs from the README's legs:** every leg is on `feat/exports`. A leg ends in one or more local commits (each task
its own commit, its version bump with it), not a PR; the gates are where the goal owner reviews before the next leg. After leg 4 the branch
is pushed and one draft PR is opened into `develop`, rebased and merged as usual. Nothing is pushed before that unless the goal owner asks.

## Checkpoints

A checkpoint is a local commit, made when the working tree passes `pnpm verify:push`'s checks for what it touches:

- the end of each task (its code, its docs, its `ROADMAP.md` row and epic heading ✅, its version bump and changelog section);
- within a long task, any point where the tree builds and its tests pass, so a stopped session loses little;
- the workstream's own documents (this file, the epic, the roadmap rows) are committed before leg 1 starts.

Commit messages follow AGENTS.md (`type(scope): summary`, a `Verified:` line, the agent's trailer) and carry no task numbers.

## Leg detail

Read RFC 0008 first, and core-app §4.4, §4.5 and §5.3. Each task's deliverables and checklist are in [the epic](../epics/exports.md); what
follows is only what no single task holds.

### Leg 1 — The specifications

**Epic tasks:** `18.1`

**Why here:** every later task implements a specification, not the RFC.

**Technical notes:** the exports section in core-app sits after §4.6 (Files). §4.4 keeps its decision that `sv backup` is the instance's
backup and loses only "the Console shows nothing about backups". The format goes in `contracts/export.md` once, and the other documents
point to it. Manifest 5 follows how manifest 4 was added (app-manifest §5.3).

**Do not proceed if:** writing the spec shows that a person's export needs something core cannot read of them without their keys.

### Leg 2 — The package and the key

**Epic tasks:** `18.2`, `18.3`

**Why here:** both of core's exports and the template stand on the package; the operator's export cannot be tried without recipients.

**Technical notes:** a new published package follows `@sovereignfs/storage`'s setup (tsup, ESM only, `docs/releasing.md`,
`pnpm packages:check`, the Dockerfile's list of manifests, which a test checks). Choose an age implementation that streams and is
maintained; a new dependency goes into the catalog first, a release at least a day old. The recipients setting follows escrow's
(`InstanceManager`, core-app §5.8) and `sv key export` follows `sv key escrow` (operator-cli §9.5).

**Do not proceed if:** no maintained age implementation streams in Node; stop and say so rather than writing one.

### Leg 3 — Core's exports

**Epic tasks:** `18.4`, `18.5`

**Technical notes:** the jobs follow `apps/core/src/accounts/deletion-scheduler.ts` (claimed by a conditional update, so two instances of
core do not run one twice). Files come through `@sovereignfs/storage`. The download routes are new, so the existing tests that check
`requireCapability`, `requireSignedIn` and `requireSameOrigin` must find them. The service worker's allow-list must not gain them. Every
schema change is made for each dialect. Follow `sv-ui-design` for the Console and Account pages, and run `sv-security-check`.

**Do not proceed if:** the operator's export would need anything in the clear on disk, or a person's export would need a secret of the
excluded list.

### Leg 4 — Apps' parts and the template

**Epic tasks:** `18.6`, `18.7`

**Technical notes:** core's requests reuse how logout and account-deleted notices are signed and sent (core-app §3.6.5, §4.5); the SDK's
handler sits beside theirs (sdk §9.1). Check a template app against a built core end to end. Then run `sv-task-complete`'s verification for
the whole branch, push, and open the one draft PR (`sv-create-pr`).

**Do not proceed if:** an app's answer cannot be checked without holding it whole in memory.

## Risks

- **An operator's export holds everyone** who has not moved to end-to-end encryption, in a file the operator can read; the Console says so,
  and the server cannot.
- **A person's export is in the clear** once downloaded; the page says so.
- **Apps' parts are only as complete as each app's handler**; an app that answers with less than it holds is not caught by the check.
- **A long-lived branch** drifts from `develop`; rebase it at each leg's end.

## Kill criteria

- **If no age implementation streams**, legs 3 and 4's person's export still ship, and the operator's export waits; leg 1's specs stand.
- **If apps' parts cannot be made safe to request**, a person's export ships with core's part only, and says so.

## Changelog

| Version | Date        | Change                                                                                                                                                |
| ------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0.1     | Nov 2026    | Initial draft, from RFC 0008.                                                                                                                         |
| 0.2     | 20 Nov 2026 | Legs 1 to 4 built on `feat/exports`; 18.8 split off. Not yet checked on sqld and PostgreSQL, nor end to end against a built core with a template app. |
