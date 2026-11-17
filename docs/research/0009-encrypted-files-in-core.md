# Research 0009 — Encrypting the files people keep in core

|                   |                                                                                                                                                                                                                                                      |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Status**        | For review                                                                                                                                                                                                                                           |
| **Date**          | November 2026                                                                                                                                                                                                                                        |
| **Author**        | Claude Code                                                                                                                                                                                                                                          |
| **Scope**         | [core-app](../specs/core-app.md) §3.4, §3.11, §4.6, §5; [RFC 0005](../rfcs/0005-end-to-end-encryption.md) §1.3, §3, §6; `packages/storage`, `packages/crypto`; [research 0006](0006-data-at-rest.md), [research 0008](0008-end-to-end-encryption.md) |
| **Versions read** | Platform 0.108.0, toolkit 0.17.1, `@sovereignfs/storage` 0.1.0                                                                                                                                                                                       |

---

## Question

Sovereign's encryption follows the model of services such as Proton: the password never reaches the server, the same password signs in
and unlocks, a recovery kit gives the data back after a reset, and the account itself (address, name, role) stays readable, because the
service must read it to work. Apps that declare `encryption` keep their content so that nobody who reads the server can read it.

Core itself keeps one kind of content: the files a person uploads on the **Files** page (core-app §4.6). They are stored as they were
sent. Should core encrypt them as an encrypted app would, so that an instance gives the same protection to the one place where core holds
content? If so, how, and what does it change for the person and for the operator?

## Method

- **The code:** core's Files page and routes (`apps/core/app/files/files-panel.tsx`, `apps/core/app/api/files/`), the store
  (`packages/storage/src/fs.ts`, `types.ts`, `response.ts`, `sign.ts`), core's key vault (`apps/core/src/keys/`), and the content
  format (`packages/crypto/src/web/content.ts`).
- **The specifications:** core-app §4.6 and §5, RFC 0005 (its non-goals, §1.3, §3, §6), research 0006 and 0008.
- **Proton's published security model**, for which kinds of data it encrypts and which it leaves readable. It is summarised here from
  what it publishes, not quoted; an RFC that relies on a detail of it cites the source.
- Nothing was built or measured for this document.

## Findings

1. **Core's files are the one content core keeps, and they are readable on the server.** Each person's files are in their folder of
   `sovereign-data`, under an id core makes, with a record beside it holding the name they gave it, the type and the size (§4.6). Anyone
   who reads the disk, a backup or the running server reads them. Research 0006 recommends full-disk encryption, which protects a disk
   taken away and not a server read while it runs.
2. **RFC 0005 left them out by not naming them.** Its non-goal is core's own _data_ (names, addresses, roles); files are content, and
   research 0008 counted files among what should be encrypted. Workstream 0004 encrypts files only in the `--encryption` app template
   (task 16.17), and its decisions keep encryption out of `@sovereignfs/storage` because the store is on the server.
3. **The page promises more than it does.** Its empty state says files are kept "and nobody else can open them". That is true of other
   people, who get `404`, and reads as a promise against the server, which it is not.
4. **Proton draws its line between content and what it needs to run.** From what it publishes: mail bodies and attachments, Drive files
   and their names, and calendar events' details are encrypted; the account's address, who a message is from and to, when, and mail
   subject lines are not. Core already draws the same line for accounts. Its files are on the content side and are not encrypted.
5. **Everything an encrypted file needs is already built.**
   - The format: RFC 0005 §1.3's chunked content (`encryptContent`, 64 KiB chunks, a header binding the id and version, a last-chunk
     flag) and `encryptBytes` for the name, type and size together.
   - The keys: core's own pages hold the person's account key for the session (core-app §5.4), wrapped twice in the browser and
     dropped when the session ends.
   - The store takes any bytes with a length, so quotas still work, and serves what it cannot recognise as
     `application/octet-stream` to download, which is right for ciphertext.
6. **What the server does with a file today, it could no longer do.**
   - **Judging the type by the bytes** (`types.ts`) and **showing images inline**: the browser decrypts and decides, from the type it
     reads inside the encrypted value. Showing an image means a `blob:` address in the page, which core's content security policy must
     allow for images on that page only.
   - **Serving a range** (`206`), which lets a video be sought in: the format's chunks can be fetched by range and decrypted one at a
     time, but a `<video>` cannot play from a range the page decrypts without a service worker or Media Source code. Core's service
     worker must never hold anything of a person (core-app §3.5), so seeking is out until a design says otherwise. A download or a
     whole-file view still works.
   - **Listing names and sorting by them** on the server: names are inside the encrypted value; the page lists and sorts after it opens
     them. Sizes and dates stay readable, as Proton leaves sizes and times.
7. **A reset by email would lock a person's files.** Today a person who forgets their password resets it by email and keeps their files.
   Once files are encrypted, the reset gives back the account and not the files, until the kit (core-app §5.3) or escrow (§5.8) opens them,
   exactly as for an encrypted app's data. This is the largest change for people, and it is why the kit matters to everyone, not only to
   people who use encrypted apps.
8. **Today a person can have no kit.** The kit is shown the first time an encrypted app asks for its key (core-app §5.3). On an instance
   with no encrypted app, nobody has one, so encrypting files without first offering the kit everywhere would turn every forgotten
   password into lost files.
9. **Apps' files are not affected.** An app's files are its own (`@sovereignfs/storage` in its own container); an app that wants them
   encrypted does it in its own pages, as task 16.17 does for the template.

## What a reader of the server sees

| Kind of data                          | Today                 | With option B (recommended)                               |
| ------------------------------------- | --------------------- | --------------------------------------------------------- |
| A file's content                      | readable              | not readable                                              |
| A file's name and type                | readable (the record) | not readable                                              |
| A file's size, its dates, whose it is | readable              | readable (the size of the ciphertext, a little larger)    |
| The account (address, name, role)     | readable              | readable, as with Proton; unchanged (RFC 0005's non-goal) |
| An encrypted app's data               | not readable          | not readable                                              |

## Options

- **A. Say what the page does, and stop there.** The page says files are private to the person and not encrypted; the operating and
  deploying guides say so. Costs one change of words. Leaves core short of what an encrypted app gives, in the one place core holds content.
- **B. Encrypt in the browser with the person's own files key, under the account key.** Core keeps one more key per person for its
  own files, made at random in the browser and wrapped by the account key like an app's key (RFC 0005 §3), under an id of its own that no
  app can register. Each file gets a document key of its own, wrapped by the files key, and its content is RFC 0005 §1.3's format. Nothing
  new in the format, and no key on the server. Sharing a file later is the document key sealed to another person, as an app shares.
- **C. Encrypt on the server with a key the server holds.** Each file encrypted at rest with a key from `SV_FIELD_ENCRYPTION_KEYS` or
  the instance's own. Protects a stolen disk or backup that does not carry the key, and nothing against someone who reads the running
  server or its environment. Research 0006 already weighed this kind of protection; it is not end-to-end and would let a guide say more
  than is true.
- **D. Make core's Files an app.** Move the page into an encrypted Sovereign app of its own that gets its key through key release. The
  most consistent, and a large move for a page that is part of the identity pages; it also needs the app to be hosted on every instance.

## Recommendation: A now; B as an RFC, after a kit for everyone

1. **A at once**, whatever is decided about B: the empty state and the guides say files are private and not encrypted, so nothing
   promises more than is true. It is a change of words.
2. **A kit for everyone first.** The Security page offers the recovery kit to anyone who has not kept one, at any time, with key release
   still showing it to someone who has not by the time an encrypted app asks. Without this, B turns forgotten passwords into lost files.
3. **Then B, designed as an amendment to RFC 0005** (a new section for core's own content, and its non-goals made precise: account data
   stays readable, content does not), reviewed with the rest of RFC 0005 by the cryptographer.
   - **New files** are encrypted in the browser once B ships. A browser that is locked shows `LockedState` and the unlock, as an
     encrypted app does.
   - **Existing files** are encrypted in the browser, by the person's own page, on their next visit after they keep their kit: the
     page reads each plain file, writes it encrypted under a new id, and deletes the plain one, saying how far it has got. Until then they
     stay plain, and the page says which are.
   - **The person is told** before their first encrypted upload that a reset by email gives back the account and not the files unless
     they kept the kit, or the owner turned on recovery.
   - **The server** keeps ciphertext with a length, and the record holds only the size, the dates and that the file is encrypted.

D is not recommended: it moves a page every person uses into an app the operator must host, to gain nothing B does not give.
C is not recommended: it is the protection research 0006 already describes, and it is not what Proton's model promises.

## Not now

- Seeking in an encrypted video, and any decryption in the service worker.
- Thumbnails or previews made on the server.
- Sharing a core file with another person (B leaves room for it).
- Encrypting account data: RFC 0005's non-goal stands.

## To settle in the RFC

- The files key's id, and how it is kept apart from every app's client id.
- How the record marks a file encrypted, and how the page tells a plain file from an encrypted one during the move.
- The content security policy for `blob:` images on the Files page alone.
- What the move of existing files does when a session ends midway, and how it is resumed without a file being lost or kept twice.
- Whether an instance can turn B off, and what the page says when it is off.
- The acceptance items, in the manner of core-app §5.10.

## Changelog

| Date       | Change         |
| ---------- | -------------- |
| 2026-11-17 | First version. |
