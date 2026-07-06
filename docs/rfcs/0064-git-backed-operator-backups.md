# RFC 0064 — Git-backed operator backups

**Status:** Draft\
**Date:** July 2026\
**Author:** kasunben\
**Scope:** `bin/sv`, `bin/helpers.ts`, backup/restore docs, `.env.example`, Docker/Compose operator workflows; amends RFC 0006 and RFC 0008\
**Incorporated into plan:** Yes — epic tasks 8.10, 8.11, and 8.12. This RFC specifies the desired default backup backend and restore semantics; roadmap slot versions are deferred.

---

## Summary

Extend `sv backup` and `sv restore` with a Git-backed remote backup flow. The
default operator backup remains a full-instance disaster-recovery snapshot, not a
user portability export. The new default remote backend is any Git server that
can accept pushes to an empty backup repository.

Backups are encrypted before they leave the host. The root `.env` is never stored
as plaintext in a backup bundle; when included, it is written only as
`.env.enc`. Operators may explicitly allow plaintext remote backup payloads with
`--allow-plaintext-remote`, but that escape hatch still does not permit a
plaintext `.env`.

## Motivation

Sovereign already has local `sv backup` / `sv restore` commands, but operators
still need to move backup archives off-host, retain a useful history, and restore
the latest or a specific known-good snapshot without manually copying files.
Security docs also state that raw v1 backups expose data if leaked, so any
remote-first flow must encrypt before upload.

Git is a pragmatic first remote backend because it is widely available,
self-hostable, auditable, and works with simple token or SSH credentials. It is
not a perfect large-object backup store, so the design constrains bundle size,
retention, and deletion semantics instead of pretending Git is object storage.

## Current state (what this builds on)

- `sv backup` currently creates a local `.tar.gz` archive. SQLite mode tars the
  whole data directory so WAL/SHM sidecars, `auth.db`, `sovereign.db`,
  `avatars/`, and isolated plugin DB files are captured together. Postgres mode
  runs `pg_dump` for platform/auth DBs and includes avatars.
- `sv restore` currently restores from a local archive path. It warns operators
  to stop the server first, but it does not fetch remote backups, decrypt
  bundles, verify a backup manifest, or select `latest`.
- RFC 0006 planned first-class backups, automatic pre-upgrade snapshots, labeled
  restore points, and tunable retention.
- RFC 0008 already amends RFC 0006 toward encrypted backups. It also states that
  losing the operator-held key loses the data and that the key must be backed up
  separately from encrypted backups.
- `docs/security.md` states plainly that raw backups are readable in v1 and tells
  operators to keep backups encrypted and off-host.

## Proposed design

### Command model

Keep local archives supported, but make the remote-capable command shape
explicit:

```bash
pnpm sv backup create
pnpm sv backup push
pnpm sv backup list
pnpm sv backup delete --older-than 60d
pnpm sv backup prune --older-than 60d

pnpm sv restore latest
pnpm sv restore <backup-tag>
pnpm sv restore ./backups/<archive>
pnpm sv restore plugin <plugin-id> --from <backup-tag>
```

`pnpm sv backup` is shorthand for `backup create`; when `SV_BACKUP_BACKEND=git`
is configured it may become shorthand for `backup create && backup push`.

`restore latest` resolves the newest valid remote backup tag, fetches it to a
temporary local directory, verifies its manifest and checksums, decrypts it, then
applies it. `restore <backup-tag>` restores a specific tag. Local archive restore
continues to work for air-gapped and manual workflows.

`restore plugin <plugin-id>` restores only one plugin's data from a full-instance
backup. It is a surgical recovery tool for operator mistakes, failed plugin
upgrades, or accidental plugin-data deletion; it is not a user portability flow.

### Configuration

Proposed environment variables:

```bash
SV_BACKUP_BACKEND=git
SV_BACKUP_GIT_REPOSITORY=https://git.example.com/org/sovereign-backups.git
SV_BACKUP_GIT_BRANCH=backups
SV_BACKUP_GIT_TOKEN=...
SV_BACKUP_ENCRYPTION=required
SV_BACKUP_PASSPHRASE=...
SV_BACKUP_KEY_FILE=...
SV_BACKUP_RETENTION_DAYS=60
SV_BACKUP_MAX_BUNDLE_BYTES=1073741824
```

`SV_BACKUP_GIT_REPOSITORY` supports any Git server. HTTPS token auth is configured
with `SV_BACKUP_GIT_TOKEN`; SSH URLs use the operator's existing SSH agent or key
configuration. Tokens must be scoped to one empty private backup repository with
contents read/write access only.

`SV_BACKUP_ENCRYPTION=required` is the default for remote backups. Operators may
pass `--allow-plaintext-remote` for emergency cases, but the command must print a
high-friction warning and still write `.env` only as `.env.enc`.

### Bundle layout

Each backup is assembled in a temporary staging directory:

```text
backup-manifest.json
data/
  sqlite/...
  postgres/...
  avatars/...
  plugins/
    <plugin-id>/
      db/...
      storage/...
      manifest.json
config/
  env.required.json
  env.public.json
  .env.enc
checksums/
  sha256sums.txt
```

`backup-manifest.json` records:

- backup format version;
- backup ID and Git tag;
- created-at timestamp;
- source instance ID when available;
- platform version and schema/migration version;
- DB dialect and artifact inventory;
- installed plugin inventory: plugin ID, version, route prefix, manifest
  checksum, database isolation/dialect, storage roots, and enabled/disabled
  status;
- encryption metadata, never the key or passphrase;
- checksums for the encrypted payload and plaintext staging files where useful;
- whether plaintext remote upload was explicitly allowed.

The final remote artifact is encrypted as one payload before upload. `.env.enc`
is also encrypted before bundle assembly so a plaintext local staging directory
never contains `.env` in recoverable form after the config-capture step.

### Plugin data coverage

Operator backups include plugin data by capturing the storage substrate, not by
calling user-scoped `sdk.portability` export hooks.

- **Shared database plugins:** plugin tables live in the platform DB, so they are
  included in the platform SQLite backup or Postgres dump.
- **Isolated SQLite plugins:** each provisioned plugin DB under
  `data/plugins/<plugin-id>.db` is captured through the same SQLite online backup
  path as the platform/auth DBs, including sidecar or generated backup files as
  needed.
- **Isolated Postgres plugins:** each provisioned plugin database or schema is
  dumped as its own plugin artifact and listed separately in
  `backup-manifest.json`.
- **Plugin file storage:** once `sdk.storage` lands, local plugin-owned files are
  included under the plugin's storage root and inventoried by plugin ID with file
  counts, byte totals, and checksums.
- **Plugin secret vault data:** encrypted vault ciphertext and metadata are
  included through the platform DB. Plaintext secret values are never exported.
- **Plugin install state:** installed/enabled status, manifest metadata, and
  compatibility information are included so restore can detect missing or
  incompatible plugins before writing data.

The bundle should not treat plugin source code as the primary backup artifact.
Restore should reinstall or verify the matching plugin from its manifest and
repository metadata where possible, then restore that plugin's data. For
operator-owned local plugins, docs should explain that source control remains the
source-of-truth for code while `sv backup` covers runtime data.

### `.env` handling

The root `.env` is sensitive because it contains auth secrets, admin keys,
database credentials, SMTP credentials, VAPID private keys, and backup keys.

Rules:

- never include plaintext `.env` in a backup bundle;
- create `config/.env.enc` only when a backup key/passphrase is present;
- include `config/env.required.json` with the names of required variables and
  restore notes, not secret values;
- include `config/env.public.json` only for non-secret deployment metadata that
  helps operators reconstruct a restore environment;
- never store the backup passphrase or key file inside the backup.

Restoring `.env.enc` is a separate explicit step:

```bash
pnpm sv restore env <backup-tag> --out .env.restored
```

This avoids silently overwriting the current host's runtime secrets during a data
restore.

### Backup consistency

SQLite backups should use SQLite's online backup API or `VACUUM INTO` for each
database file instead of tarring live `.db` files directly. During backup, `sv`
should briefly pause writes or acquire a platform backup lock so auth DB,
platform DB, isolated plugin DBs, and files represent one restore point. If a
fully consistent cross-store lock is not available yet, the manifest must say so
and mark the backup as `consistency: "best-effort"`.

Postgres backups use `pg_dump --format=custom` for platform and auth databases.
For a same-server multi-database deployment, exact cross-database snapshot
isolation is not portable with plain `pg_dump`; the backup should be documented
as near-consistent unless a future coordinated lock is added.

### Scoped plugin restore

Operators sometimes need to restore one plugin without rolling the whole
instance back. `sv restore plugin <plugin-id> --from <backup-tag>` restores only
that plugin's data artifacts:

- shared DB plugin tables matching the plugin's slug/table prefix;
- isolated plugin DB files or Postgres database/schema dumps;
- plugin-owned file storage;
- plugin-scoped vault ciphertext/metadata when the vault supports scoped restore;
- plugin install status only when `--include-install-state` is passed.

Scoped restore is destructive for that plugin's current data by default and must
require explicit confirmation. It should support a safer staging mode:

```bash
pnpm sv restore plugin <plugin-id> --from <backup-tag> --dry-run
pnpm sv restore plugin <plugin-id> --from <backup-tag> --staging-dir ./restore-check
pnpm sv restore plugin <plugin-id> --from <backup-tag> --yes
```

The manifest must identify whether a plugin is safe to restore independently. If
the plugin has cross-plugin references, queued jobs, external connection state,
or schema migrations newer than the selected backup, the CLI must either block or
require `--force` with a warning that references may need repair. Platform-owned
identity rows are never rolled back by a plugin-scoped restore.

### Size policy

Git is the default remote backend for small and medium self-hosted instances, not
large binary archives. Default policy:

- warn above 250 MiB encrypted payload size;
- require `--large-backup-ok` above 1 GiB;
- refuse above `SV_BACKUP_MAX_BUNDLE_BYTES` unless the operator increases the
  limit explicitly;
- document that deployments with repeated multi-GB backups should use a future
  object-storage backend instead of Git.

This keeps the first backend practical while leaving room for later S3,
restic/borg, or filesystem remotes.

### Git storage model

Use one orphan commit per backup, tagged by backup ID:

```text
sv-backup/2026-07-06T12-30-00Z/v0.15.0
```

Each backup commit contains the encrypted backup payload and a small plaintext
remote manifest with non-secret metadata needed for listing. An optional
`backups` branch stores an index file for fast listing, but the large backup
payloads are not kept in branch history.

This model makes deletion viable: deleting the tag makes the large backup commit
unreachable. Actual object reclamation still depends on the Git server's garbage
collection policy, which Sovereign cannot force across arbitrary Git servers.

### Retention and deletion

Operators can delete by age or keep count:

```bash
pnpm sv backup delete --older-than 30d
pnpm sv backup delete --older-than 60d
pnpm sv backup delete --keep 20
pnpm sv backup prune --older-than 60d
```

`delete` removes matching remote backup tags and updates the optional index.
`prune` performs the same deletion and then runs local Git cleanup. Remote disk
space may not shrink until the Git server performs garbage collection.

Deletion must be conservative:

- dry-run by default unless `--yes` is passed;
- never delete the newest successful backup;
- never delete a backup referenced by a configured protected tag pattern;
- print the exact tags selected for deletion;
- verify after deletion that `restore latest` still resolves to a valid backup.

### Restore guards

Restore validates before writing:

- backup manifest checksum and encrypted payload authentication;
- required key/passphrase presence;
- platform version compatibility;
- DB dialect compatibility or a documented migration path;
- expected artifact set for the selected dialect;
- plugin manifest/version compatibility for full and plugin-scoped restores;
- scoped-restore safety markers for plugin-only restore;
- enough free disk space for staging and restore.

By default, restore refuses a backup created by a newer platform version than the
currently running code supports. Operators can override with `--force`, but the
CLI should explain that the safer path is to run the matching or newer platform
version first.

### Security properties

The Git remote receives only ciphertext by default. The Git token grants access
to the backup repository but does not grant decrypt capability. The backup key or
passphrase is operator-held and must be stored separately from the Git repo.

This protects against a leaked Git repo, stolen Git token, or compromised Git
server storage. It does not protect against an attacker who controls the running
Sovereign host while the backup key is available in process environment or on
disk. That remains consistent with RFC 0008's at-rest encryption model.

## Alternatives considered

1. **Commit plaintext tarballs to Git.** Simple, but contradicts the security
   guidance that raw backups expose all data. Rejected as the default. An
   explicit `--allow-plaintext-remote` escape hatch exists only for emergency
   operator-controlled cases and still encrypts `.env`.
2. **One linear branch with one backup commit after another.** Easy to inspect,
   but deleting old backups does not remove their large blobs because branch
   history keeps them reachable. Rejected.
3. **Git LFS.** Better large-file ergonomics, but not available on every Git
   server and adds another service contract. Deferred.
4. **Object storage as the first backend.** Technically better for large backup
   objects, but Git is simpler for self-hosters and private infrastructure.
   Object storage should be the second backend if backup sizes outgrow Git.
5. **Automatically restore `.env` during data restore.** Convenient, but risky
   because it can overwrite host-specific secrets, URLs, and credentials.
   Rejected in favor of an explicit `restore env` command.

## Open questions

1. Which encryption implementation should v1 use: age recipients, passphrase
   AES-GCM via Node crypto, or both?
2. Should backup locking be implemented as a platform DB advisory lock, an
   application maintenance mode, or a shorter per-artifact consistency marker?
3. Should remote backup scheduling live in `sv` only, or should Console later
   expose schedule/retention status for operators?
4. How should backup success/failure events be surfaced in activity logs once
   operator audit events exist?

## Adoption path

1. Add backup manifest and encrypted local archive support.
2. Add `.env.enc` capture and explicit `restore env`.
3. Add Git remote push/list/fetch by tag.
4. Add `restore latest` and restore guards.
5. Add scoped plugin restore with dry-run/staging support.
6. Add retention deletion/prune.
7. Update `.env.example`, `docs/self-hosting.md`, `docs/upgrade.md`, and
   `docs/security.md`.
8. Add tests for manifest validation, plugin artifact inventory, scoped plugin
   restore planning, encryption-required remote push, plaintext escape hatch
   behavior, tag selection, and retention deletion.

No public SDK or UI package semver impact is expected. CLI behavior changes are
operator-facing and should be covered by upgrade notes when scheduled.

## Changelog

| Version | Date      | Change        |
| ------- | --------- | ------------- |
| 0.1     | July 2026 | Initial draft |
