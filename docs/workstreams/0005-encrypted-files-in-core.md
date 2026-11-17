# Workstream 0005 — Encrypted files in core

**Status:** 📋 Planned\
**Date:** November 2026\
**Author:** Claude Code, for kasunben\
**Goal owner:** kasunben\
**Governs:** [RFC 0005](../rfcs/0005-end-to-end-encryption.md) (an amendment); epic [16](../epics/encryption.md) (Encryption), tasks 16.19 to 16.23;
milestone M15 of the [roadmap](../../ROADMAP.md)\
**Research:** [research 0009](../research/0009-encrypted-files-in-core.md)

---

## Goal

Core protects the one content it keeps as an encrypted app protects its own: the files a person uploads on the Files page are encrypted
in their browser, so that nobody who reads the server, its disk or a backup can read them, their names or their types. Account data (address,
name, role) stays readable, as with Proton, because core must read it to work. Before that, nothing says files are encrypted while they are
not, and everyone can keep a recovery kit, so that encrypting files never turns a forgotten password into lost files.

## Definition of done

- [ ] `16.19` — The Files page says what it protects
- [ ] `16.20` — A recovery kit for everyone, from the Security page
- [ ] `16.21` — Core's own files, designed
- [ ] `16.22` — Core's files encrypted in the browser
- [ ] `16.23` — Existing files moved, and the acceptance items
- [ ] Every guide still says the feature is not yet audited, and none says more than RFC 0005 promises

## Decisions locked

Proposed on 2026-11-17 from research 0009, for the goal owner to confirm before leg 1 starts. An agent running a leg does not reopen
them; one that finds a decision cannot be built as written stops and says so.

| Decision                  | Choice                                                                                                      | Rejected alternative and why                                                                                                                |
| ------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| What core encrypts        | Content only: the files people keep. Account data stays readable                                            | Encrypting account data: core must read it to sign people in and send mail; RFC 0005's non-goal stands, as Proton leaves addresses readable |
| Where it is encrypted     | In the person's browser, with a files key wrapped by their account key (research 0009, option B)            | On the server with a key it holds (option C): not end-to-end; a guide would say more than is true                                           |
| Core's Files stays core's | The page stays in the identity pages                                                                        | Moving it into an encrypted app (option D): every instance would host one more app, for nothing B does not give                             |
| The format                | RFC 0005 §1.3 as built, with a document key per file                                                        | A format of core's own: a second format for a reviewer to read                                                                              |
| The words first           | Leg 1 changes what the page and guides say, whatever happens to the rest                                    | Waiting for encryption to fix the words: the page promises too much today                                                                   |
| The kit before encryption | Everyone can keep a kit (16.20) before any file is encrypted                                                | Encrypting first: on an instance with no encrypted app nobody has a kit, so a reset by email would lose every file                          |
| Design before build       | 16.21 amends RFC 0005, and the cryptographer's review covers it                                             | Building from the research: the record's marks and the move of existing files need a design read by a reviewer                              |
| Existing files            | Encrypted by the person's own browser, after the kit, a file at a time; plain until then, and shown as such | Encrypting on the server during an upgrade: the server would hold the key; leaving them plain for ever: two kinds of file for good          |

## Prerequisites

- **Workstream 0004's leg 1 is merged** (it is: the kit's words under escrow, which 16.20 shows on the Security page).
- **The goal owner confirms the decisions above** before leg 1 starts.
- **Leg 3 waits for the RFC amendment to be accepted** (leg 2's gate).
- Nothing waits for an outside party before leg 2; the cryptographer's review of RFC 0005 is still to come and should read the amendment.

## Legs

| Leg | Name                              | Epic tasks       | Gate?                                             | Done when                            |
| --- | --------------------------------- | ---------------- | ------------------------------------------------- | ------------------------------------ |
| 1   | The words, and a kit for everyone | `16.19`, `16.20` | No                                                | Both ✅                              |
| 2   | The design                        | `16.21`          | **Yes: the goal owner accepts the RFC amendment** | 16.21 ✅, accepted                   |
| 3   | Encrypted files                   | `16.22`, `16.23` | No                                                | Both ✅, `pnpm e2e` on each database |

One leg is one branch, one draft PR, one review gate ([README](README.md#legs)). Leg 1 ships by itself and is worth having even if the rest
never runs.

## Leg detail

Read research 0009 and RFC 0005 §1.3, §3, §6 first. Each task's deliverables and checklist are in [the epic](../epics/encryption.md); what
follows is only what no single task holds.

### Leg 1 — The words, and a kit for everyone

**Epic tasks:** `16.19`, `16.20`

**Why here:** the page's empty state says files are kept "and nobody else can open them", which reads as a promise against the server.
A kit for everyone is the precondition for everything after it.

**Technical notes:** the words are in `apps/core/app/files/files-panel.tsx` (the `EmptyState` description). The kit is offered at
key release from `apps/core/app/keys/release/release-flow.tsx` (`isKitPending`, `kitKept`, `isEscrowOn` in `apps/core/src/keys/session.ts`);
the Security page reuses the same calls and `RecoveryKit`, so one kit is kept per account whichever page keeps it. The Security page needs
the browser unlocked: a locked one shows the unlock first. Follow `sv-ui-design` for both, and update core-app §5.3's decision row.

**Do not proceed if:** keeping the kit from the Security page would need a second kit record or a change to the vault's records.

### Leg 2 — The design

**Epic tasks:** `16.21`

**Why here:** research 0009 leaves the record's marks, the files key's id, the `blob:` policy and the move of existing files to an RFC.

**Technical notes:** an amendment to RFC 0005, not a new RFC: the key model is the same. Answer each item of research 0009's "To settle in
the RFC". Update `docs/rfcs/0005-review-brief.md` so the cryptographer reads the new section, and `docs/rfcs/README.md`'s row.

**Do not proceed if:** the design needs a key on the server, a new content format, or encryption inside `@sovereignfs/storage`.

### Leg 3 — Encrypted files

**Epic tasks:** `16.22`, `16.23`

**Technical notes:** `packages/storage` stays as it is: the page sends ciphertext with a length, as the template's files do (16.17), and
the store serves `application/octet-stream`. Core's routes (`apps/core/app/api/files/`) keep their checks. The CSP change is for the
Files page alone (`apps/core/src/csp.ts`). Check it live against a built core with a file larger than one chunk, as workstream 0003's leg 11
did, and the acceptance items in `apps/e2e` on each database.

**Do not proceed if:** encrypting a file needs the server to hold or see a key.

## Risks

- **A forgotten password loses files** that today survive a reset. 16.20 and the notice in 16.22 are the answer; an instance whose people
  never keep a kit and whose owner has not turned on recovery is exposed, and the page must say so plainly.
- **The move of existing files** reads and writes every file through the browser: slow for large folders, and a session that ends midway
  must leave nothing lost or doubled.
- **Seeking in a video stops working** for encrypted files (research 0009, finding 6), until a design for decrypting ranges exists.
- **Not yet audited:** like the rest of RFC 0005, until the review and the audit.

## Kill criteria

- **If leg 2's amendment is not accepted**, leg 1's words and kit stand, and core's files stay private and plainly described as not
  encrypted.
- **If a file cannot be encrypted as a stream** in the browsers core supports, without holding it whole in memory, leg 3 stops and says so;
  legs 1 and 2 stand.

## Changelog

| Version | Date     | Change                             |
| ------- | -------- | ---------------------------------- |
| 0.1     | Nov 2026 | Initial draft, from research 0009. |
