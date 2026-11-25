# Research 0015 — Proton Drive as a backup destination

|            |                                                                                                                                                                                 |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Status** | For review                                                                                                                                                                      |
| **Date**   | November 2026                                                                                                                                                                   |
| **Author** | Claude Code (with `kasunben`)                                                                                                                                                   |
| **Scope**  | [operator-cli §10.2.2](../specs/operator-cli.md), `contracts/suite.md` §1.8, [RFC 0008](../rfcs/0008-exports-and-backups.md), tasks 13.17 and 13.18; Proton's Drive SDK and CLI |

---

## Question

Backups should be able to leave the server through more than one kind of destination. The first two on the table are a git repository
(specified) and Proton Drive, for which Proton now publishes an SDK. Can Proton Drive be a destination, through the SDK or through
Proton's own CLI, what does it not allow, and what should the destination contract hold so that either fits?

## Method

- **The repository:** the backup code (`tools/cli/src/apply/backup.ts`, `tools/cli/src/commands/backup.ts`), the destination text in
  operator-cli §10.2.2 and `contracts/suite.md` §1.8, RFC 0008, and tasks 13.17 and 13.18 in the operator-cli epic. `git log --all -S`
  for `SV_BACKUP_GIT_KEY`, and a search for destination code on every branch.
- **Proton's repository** (`github.com/ProtonDriveApps/sdk`, shallow clone, head `39933bb` of 2026-11-19): the top README, the
  TypeScript client (`client/js`, public interfaces, upload, errors, changelog), the sign-in code (`incubating/account/js`) and the CLI
  (`cli/`, v0.9.0 of 2026-10-05).
- **The npm packages**, packed and unpacked, not installed or run: `@protontech/drive-sdk` 0.24.0 and `@protontech/crypto` 2.2.0.
  `proton-drive-sdk-account` is not on npm (404).
- **Not done:** nothing was run. The SDK was not imported under Node, the CLI binary was not downloaded, and no account was used. Every
  statement about behaviour is from source and is marked where it is a guess. Numbers the server enforces (file size, quota, rate
  limits, session lifetime) are not in either repository and are unknown here.

## Findings

### 1. What exists in Sovereign is the archive, not a destination

`sv backup` makes one archive, encrypted to the operator's age recipients and not the server's own key, and keeps it in `.backups/` (or
at `--to PATH`). No code sends it anywhere. Destinations are specified (§10.2.2, §1.8: `s3`, `git`, `sftp`, with `schedule`, `at` and
`keep`) and tasks 13.17 (`suite.yml` `backup`, `sv-backup`, S3, `sv backups`, `sv restore --from`) and 13.18 (git and SFTP) are 📋. The
only commit that names `SV_BACKUP_GIT_KEY` is the one that wrote the specification.

The documents disagree on order: RFC 0008 says git and SFTP are built first and S3 after; the epic builds S3 in 13.17 and makes 13.18
depend on it. Either way, 13.17 is where the destination contract is first written, and it is the place to decide what a provider is.

What a destination must hold is already fixed by §10.2.2, and is the test for any provider:

- it receives only the encrypted archive, so it need not be trusted;
- its credential SHOULD write and nothing more;
- `keep` deletes older backups, and `keep: 0` needs no permission to delete;
- `sv restore --from` reads it with the operator's own access, never the server's.

### 2. The Proton Drive SDK

**What it is.** A TypeScript client (`@protontech/drive-sdk`, MIT, compiled JavaScript shipped) with the same implementation Proton's own
apps use, plus C# and Kotlin and Swift bindings. It handles Drive's encryption and metadata.

**What it can do.** Stream an upload with an expected size and SHA-1, which it checks; upload in 4 MiB blocks with retries and bounded
concurrency; create folders; list a folder; trash; delete trashed nodes permanently; and manage "devices" (the Computers section), which
fit a backup source. Rate limits are a typed error (`RateLimitedError`), and quota and file-size refusals are typed too
(`INSUFFICIENT_QUOTA`, `MAX_FILE_SIZE_FOR_FREE_USER`). A name that already exists is rejected, so a timestamped name per backup avoids
conflicts. There is no part limit like git's 95 MB.

**What it states about itself** (top-level README):

- It "is not yet ready for third-party production use". Personal, non-commercial projects are allowed, under rules: use the SDK, go to
  the official endpoints, send an honest `x-pm-appversion` (`external-drive-<name>@<semver>-<channel>`), use events and not polling, no
  Proton branding, and say "This is a third-party application not officially supported by Proton" wherever account details are asked for.
  A toolkit that operators install and run is the case "commercial or production third-party" speaks to, or at least cannot be shown not
  to be.
- The interface "may still change".
- A new cryptographic model is targeted for the end of 2026 or early 2027: a client implementing only the old one, "including older SDK
  releases", will not interoperate until upgraded. That is the next weeks to months. A toolkit image pinned by digest to an SDK version
  would stop working on a date it does not control.
- It has no sign-in, no session management and no address provider. Those are in `incubating/account/js`, which Proton says is a
  temporary solution and is not published.

**What using it as a library in `sv-backup` costs.**

| Piece               | Finding                                                                                                                                                                                                                                                                        |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Sign-in and session | Write or vendor the account module. The usable flow is a browser "fork": the server prints a URL, the operator opens it anywhere, the server polls for up to 10 minutes. The password flow has no 2FA or CAPTCHA step                                                          |
| Refresh             | A refresh returns a new refresh token, which the client stores; any 4xx but 429 signs the session out. The credential is state the backup writes, not a secret entered once (`contracts/suite.md` §3)                                                                          |
| Crypto              | `@protontech/crypto` is a required peer, **GPL-3.0**, and ships TypeScript source only (its exports point at `.ts`). Node does not strip types inside `node_modules`, so it must be bundled. Proton's CLI applies a patch to it (it swaps `openpgp/lightweight` for `openpgp`) |
| Node                | The SDK uses `Uint8Array.prototype.toBase64`/`fromHex`, which Node 24.18 lacks (checked), so a polyfill is needed                                                                                                                                                              |
| Native parts        | `@boltffi/runtime` declares no OS or CPU; whether it is pure WebAssembly was not checked                                                                                                                                                                                       |
| Licence             | MIT SDK, GPL-3.0 crypto. `tools/cli` is AGPL-3.0-or-later, which can combine with GPL-3.0; the MPL-2.0 packages must not depend on it, so any integration stays in `tools/cli`                                                                                                 |

### 3. The credential cannot be scoped

A Proton session is the whole account: it reads, writes and deletes everything in the Drive, and the stored user key password decrypts
it. There is no write-only key, no folder-scoped key and no app password in either repository. That breaks the "SHOULD be able to write
and nothing more" rule for any Proton provider, SDK or CLI. A server that is taken over holds a credential that can read or delete every
file in that Drive, not only the backups, and the backups themselves are only as exposed as the encrypted archive allows. Retention is
also not write-only: `keep` needs permanent delete, which only the owner can do and only on trashed nodes. `emptyTrash()` empties the
whole account's trash and must never be used.

The mitigation is a Proton account that holds nothing else, and saying so at setup. It does not make the credential narrower.

### 4. Proton's CLI

**What it is.** `proton-drive` (v0.9.0, a Bun-compiled single binary, released from `proton.me/download/drive/cli`, built from the same
repository). It uses the SDK and carries the account code, caches and crypto inside. Its README presents "script backups, uploads,
downloads" as a use.

**What it gives.**

- **Sign-in and refresh are done.** `auth login --json` prints `{"signInUrl": …}` and waits; the session, with its refresh token and
  the key password, is kept in a credentials store and rewritten when a refresh rotates it.
- **Upload covers the case.** `filesystem upload LOCAL… PARENT` takes a path under My files, Devices or Shared with me, with conflict
  strategies and a skip of identical content; `list`, `trash`, `delete` (trashed items only), `download` and `--json` exist.
- **It sends Proton's own `x-pm-appversion`**, and updates are Proton's to ship, including the cryptographic migration.
- **It runs where the operator is.** On macOS and Windows it uses the real keychain, so `sv restore --from` can run it on the operator's
  machine with the operator's own login, as §10.2.2 requires.

**What it does not give.**

| Concern                      | Finding                                                                                                                                                                                                                                                 |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Credential store on a server | `keychain` needs libsecret and a bus; `pass` needs a GPG setup; `unsafe_file` is a plaintext file in `PROTON_DRIVE_CACHE_DIR`, labelled "do not use, for testing only". Unattended backups need the session readable by the server whichever is used    |
| Telling failures apart       | Errors exit `1` (`2` only for the REPL's exit), including "You need to login first". An expired session, a full quota and a network error must be told apart from the text or the `--json` output, whose error shape was not checked                    |
| Distribution                 | Downloaded from Proton's site; whether it is signed or checksummed was not checked. We would pin its sha256. The README lists Linux x64 and x64-baseline; arm64 and musl builds are unknown. Core's image is Alpine, so it needs a container of its own |
| Maturity                     | Pre-1.0, and "private" in its own `package.json`                                                                                                                                                                                                        |
| Resuming                     | Whether a failed large upload resumes in a new process, or starts again, is unknown                                                                                                                                                                     |
| Scoped credential            | As §3                                                                                                                                                                                                                                                   |

### 5. The two routes compared

|                                  | SDK as a library in `sv-backup`                                                | Proton's CLI as a spawned binary                                                                                 |
| -------------------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| Sign-in, refresh, crypto, caches | Ours to write, vendor and bundle                                               | Inside the binary                                                                                                |
| Runtime                          | Node 24 with a polyfill, a bundled GPL-3.0 TypeScript dependency               | A Bun binary; a glibc container of its own                                                                       |
| Following the crypto migration   | A port and a release of ours, before the date                                  | A new binary version                                                                                             |
| Terms                            | Third-party SDK rules apply to us; the README says production use is not ready | Proton's own client and identifier; the CLI's own terms were not read                                            |
| Control and errors               | Typed errors, progress, exact API                                              | Exit `1` and text or JSON; a process per call                                                                    |
| Supply chain                     | npm packages, pinned and locked                                                | A downloaded binary, pinned by our own sha256                                                                    |
| Fit with the repository's rules  | A library call                                                                 | Same shape as the git destination: a spawned process, credentials through the environment, arguments as an array |

The credential problem (§3) is the same in both.

### 6. A route that needs no code: a synced folder on the operator's machine

`sv backup --to PATH` already writes the encrypted archive to any path. If that path is inside a folder that Proton's own sync app
keeps in Drive, the archive reaches Proton Drive with Proton's own sign-in, scoping and terms, and nothing of Proton's is in Sovereign.
It is not a destination: nothing leaves the server on its own, there is no schedule on the server and no `keep`. It covers an operator
who takes backups from their own machine. Whether Proton's sync app exists for the operator's platform was not checked.

## Options

1. **Proton through the SDK, built into `sv-backup`.** Most control, most work, and the date risk of the migration is ours.
2. **Proton through the CLI, a sidecar container.** Less to write, follows Proton's releases, and an awkward credential and error
   surface; experimental.
3. **Only the provider contract now; Proton later.** The contract in 13.17 holds what Proton needs (below), git and the others are built
   to it, and Proton waits for the migration and for third-party use to be official.
4. **Proton through a synced folder (§6).** No work, no unattended backup.

## Recommendation

- **Do 3 now, and mention 4 in the docs.** Proton Drive is not a first supported provider: it is "not ready for third-party production
  use" by its authors, its crypto changes within weeks, and its credential cannot meet §10.2.2's scoping rule.
- **If Proton is wanted, take 2, as an experimental provider** behind a spike, and add `proton` to the `suite.yml` schema only after the
  spike. It removes the account code, the bundling and the migration port, and it runs as a spawned process like git. The SDK route (1)
  is the fallback if the CLI proves unusable headless.
- **Write the contract so that Proton fits.** Beyond put, list, get and delete, a provider declares:

| Capability                       | git / s3 / sftp                     | Proton                                                             |
| -------------------------------- | ----------------------------------- | ------------------------------------------------------------------ |
| Credential kind                  | a static secret the operator enters | state the provider rewrites, kept in a volume of its own           |
| Setup                            | none                                | an interactive login (URL shown, operator signs in elsewhere)      |
| Can the credential be write-only | yes                                 | no; setup says so and asks for a dedicated account                 |
| Largest object                   | git: parts of 95 MB                 | none known; the server's limits are unknown                        |
| Health states                    | reachable, refused                  | also: signed out, quota full; shown in `sv status` and `sv doctor` |
| Restore access                   | the operator's own                  | the operator's own login on their machine                          |

One backup at a time for a provider whose credential rotates.

- **Keep it in `tools/cli`.** The integration is AGPL territory because of GPL-3.0 in the SDK route's dependencies, and the repository's
  rule for spawned tools (no value from a request in a shell string, credentials through the environment) applies unchanged to the CLI.

## The spike, if Proton goes ahead

In a glibc container, with a Proton account that holds nothing else:

1. `auth login --json` headless; open the URL on another machine; confirm the session is stored.
2. Upload a 500 MB encrypted archive into a device folder; download it on another machine and decrypt it with `sv restore`.
3. List, trash and permanently delete one backup, leaving the rest; never `empty-trash`.
4. Record what each failure looks like (signed out, quota full, offline): exit code, text, and `--json`.
5. Leave the session idle for weeks and see whether it survives; confirm a rotated token is kept.
6. Read the CLI's terms and find whether its download is signed.
7. Under Node 24, bundle the SDK and run one upload, if option 1 is still in play.

Success means a backup taken by a schedule reaches Proton Drive with no one present, is restored on another machine, and a failure
shows in `sv status` within one run.

## Not decided here

- The file-size, quota and rate limits of each Proton plan, and how long an idle session lives.
- Whether the SDK or the CLI will be offered to third parties on general availability, and on what terms.
- Whether Proton's sync app covers the operator's platform (§6).
- The destination contract itself: it belongs in the specification and in RFC 0008's follow-up, not in this document.
