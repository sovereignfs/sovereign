# Research 0006 — What someone with the server's disk can read

|                   |                                                                                                                                                                                                                                                                                                                     |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Status**        | Recommended; for review                                                                                                                                                                                                                                                                                             |
| **Date**          | November 2026                                                                                                                                                                                                                                                                                                       |
| **Author**        | Claude Code                                                                                                                                                                                                                                                                                                         |
| **Scope**         | [core-app](../specs/core-app.md) §3.3, §3.4.1, §3.5, §3.6.1, §3.15, §4.4, §4.6; [operator-cli](../specs/operator-cli.md) §6.4, §7, §9, §10; [`contracts/env.md`](../../contracts/env.md); `packages/crypto`, `packages/storage`, `packages/database`; [deploying](../deploying.md) and [operating](../operating.md) |
| **Versions read** | Platform 0.97.0, toolkit 0.12.0, better-auth and `@better-auth/oauth-provider` 1.7.13                                                                                                                                                                                                                               |

---

## Question

Core keeps people's accounts: their names, email addresses and sign-in secrets, which apps they use, and the files they upload. Someone
may get to read the disk of the server it runs on: root on the running server, an intruder who became root, the hosting provider through a
snapshot or the hypervisor, a host-level backup, or a disk that was stolen or not wiped when the server was retired. What can each of them
read today, what does core's encryption protect and against whom, and what should the suite do so that people's data is protected in the
cases where it reasonably can be?

## Method

- **The code:** what core stores and how (`apps/core/src/db/schema/*`, `src/auth/auth.ts`, `src/oauth/provider.ts`,
  `src/settings/store.ts`, `src/files/`), the field cipher (`packages/crypto/src/field-cipher.ts`, `keyring.ts`), how the database is
  reached (`packages/database/src/database.ts`), and what the toolkit puts on the server and in a backup (`tools/cli/src/apply/backup.ts`,
  `src/secrets/`, operator-cli §6.4 and §7).
- **better-auth 1.7.13's source**, for how it stores sessions (`dist/db/internal-adapter.mjs`), verification identifiers
  (`dist/db/verification-token-storage.mjs`), password hashes (`dist/crypto/password.mjs`) and its secrets (`dist/context/secret-utils.mjs`).
- **The guides**, for what an operator is told about protecting the server's disk.

**Not done:** no attack was tried on a disk image; full-disk encryption was not set up on any hosting provider; no key service (cloud KMS,
Vault, a TPM) was tried; better-auth's versioned secrets were read, not exercised against core's stored data.

## Findings

1. **The databases are plain on the disk.** Whether core runs on a SQLite file, PostgreSQL's data folder or sqld's, a reader of the disk
   reads, with no key:
   - every account: name, email address, role, time zone, the terms accepted and when, the profile picture (stored as a row, §3.15);
   - every session: when it was made and last used, its IP address and user agent (better-auth's `sessions` columns);
   - which apps each person allowed (consents), invitations, and the deletion ledger's `sub`s;
   - what apps told people: the text of notifications and activity entries (§4.1, §4.3);
   - and, on an instance, every app's own database on the same server.
2. **People's files are plain on the disk.** `@sovereignfs/storage` keeps each upload as a file in the `sovereign-data` volume
   (`/data/s3/<name>` in each container, operator-cli §6.4.6), named by the person's `sub` and an id the store made. The name a person gave
   it is in a record beside it.
3. **Core's secrets are hashed or encrypted, each against a different reader:**

   | Kept           | How                                                                               | A reader of the database alone      |
   | -------------- | --------------------------------------------------------------------------------- | ----------------------------------- |
   | Passwords      | scrypt (better-auth's `hashPassword`, held to the policy by `policedHash`)        | can try to crack weak ones, offline |
   | Client secrets | hashed (`storeClientSecret: 'hashed'`)                                            | cannot recover them                 |
   | App tokens     | hashed (the provider's default)                                                   | cannot recover them                 |
   | TOTP, codes    | encrypted by better-auth with `SV_AUTH_SECRET` (§3.4.1)                           | cannot read them                    |
   | Signing keys   | private half encrypted by better-auth with `SV_AUTH_SECRET` (§3.6.1)              | cannot read them                    |
   | SMTP password  | AES-256-GCM, 12-byte random nonce, bound to its setting and key id (field cipher) | cannot read it                      |
   | Session tokens | **plain** (`token: generateId(32)`); the cookie is signed with `SV_AUTH_SECRET`   | cannot use one without the secret   |
   | Reset links    | **plain**: core does not set `verification.storeIdentifier: 'hashed'`             | can use one while it is valid       |

4. **The keys are on the same disk as the data.** On an instance the decrypted secrets are files in `/var/lib/sovereign/secrets/` (the
   directory `0700`, root only), mounted into containers at `/run/secrets/<NAME>` (operator-cli §6.4.1, §7, §9), and the server's own age key,
   which decrypts what a deployment sends, is `/var/lib/sovereign/age.key`. A reader of the disk therefore has `SV_AUTH_SECRET`, the field
   encryption key ring and every database password too, and with them:
   - every TOTP secret and backup code, so the second step no longer protects anyone;
   - a valid cookie for any session in the database: taking over people who are signed in;
   - core's signing keys: ID tokens every connected app would believe;
   - the SMTP password.

   Disk access is control of the instance, not only reading it. The encryption in finding 3 protects against a reader of **the database
   without the server's disk**: a dump shared by mistake, a PostgreSQL port left open, a bug that reads rows, a provider's managed-database
   backup. It does not protect against a copy of the disk.

5. **Backups are the exception, deliberately.** `sv backup` encrypts its archive with age to every operator's key and not the server's own
   (operator-cli §6.4.1, §10), and removes the decrypted working copy. A stolen backup file is unreadable without an operator's key. A snapshot the
   _hosting provider_ takes of the server's disk is outside the toolkit and is as readable as the disk.
6. **Rotation is partial.**
   - The field key ring decrypts with any key and encrypts with the newest, but core never rewrites a value under the newest key
     (`settings/store.ts` calls `decrypt`, not `open`, so `upgraded` is never written): an old key must stay in the ring until the SMTP
     password is saved again. There is no command to re-encrypt.
   - `SV_AUTH_SECRET` is one value. Changing it ends every TOTP enrolment, the signing keys and every session (§3.4.1), so in practice it is
     never rotated. **better-auth 1.7 supports versioned secrets** (a `secrets` array, or `BETTER_AUTH_SECRETS` as `<version>:<secret>`,
     newest first, with the old single secret as a legacy fallback), which would make rotation a routine change, if each of its uses
     (cookie signatures, the two-factor plugin's encryption, the JWT plugin's key encryption) decrypts with older versions. That needs
     checking against a populated store, as every better-auth change does (AGENTS.md).
7. **Database connections.** PostgreSQL can use TLS today, by `sslmode` in `SV_POSTGRES_URL`. The sqld client is made from an address
   alone (`createClient({ url })`), with no auth token, which is fine on an instance's internal network and leaves a remote sqld server
   unprotectable.
8. **Nothing tells an operator.** No guide mentions disk encryption, the provider's snapshots, or that the secrets sit beside the data.
9. **End-to-end encryption would not cover core's own data.** Core must read an address to send the sign-in and reset mail, a name to
   answer the Directory (§3.9), and the role to decide who may do what. Only what apps keep for people (notes, files, messages) could be
   encrypted so that the server cannot read it, and that is the later phase the spec names (§3.16), not this question.

## Who reads what

| Reader                                                               | Today                                         | With full-disk encryption                         | With secrets kept off the disk too |
| -------------------------------------------------------------------- | --------------------------------------------- | ------------------------------------------------- | ---------------------------------- |
| A copy of the database only (a dump, an open port, a managed backup) | people's data; not the secrets (finding 3)    | the same                                          | the same                           |
| A copy of the disk, the server off (stolen, retired, a snapshot)     | everything, secrets included (finding 4)      | nothing                                           | nothing                            |
| The hosting provider, the server running                             | everything                                    | everything (it sees memory and the unlocked disk) | everything, from memory            |
| Root on the running server, or an intruder who became root           | everything                                    | everything                                        | everything                         |
| A stolen `sv` backup                                                 | nothing without an operator's key (finding 5) | the same                                          | the same                           |

Against root on a running server nothing done on that server protects people's data; only end-to-end encryption of what apps keep would.

## Options

- **A. Say it, and recommend full-disk encryption.** State this threat model in the deploying and operating guides; recommend LUKS (or a
  provider's encrypted volumes, which protect against a stolen disk but not against the provider) for `/var/lib/docker` and
  `/var/lib/sovereign`; warn that a provider's snapshots copy the disk as it is. `sv doctor` could warn when neither is on an encrypted
  device (`lsblk` shows a `crypt` layer). Cost: documentation and one check. Protects every offline copy of the disk.
- **B. Close the small gaps in core.**
  1. Store verification identifiers hashed (`verification: { storeIdentifier: 'hashed' }`): reset links stop being usable from a
     database copy. Links in flight when it ships stop working once.
  2. Rotation of `SV_AUTH_SECRET` through better-auth's versioned secrets, and of the field key ring with a `sovereign-admin` command that
     rewrites each encrypted setting under the newest key, so an old key or secret can be removed.
  3. An auth token for sqld (`SV_SQLD_AUTH_TOKEN`).

  Cost: three small tasks; the first two change how better-auth stores data and are verified against the populated store fixtures.

- **C. Keep the secrets off the disk.** The server holds `secrets/` and its age key in memory (tmpfs) and gets them when it starts:
  1. **The operator unlocks it.** After a boot the instance waits until an operator runs `sv unlock`, which decrypts the secrets on their
     machine and sends them over SSH into tmpfs. A copy of the disk then holds nothing that unlocks anything. The price is availability: a
     server that reboots unattended stays down until someone unlocks it, and a GitHub runner, which must not hold a key that decrypts the
     secrets (operator-cli §8), cannot do it.
  2. **A key service** (a cloud KMS, Vault) gives the server its key at boot. Unattended restarts work, but the instance depends on a
     third party's service, which sits badly with a self-hosted, sovereign suite.
  3. **A TPM** seals the key to the machine. Unattended and self-contained, but only on hardware that has one (rare on a VPS), and it does
     not help against a stolen whole machine.

  Cost: real work in `sv` (where secrets live, a boot unit that waits, `sv unlock`, the restore path). It does not help against root on a
  running server, and adds nothing over A against an offline copy if the disk is already encrypted, except when the disk cannot be.

- **D. Encrypt personal fields in core's database** (email, name) with a key from the ring and a blind index for looking an address up.
  better-auth reads and writes `users.email` itself, so this means working against the library on every sign-in path; the Directory's name
  search cannot search what it cannot read. And while the key is on the same disk (finding 4) it protects only against the database-only
  reader, whom the database's own protections already cover. Not worth it.
- **E. End-to-end encryption of what apps keep.** The only protection against root and the provider. It is the later phase the spec names
  and needs its own research: key management on people's devices, the recovery kit, and which app data it can cover.

## Recommendation: A and B now; C as an RFC, opt-in; D not; E on its own

1. **A now.** It costs little, it protects every offline copy of the disk, and it tells operators the truth about what core can and cannot
   protect. The `sv doctor` warning is a small task beside it.
2. **B now**, as three tasks, hashing verification identifiers first: it is one setting, and it removes the only secret a database copy can
   use today.
3. **C as an RFC**, with C.1 (`sv unlock`) as an **opt-in** "sealed" mode, never the default: most self-hosters will prefer a server that
   comes back after a power cut to one that waits for them, and full-disk encryption (A) already covers the offline copy. C.1 is worth it
   where the disk cannot be encrypted, or the operator wants a disk image to be worthless even with its passphrase known.
4. **D not.** **E** waits for the phase that brings end-to-end encryption, with research of its own.

## Not now

- Encrypting core's database or its columns (D).
- A key service or TPM integration (C.2, C.3), until C.1 has been used.
- Protection against root on a running server, which no option here gives.

## To settle in review

- Whether `sv doctor` should only warn about an unencrypted disk, or `sv setup` should also ask.
- Whether hashing verification identifiers (B.1) may simply end the reset links in flight when it ships, or should wait for them to expire.
- Whether a sealed instance (C.1) should still accept a deployment while locked, holding it until it is unlocked.

## Changelog

| Date       | Change         |
| ---------- | -------------- |
| 2026-11-15 | First version. |
