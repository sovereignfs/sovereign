# Workstream 0004 — Encryption follow-ups

**Status:** 📋 Planned\
**Date:** November 2026\
**Author:** Claude Code, for kasunben\
**Goal owner:** kasunben\
**Governs:** [RFC 0005](../rfcs/0005-end-to-end-encryption.md); epic [16](../epics/encryption.md) (Encryption), tasks 16.15 to 16.18;
milestone M15 of the [roadmap](../../ROADMAP.md)\
**Research:** none; these were found while building [workstream 0003](0003-encryption.md)

---

## Goal

What building encryption left undone is done: no screen tells a person on an instance with escrow that nobody else can recover their
data; an app that gets its key from core no longer ships the password derivation; an app made with `--encryption` encrypts people's files
as well as their notes; and the vault of an app with no core is shown to work in a real browser, as core's is.

## Definition of done

- [ ] `16.15` — The recovery kit says what escrow changes
- [ ] `16.16` — The vault of an app with no core, in an entry of its own
- [ ] `16.17` — Encrypted files in the template
- [ ] `16.18` — An app with no core, in a browser
- [ ] Every guide still says the feature is not yet audited, and none says more than RFC 0005 promises

## Decisions locked

Proposed on 2026-11-17, from what building workstream 0003 showed; the goal owner confirms or changes them before leg 1 starts.
Once confirmed, an agent running a leg does not reopen them; one that finds a decision cannot be built as
written stops and says so.

| Decision                        | Choice                                                                                                          | Rejected alternative and why                                                                                                     |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| The kit's words under escrow    | One `RecoveryKit` with a property saying whether the instance can recover the person's data                     | A second component: two copies of the same screen drift. Dropping the sentence everywhere: without escrow it is true and matters |
| Where `localVault` lives        | `@sovereignfs/sdk/local-vault`, its own browser entry, before any SDK carrying it is published                  | Keeping it in `/keys` behind a dynamic import: the libsodium file still ships with every app's `/keys`                           |
| Moving it after it is published | Not allowed: leg 1 runs before the release that would publish `localVault` in `/keys`                           | Moving it later and keeping a deprecated re-export: a breaking change to undo, for no one who needed it                          |
| Encrypted files' format         | RFC 0005 §1.3 as built (`encryptContent` in 64 KiB chunks, the name, type and size as one `encryptBytes` value) | A format of the template's own: a second format for a reviewer to read                                                           |
| Where encrypted files live      | Only in the template's `--encryption` app, through `@sovereignfs/storage` as `application/octet-stream`         | Encrypting in `@sovereignfs/storage` itself: the store is server-side, and the server must never hold a key                      |
| A no-core app's browser test    | A page of the e2e harness over `@sovereignfs/sdk/local-vault`, the run's database and `vaultRoute`              | A second app template for no-core apps: a large thing to keep, for what a test page shows                                        |
| Gates                           | None of these waits for the cryptographer's review or the code audit, and none changes a stored format          | Waiting: these change no format the review is reading, and leg 1 must land before a release                                      |

## Prerequisites

- **Workstream 0003's branch is merged into `develop`** (its draft pull request), or each leg is run on top of it. These tasks build on
  `localVault`, the encrypted template and the escrow page that it adds.
- **Leg 1 lands before the promotion that publishes `@sovereignfs/sdk` 2.4.0 or later.** Owned by the goal owner, who decides when to
  promote.
- **Nothing else.** No measurement, review or outside party is needed.

## Legs

| Leg | Name                              | Epic tasks       | Gate?                                                    | Done when                             |
| --- | --------------------------------- | ---------------- | -------------------------------------------------------- | ------------------------------------- |
| 1   | Before the SDK is published       | `16.15`, `16.16` | **Yes: before the next promotion that releases the SDK** | Both ✅, merged before that promotion |
| 2   | Encrypted files                   | `16.17`          | No                                                       | 16.17 ✅                              |
| 3   | An app with no core, in a browser | `16.18`          | No                                                       | 16.18 ✅                              |

One leg is one branch, one draft PR, one review gate ([README](README.md#legs)). Legs 2 and 3 need only leg 1 (leg 3 imports the new
entry) and may be taken in either order.

## Leg detail

Read RFC 0005 §1.3, §4 and §6 first. Each task's deliverables and checklist are in [the epic](../epics/encryption.md); what follows is
only what no single task holds.

### Leg 1 — Before the SDK is published

**Epic tasks:** `16.15`, `16.16`

**Why here:** `localVault` is in `/keys` only on unreleased branches; once a release publishes it there, moving it is a breaking change.
The kit's words are wrong today on every instance with escrow, and they are the words a person reads at the moment they decide whether to
keep the kit.

**Technical notes:** the copy is in `packages/ui/src/components/RecoveryKit/RecoveryKit.tsx`; core shows it from
`apps/core/app/keys/release/release-flow.tsx`, which already knows whether escrow is on (its `escrow` step), so the property is passed
from there. Writing the words is a design-system change: follow `sv-ui-design`, update the story and the Component Gallery, and bump
`@sovereignfs/ui` by a minor version. For the entry: add `local-vault` to `packages/sdk/tsup.config.ts`, the package's `exports` and
`publishConfig.exports`, move `src/local-vault.ts`'s export out of `src/keys.ts`, and look at the built `dist/keys.js` for an import of
the libsodium chunk; the test reads the built files. One version bump for the leg: `@sovereignfs/sdk` and `@sovereignfs/ui` minor.

**Do not proceed if:** the SDK carrying `localVault` in `/keys` has been published already; then stop and ask, since the move is a
breaking change.

### Leg 2 — Encrypted files

**Epic tasks:** `16.17`

**Technical notes:** the template is `tools/create/template/encryption` written over `tools/create/template/app`; the notes
(`app/notes.tsx`, `lib/notes.ts`) are the pattern for keys and readers. Uploading reads the file as a stream into `encryptContent` and
sends the result to `/api/files` with a length, so `@sovereignfs/storage`'s quota check still works; the file's id must be made before
encrypting, since it is in the header. `@sovereignfs/storage` judges a type by its bytes and serves only images inline: encrypted bytes
are `application/octet-stream`, which is right, and the page decrypts and offers the download itself. Check the made app live against a
built core, as leg 11 of workstream 0003 did, with a file larger than one chunk.

**Do not proceed if:** encrypting a file needs `@sovereignfs/storage` to hold or see a key, or to change a stored format of its own.

### Leg 3 — An app with no core, in a browser

**Epic tasks:** `16.18`

**Technical notes:** `apps/e2e/support/apps.ts` runs the harness's apps; the minimal app gains a page whose script is the built
`@sovereignfs/sdk/local-vault` (bundled once in the global setup), a session of its own with a secret kept beside it, and
`vaultRoute` over an `AppVault` on a schema or namespace of the run's database. The SDK test `packages/sdk/src/__tests__/local-vault.test.ts`
already shows the flow in Node; this one shows it with a real browser's IndexedDB, WebCrypto and WebAssembly. Name the tests for sdk
§9.5, not for core-app §5.10, so the acceptance map is unchanged.

**Do not proceed if:** the page cannot run the built SDK without a bundler setup of its own larger than the test it serves.

## Risks

- **The kit's words are what a person decides on.** A change that says escrow "can" recover when it is off, or says nothing when it is on,
  is worse than today. The test renders both.
- **A leg 1 that lands after a release** is a breaking change for any app that imported `localVault` from `/keys` in between.
- **Encrypted files make large uploads slower in the browser.** Encrypting in 64 KiB chunks as a stream keeps memory flat; a test with a
  file of several chunks holds it.
- **The template's files are someone's data.** An app made before leg 2 keeps its files unencrypted; leg 2 does not convert them.

## Kill criteria

- **If leg 1 cannot land before the release**, 16.16 is dropped and recorded as not done; the kit's words (16.15) still ship.
- Legs 2 and 3 each ship by themselves; stopping after either leaves what came before working.

## Changelog

| Version | Date     | Change                                                                                                                                                           |
| ------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0.1     | Nov 2026 | Initial draft, from the follow-ups found while building workstream 0003: the kit under escrow, `localVault`'s entry, encrypted files, a no-core app in a browser |
