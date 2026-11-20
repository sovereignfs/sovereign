# RFC 0008 — Exports now, backups to a destination next

|              |                                                                                                                                                                                                 |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Status**   | Accepted (milestone 1 planned in workstream 0009; milestone 2 is tasks 13.17 and 13.18)                                                                                                         |
| **Date**     | November 2026                                                                                                                                                                                   |
| **Author**   | Claude Code, for review                                                                                                                                                                         |
| **Scope**    | `docs/specs/core-app.md` §2, §4.4, a new section for exports; `contracts/app-manifest.md`; `docs/specs/sdk.md` §9; `docs/specs/operator-cli.md` §9, §10.2.2; a shared package; the app template |
| **Research** | None: the design followed from a review of the developer's proposal against core-app §4.4 and operator-cli §10.2                                                                                |
| **Tasks**    | [18.1 to 18.7](../epics/exports.md); [workstream 0009](../workstreams/0009-exports.md); milestone 2: [13.17, 13.18](../epics/operator-cli.md)                                                   |

## Summary

**Milestone 1, exports on demand.** Nothing is sent anywhere; everything is a download.

1. **An operator's export.** The owner downloads core's data from Console > Data: its database records and its folder of people's files,
   in one archive encrypted to the operator's age recipients. The server writes it and cannot read it. An app does the same from its own
   Console > Data, its first account being its operator when it runs without core.
2. **A person's export.** Anyone downloads their own data from Account > Data: what core holds of them and what each app they use holds,
   which core asks each app for. It is theirs and is not encrypted.
3. **What is at rest is what is exported.** Data a person keeps end-to-end encrypted (RFC 0005) is exported as the ciphertext it is, with
   their vault records; data not yet encrypted is exported as stored. An export never adds a layer of its own for a person.
4. **One format and one package**, used by core and by every app, with no core needed.

**Milestone 2, backups to a destination (deferred).** `sv` sends its backups on a schedule to a git repository or a machine over SSH, as
operator-cli §10.2.2 already says, and the Console shows how they stand. Restoring from an export comes after.

`sv backup` stays the instance's backup. An export is a portable copy, not a way to restore an instance.

## Motivation

People and operators ask for a copy of their data they can hold. Today:

- **An operator** has `sv backup` (operator-cli §10.2): complete, encrypted to their key, and restorable, but only from a terminal with
  the instance repository, and only as a whole instance or by app. Someone who runs core without `sv`, or an app on its own, has nothing.
- **A person** has no copy at all. core-app §2 lists export under "Later", unspecified.
- **An app** that runs alone (sdk §9.5) has no export for its operator or its people, and every app would otherwise write its own.

Destinations and schedules, which make a backup leave the server on its own, are specified and not built (tasks 13.17, 13.18).

## Current state

- core-app §4.4: core makes no backup of its own; `sv backup` is the only one; **the Console shows nothing about backups**. This RFC
  revises the last point only.
- operator-cli §10.2: an archive (`backup.json` first, a dump of each database, volumes, `state.json`, the generated secrets, people's
  files) encrypted with age to `secrets.recipients`, never to the server's own key. §9.4 adds an offline recovery key to those recipients.
- operator-cli §10.2.2 and `contracts/suite.md` §1.8: `backup.destination` (`s3`, `git`, `sftp`), `schedule`, `keep`. Not built.
- RFC 0005 and core-app §5: a person's keys are made and opened only in the browser; core keeps wrapped keys and public keys in the vault
  (`key_accounts`, `key_apps`, `key_wraps`). Escrow (§5.8) shows the pattern of an operator's public key pasted into the Console while its
  private half stays offline.
- core-app §4.5: core already calls apps, with a signed token (`account-deleted+jwt`) at an address the app declares
  (`accountDeleted`, app-manifest §2.1), verified by the SDK's handler (sdk §9.1).

## Goals

- An owner can download core's data without `sv`, in a file only they can open.
- A person can download everything of theirs, from core and from every app they use, in one archive, from one page.
- An app has the same two exports, whether core hosts it or not, from shared code.
- One format, versioned, with a manifest and checksums, so that a later import and a later destination need no new one.

## Non-goals

- **Restoring or importing.** Milestone 1 makes downloads only. An instance is restored with `sv restore`.
- **Sending anything anywhere.** No git, no SSH, no schedule in milestone 1.
- **Making end-to-end encryption the default for every app.** That is a migration of its own, with a mandatory recovery kit and the
  audit RFC 0005 still waits for. It gets its own RFC; this one relies on it as it lands, and works before it does.
- **An export of the whole instance from the Console.** Core reaches only its own database and its own folder of `sovereign-data` (no
  Docker socket, no other app's database, no `secrets/`). The instance is `sv`'s.

## Design — milestone 1

### 1. What is at rest is what is exported

An export copies records as they are stored.

- Data a person keeps end-to-end encrypted is ciphertext on the server and ciphertext in the export. Their vault records go with it, so the
  export stays usable with their own password, passkey, kit or escrow way in. The operator cannot read it in either place.
- Data not yet end-to-end encrypted (a person who has not opened an encrypted app, an app that does not use encryption) is exported as
  stored.
- An export **never** seals a person's server-readable data to that person's public key. It could (RFC 0005 gives people HPKE public keys),
  but then only each person could open their part, and an operator's export could never be restored by the operator.

As more data becomes end-to-end encrypted, an operator's export holds less that anyone can read, with no change to this design.

### 2. The format

One format for every export, core's and every app's.

- **An uncompressed `.tar`**, written as a stream and never held whole in memory, whose first entry is `export.json`:

  ```json
  {
    "format": 1,
    "kind": "instance" | "app" | "person",
    "instance": { "id": "…", "url": "https://sovereign.example.org" },
    "app": "tusk",
    "sub": "…",
    "takenAt": "2026-11-20T10:00:00Z",
    "versions": { "core": "0.77.0", "tusk": "1.4.0" },
    "parts": [
      { "name": "core", "path": "core/", "status": "complete" },
      { "name": "tusk", "path": "apps/tusk/", "status": "complete" },
      { "name": "ledger", "path": "apps/ledger/", "status": "missing", "reason": "unreachable" }
    ],
    "files": [{ "path": "core/records/profile.json", "sha256": "…", "bytes": 1234 }]
  }
  ```

  `app` is present for `kind: "app"`, `sub` for `kind: "person"`. The instance is named by its id as well as its address, since an
  address can change.

- **Records** are JSON, one file per kind of record (`records/<kind>.json`, or `.jsonl` when large); **files** are under `files/`, in the
  layout `@sovereignfs/storage` keeps them. Each record of end-to-end ciphertext is exported as its stored envelope and marked as such in
  its record kind's entry.
- **The manifest is checked**: every file listed, with its SHA-256; no file not listed; no path outside the archive. A reader refuses a
  `format` it does not know.
- A person's export is offered as a `.zip` of the same tree as well, since people open zips. Which is offered by default is a question for
  review ([Open questions](#open-questions)).

### 3. The package

`@sovereignfs/export`, a new shared package (published, since apps that run alone need it): the format's writer and reader, the manifest's
check, the encrypting stream, and the handler an app gives core (§6). It imports nothing of core's and works with no core present, as
`packages/*` must. Its writer takes records and file streams from the caller; it never reads a database itself.

### 4. The operator's export

**The key.** The export is encrypted with **age** to one or more X25519 recipients (`age1…`), the same kind of key `sv` already keeps in
`secrets.recipients` (operator-cli §9.1, §9.4).

- The owner pastes the recipients into Console > Data > Export: an instance setting, changed only by `InstanceManager` with the owner-only
  `instance:configure-secrets`, checked for its shape there. They are public keys; the private halves never reach the server.
- `sv key export` prints the instance's recipients (the operator's key and any recovery key) as the line to paste, as `sv key escrow`
  prints its key (operator-cli §9.5). Someone without `sv` pastes any age recipient they hold.
- **Without recipients there is no operator export**, and the page says how to set them.
- The file is opened with `age -d -i KEY`, or `sv export open FILE`, on the operator's machine.

**Who and how.** A new owner-only capability, `instance:export`. The action calls `requireCapability`, asks for the password again through
`confirmPassword`, and records the export (who, when, the recipients' fingerprints) in core's log.

**What it holds.** `kind: "instance"`; core's part only:

- core's database records: accounts, roles and the matrix, apps as registered (secrets as the stored hashes), consents, invitations,
  instance settings (an SMTP password as its stored ciphertext), notifications, activity, deletion records, and the vault's records as
  stored;
- core's folder of `sovereign-data`.

It leaves out sessions, verification and reset tokens, access and refresh tokens and their revocations: what a restore would have to end
again (core-app §4.4). Apps' data is not in it; each app has its own export (§6), and the instance as a whole is `sv backup`'s.

**Running it.** A background job, like the deletion and logout schedulers (`apps/core/src/accounts/deletion-scheduler.ts`): the file is
written under core's state, encrypted as it is written, never in the clear on disk. When it is done the owner is told (a notification),
and the download works once, for the session that asked, within an hour; then the file is deleted. One operator export runs at a time.

### 5. A person's export

**Who and where.** Account > Data > Download my data, for the session's own account, never one named in a request. It asks for the password
again, since the archive carries everything of the person.

**Core's part.** Profile, preferences, email addresses, connected apps and their consents, notifications, activity, the person's files,
and their vault records (wrapped keys and public keys, as stored). **Never**: the password's stored hash, TOTP secrets, backup codes,
passkeys' credentials, sessions or tokens.

**Apps' parts.** For each app the person has used (the same sense as core-app §4.5's "who is told"):

- An app that declares an `export` address in its manifest (§6) is asked for the person's part. Core sends a `POST` with the form field
  `export_request_token`, a JWT typed `export-request+jwt`, signed with the key that signs logout tokens, carrying `iss`, `aud` (the app's
  client ID), `sub`, `iat`, an `exp` two minutes on and a fresh `jti`, and nothing else of the person. One signed-token pattern, the same as
  §4.5's.
- The app answers `200` with its part as a stream in the format (§2, `kind: "app"`, `sub` set), which core checks against its manifest and
  places under `apps/<name>/`. A redirect is not followed. Each app is given a time limit and a size limit, both settings of core's.
- An app that declares no address, or fails, or answers with something that fails the check, is listed in `export.json` with
  `status: "missing"` and a reason, and the person is told which.

**Running it.** A background job as in §4, one per person at a time; the person is notified and downloads it once, from their session,
within an hour. It is not encrypted: it is the person's, made in their session, and they choose where it goes.

### 6. Apps

- **Manifest 5** adds one field under `signIn`, `export`: the path core posts an export request to, held to the rules of `signIn`'s paths
  (app-manifest §2.1). `sv app add` registers it as the app's export address, as it does `accountDeleted`; the Console shows it in the app's
  technical settings.
- **The SDK** gains the handler: framework-free, like the logout and account-deleted handlers (sdk §9.1). It verifies core's token as
  §9.2 does, refuses a replayed `jti`, and calls the app's own function with the `sub` to stream the app's part through
  `@sovereignfs/export`.
- **An app that runs alone** (sdk §9.5) uses the package directly:
  - Console > Data for its operator (the first account made in the app, which this RFC makes its operator): the app's export, `kind: "app"`, encrypted to
    the recipients its operator pastes, as in §4;
  - Account > Data for each person: their part, not encrypted, as in §5.
- **The template** (`tools/create`) ships both pages, the export handler and the manifest field.

### 7. Security and privacy

- **The server cannot read an operator's export.** It writes it to age recipients whose private halves it never holds.
- **A person's export is in the clear by design**, made only for the session's own account after the password, offered once and deleted.
- **Every route and action authorizes inside** (`requireCapability`, `requireSignedIn`) and every route that changes something calls
  `requireSameOrigin`. A download is `Cache-Control: no-store`, and the service worker never stores it (it stores only its allow-list).
- **Core calls only apps' registered addresses**, the origins `ClientRegistry` holds, never an address from a request; each call has a
  timeout and a size limit, and core holds the app's answer on disk, not in memory.
- **What an export holds of deleted people.** An operator's export keeps the people who were there when it was taken, as a backup does;
  the Console says so before the export starts.
- **Ciphertext stays ciphertext.** No export opens a person's key or a record of end-to-end encrypted data; the vault's records are copied
  as stored.

## Design — milestone 2 (direction; not built in this RFC's tasks)

1. **Destinations and schedules in `sv`**: tasks 13.17 and 13.18, with `git` and `sftp` built first and `s3` after. For git, as
   operator-cli §10.2.2 says: a repository kept for backups alone, never the instance's own; one commit with no parent per backup, on its
   own branch `backup/<timestamp>`, so that deleting the branch frees what it held; parts of at most 95 MB with their SHA-256; a deploy key
   for that repository alone. For SFTP, a directory reached over SSH with its host key pinned. Retention by `keep`.
2. **The Console shows the backups `sv` takes**: when the last one was taken and sent, and whether one failed, and can ask `sv-backup` to
   take one now. Core has no Docker socket, so the two need a bridge, chosen when this is specified: a status file and a request row in a
   volume both mount, or an address on `sv-backup` reached with the one signed-token pattern.
3. **A person's export to their own repository**: an encrypted per-person credential kept by core, an address that must be `https` and
   resolve only to public addresses, credentials given to `git` through its environment, never its arguments, and `git` in the image (a
   Docker change).
4. **Import**: a person's export into another instance, and core restored from an operator's export. Each needs its own design: a `sub`
   is the instance's, passkeys are bound to the domain, and a restore must end what it brings back (core-app §4.4).

## Alternatives considered

- **Core backs up the instance itself, from the Console, to git.** Core cannot reach other apps' databases or `secrets/`, and a second
  backup tool would overlap `sv`'s and be wrong about the keys, which is why core-app §4.4 decided against it.
- **A JSON copy of the settings, pushed to git with a token.** Not restorable (no database, no `SV_AUTH_SECRET`, no key ring), readable by
  anyone with the repository, and git keeps every byte even after old copies are deleted.
- **Sealing each person's data to their own key in an operator's export.** Then no operator could restore it (§1).
- **Encrypting the operator's export with a key derived from the server's own secrets.** It needs no setup, but the server can read the
  file, and anyone who has the server has every export.

## Testing

- The format: a written archive passes its own check; a changed byte, a missing file, an unlisted file and a path outside the archive each
  fail it; an unknown `format` is refused.
- The operator's export opens with the operator's age identity and not with any key the server holds; it is refused without
  `instance:export`, without the password, and without recipients; nothing in the clear is ever on disk.
- A person's export holds none of the excluded secrets (a test that lists the columns it may carry fails when a table gains one);
  end-to-end ciphertext in the archive equals what is stored; an app that does not answer is listed as missing, and the rest is complete.
- The handler refuses a token for another app, an expired one and a replayed `jti`.
- Every new route and action is caught by the existing tests that check `requireCapability`, `requireSignedIn` and `requireSameOrigin`.

## Rollout

Milestone 1 in the order below; each task is usable when it lands. Milestone 2 follows 13.17 and 13.18 and is specified in its own
change to operator-cli and core-app.

## Tasks

Proposed for a new epic, "Exports", once this RFC is accepted:

1. **The format and the package** `[parallel]`: `@sovereignfs/export` (writer, reader, the manifest's check, the age stream).
2. **The operator's recipients**: the instance setting, Console > Data > Export's key field, `sv key export` and `sv export open`.
3. **The operator's export in core**: `instance:export`, the job, the download, the notification.
4. **A person's export in core**: Account > Data, core's part, the job, the download.
5. **Apps' part**: manifest 5's `export`, `sv app add` and the Console's technical settings, core's requests to apps, the SDK's handler.
6. **The template**: both pages, the handler and the manifest field, for apps hosted by core and apps that run alone.

Milestone 2: 13.17 and 13.18 (git and SFTP first), then the Console's view of `sv`'s backups, then a person's export to their repository.

Alongside: a separate RFC for end-to-end encryption by default in every app.

## Spec changes on acceptance

- **core-app**: §2 (export moves out of "Later"); §4.4 (the Console may export core's data; `sv backup` stays the instance's backup);
  a new section for exports; the operator's recipients as an instance setting; `instance:export` in the matrix.
- **contracts/app-manifest.md**: manifest 5, `signIn.export`. **contracts/core-api/**: nothing, since core calls the app, as for §4.5.
- **sdk.md** §9.1: the export handler.
- **operator-cli.md** §9: `sv key export`, `sv export open`. §10.2.2 and `contracts/suite.md` §1.8 are unchanged by milestone 1.

## Settled on acceptance

Accepted on 2026-11-20. The open questions were settled as follows, and are locked in [workstream 0009](../workstreams/0009-exports.md):

1. A person's export is a `.zip` by default, and a `.tar` on request.
2. Only the owner takes an operator's export (`instance:export` is owner-only).
3. The package is `@sovereignfs/export`.
4. A person's export is not encrypted in milestone 1; a passphrase is a later choice.

The format is written once, in `contracts/export.md` (task 18.1), rather than in core-app alone, since apps implement it too.
