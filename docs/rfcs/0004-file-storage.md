# RFC 0004 — Files for people: one layout, one package, three stores

|              |                                                                                                                                                                                                                                                                                                          |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Status**   | Partially implemented (the disk is built end to end; S3 and git are parked)                                                                                                                                                                                                                              |
| **Date**     | November 2026                                                                                                                                                                                                                                                                                            |
| **Author**   | Claude Code, for review                                                                                                                                                                                                                                                                                  |
| **Scope**    | `docs/specs/core-app.md` (a new §4.6, §3.4); `docs/specs/operator-cli.md` §6.4, §7, §10.2; `contracts/app-manifest.md` (manifest 3) and its schemas; `contracts/env.md`; `contracts/suite.md` §1.7; a new package, `@sovereignfs/storage`; `apps/core`, `tools/cli`, `tools/create` and its app template |
| **Research** | [0005](../research/0005-file-storage.md)                                                                                                                                                                                                                                                                 |
| **Tasks**    | [15.9](../epics/core-services.md), [13.32–13.34](../epics/operator-cli.md), [15.10–15.11](../epics/core-services.md)                                                                                                                                                                                     |

## Summary

Every Sovereign app, core included, keeps the files people upload in the same way:

1. **One place.** On an instance, one Docker volume, `sovereign-data`, holds `s3/<app>/<sub>/…`. Each app's container mounts **only its
   own** `s3/<app>`, at `/data/s3/<app>`. A standalone app mounts a volume of its own at the same path.
2. **One package.** `@sovereignfs/storage` stores, lists, serves and deletes a person's files, keeps their usage within a quota, and signs
   download addresses. A driver chosen by `<PREFIX>_STORAGE_DRIVER` decides where the bytes go: **`fs`** (the layout above, built first),
   **`s3`** (any S3-compatible store), **`git`** (a repository the person connects).
3. **One quota, per person, in each app,** from the app's environment: `<PREFIX>_STORAGE_QUOTA_MB` and `<PREFIX>_STORAGE_FILE_QUOTA`.
4. **Private files.** A file is served to its owner only: to their session, or through a signed address that ends within minutes.
5. **The toolkit and the template carry it.** Manifest 3 says an app keeps files; `sv apply` makes and mounts its folder; `sv backup` and
   `sv restore` take and put back the folders; the template ships the package wired in, and a Docker setup of its own.

## Motivation

Apps need to keep files for people, and each one doing it alone means as many layouts, limits and ways to serve them as there are apps:
none backed up by `sv backup` unless the author happens to declare the right `data` path, none limited the same way, and each with its own
chance of serving a file to the wrong person or running an uploaded page as script. A person's files should be kept the same way in every
app on an instance, so that an operator can reason about them, and so that the person can later choose to keep them in storage of their own.

## Current state

- An app keeps lasting state only in its database or under a manifest `data` path; `sv apply` makes one named volume per path
  (`sovereign-app-<name>_data-<n>`), and `sv backup` copies those volumes (operator-cli §10.2.1).
- Core keeps pictures in its database (core-app §3.15) and has no place for people's files.
- The app template has a `Dockerfile` and no compose file, and declares no `data` path.
- The manifest's schema accepts no field it does not name (`additionalProperties: false`).
- `sv receive` reads a restore into memory, at most 1 GiB.

## Goals

- One layout, one package and one set of variables for every app and core, on an instance and standalone.
- No app can read another app's files.
- A quota per person in each app, kept when uploads arrive at once.
- Files are served only to their owner, never as script.
- `sv backup` and `sv restore` carry `fs` files, whole and by scope, and say plainly what they do not carry.
- The template makes a new app do all of this without its author writing it.

## Non-goals

- Core writing into an app's folder, and a Console override of quotas.
- Sharing files between people, and public links, for `fs` and `s3`.
- Moving files from one driver to another.
- Encryption at rest beyond the disk's or the store's.

## Design

### 1. The layout

```text
sovereign-data                     a Docker volume on the instance
  s3/
    core/                          core:   mounted at /data/s3/core
      <sub>/
        <id>                       the file, under an id the server made
        <id>.json                  its record: name, type, size, created
        .usage.json                the person's usage: bytes and files
    notes/                         notes:  mounted at /data/s3/notes, and nothing else
      <sub>/…
```

- **A container sees only its own folder.** Each is a volume mount with `subpath: s3/<app>`. Only the toolkit's own containers mount the
  whole volume, to make folders and to back them up.
- **Paths come from the server.** The folder is the person's `sub`; a file is stored under an id made with 128 random bits; the name the
  person gave is only in the record. Both the `sub` and the id are checked against their patterns before they touch a path.
- **Standalone, the same path.** A standalone app's compose file mounts a volume of its own at `/data/s3/<app>`, so the app's code is the
  same everywhere.

### 2. `@sovereignfs/storage`

A published package, ESM, with no dependency on core or on a database.

```ts
const files = storage(env, { prefix: 'NOTES' }); // reads <PREFIX>_STORAGE_*
await files.put(sub, stream, { name, type, size }); // → { id, name, type, size }  or a quota/type refusal
await files.list(sub); // records, newest first
await files.get(sub, id); // a stream and its record
await files.remove(sub, id);
await files.removeAll(sub); // for an account-deleted notice
await files.usage(sub); // { bytes, files, quota: { bytes, files } }
files.signedUrl(sub, id, { seconds: 300 }); // an address the app's download route accepts
```

- **What a file is** is judged by its first bytes, not by its name or the type the browser sent. A type the app does not allow is refused.
- **Quotas.** `put` reserves the file's size and one file in the person's usage record under a lock, before writing; a write that fails
  gives them back. A record that is missing, or older than a day, is rebuilt by counting. Over the size quota is `413 Payload Too Large`
  when the one file is too big, and a refusal named `over_quota` when the person's space is full; over the file quota is `over_quota` too.
- **Usage stores.** The record lives beside the files by default. An app that runs more than one process passes a store backed by its
  database instead, as it does for the SDK's token stores.
- **Signed addresses** carry the `sub`, the id and an expiry, with an HMAC over them made with `<PREFIX>_STORAGE_SIGNING_KEY`, and are
  compared in constant time.

### 3. The drivers

**`fs`** (first). The layout of §1, under `<PREFIX>_STORAGE_PATH` (default `/data/s3/<app>`).

**`s3`** (second). Any S3-compatible store: `<PREFIX>_S3_ENDPOINT` (`https`), `_S3_BUCKET`, `_S3_PREFIX` (default the app's name), `_S3_REGION`,
and the credentials `_S3_ACCESS_KEY_ID` and `_S3_SECRET_ACCESS_KEY` as operator secrets. Objects are `<prefix>/<sub>/<id>`, with the record as
the object's metadata. Usage is kept in the usage store, never by listing. Credentials SHOULD be able to reach the app's prefix and nothing
else, where the store allows it.

**`git`** (third). The store is the person's own repository; the environment only allows it (`<PREFIX>_STORAGE_DRIVER=git`, and
`<PREFIX>_GIT_HOSTS`, the hosts a person may connect, default `github.com`).

- A person connects a repository and gives access to it: a deploy key the app makes for them, or a token. The app keeps that access
  encrypted with its own key and uses it for that repository alone.
- Each upload is a commit of the file under `<app>/<id>`, with its record beside it.
- **Serving.** For a public repository on GitHub, the file's address is its raw-content address (`raw.githubusercontent.com`), and the app
  tells the person, when they connect it, that what they keep there is public. For a private one, the app reads the file and serves it as
  with `fs`.
- **Quotas.** The file quota applies; size is the host's to limit (GitHub refuses a file over 100 MB, and the app says so before trying).

### 4. Core

- Core keeps the person's own files at `/data/s3/core`, through the same package, with `SV_STORAGE_*`.
- **Routes:** `POST /api/files` (upload), `GET /api/files` (the person's own list), `GET /api/files/{id}` (download, to the session or a
  signed address), `DELETE /api/files/{id}`. They are core's own routes, not the Core API (`/api/v1`): each calls `requireCapability` with
  a new capability, `files:manage`, held by every role by default, and an upload or a delete also calls `requireSameOrigin`.
- **Deleting an account** deletes the person's folder in the same step that deletes the account.
- A new core-app §4.6 says all of this; §3.4 gains the capability.

### 5. The manifest and the environment

- **Manifest 3** adds `"storage": true`. A toolkit that reads 3 reads 1 and 2 as before, and an app with `storage` has no `data` path
  at `/data/s3`.
- For an app with `storage`, `sv apply` gives it `<PREFIX>_STORAGE_DRIVER` (default `fs`), `_STORAGE_PATH`, `_STORAGE_QUOTA_MB` and
  `_STORAGE_FILE_QUOTA` (defaults `204800`, which is 200 GB, and `1000`, changed under the app's `env` in `suite.yml`), and generates
  `_STORAGE_SIGNING_KEY`. The `s3` variables are the operator's, under the app's `env` and secrets.
- `contracts/env.md` names these variables as shared, like `<PREFIX>_POSTGRES_URL`.

### 6. The toolkit

**`sv apply`**

- Makes `sovereign-data` once, and for each app with `storage` (and for core) makes `s3/<app>` before the app is started, owned by the
  user the app's image runs as (`Config.User` when it is numeric, otherwise `id -u` run in the image), and mounts it with `subpath`.
- Purging an app (§6.2) deletes `s3/<app>` after the backup it already takes.
- `sv status` shows how much of `sovereign-data` each app's folder holds.
- The minimum Docker Engine rises from 24 to 26, for `subpath`; `sv apply` and `sv doctor` refuse an older engine and say so.

**`sv backup`** (operator-cli §10.2)

- An archive gains `files/<app>.tar`, one for core and each app whose driver is `fs`: a tar of `s3/<app>` made through the toolkit's
  image, which mounts `sovereign-data` read only. Like data volumes today, it is copied while the apps run, as consistent as a crash would
  leave it; the usage records are rebuilt on restore (below).
- **Scopes follow:** `--all` takes every folder, `--core` takes `files/core.tar`, `--app NAME` takes `files/<name>.tar`.
- **`backup.json` becomes format 2,** with `files` (the folders it holds) and `elsewhere` (each app whose files are in `s3` or `git`, and
  so not in the archive). `sv backup` says, for each of those, where its files are and that backing them up is that store's to do. A
  toolkit that reads format 1 only refuses a format 2 archive with its usual "taken by a newer toolkit".
- `--unencrypted` writes the same files into the plain tar.

**`sv restore`**

- **`sv receive` streams a restore to disk** instead of reading it into memory, and checks the paths of the archive as it reads them
  (`isBackupPath` gains `files/<app>.tar`). The 1 GiB limit goes; the free space of the state directory is checked first, against the
  archive's size.
- **The files are put back with the data:** after the databases and volumes, and before core and the apps start, each `files/<app>.tar`
  in scope replaces `s3/<app>`: emptied, unpacked with its owners as they were, then owned by the app's user on this server (a new server
  may run the image as another user). Every `.usage.json` is removed, so the package counts again on first use.
- **Restoring one app tells it about deletions again.** A restore of one app (`--app`) leaves core alone, so the people deleted since the
  backup would come back in that app's database and folder (research 0005, finding 8). After it, `sv restore` runs a new
  `sovereign-admin instance deletions resend --app <client> --since <takenAt>`, which makes an account-deleted notice to that app for each
  account in `deleted_accounts` deleted after the backup. Those rows are kept 90 days, so a backup older than that is restored with a
  warning that people deleted before then may reappear. (This gap exists today for the databases, without files.)
- A `core` restore puts back core's folder with its database, and the deletions `instance deletions apply` carries already delete their
  folders.

**Destinations (13.17, 13.18)** send the same archive and need no change of their own; an archive with files will be larger, which the
git destination's 95 MB parts already allow for.

### 7. The template

- **Manifest 3**, with `"storage": true`.
- **`@sovereignfs/storage`** in its dependencies, and `lib/files.ts` making the store from the app's environment.
- **Routes:** `POST /api/files`, `GET /api/files`, `GET /api/files/[id]`, `DELETE /api/files/[id]`, each for the signed-in person only, with
  the refusals turned into messages a person can act on.
- **Account deletion:** the template's account-deleted handler also calls `files.removeAll(sub)` before it answers `2xx`.
- **Its own Docker setup:** `compose.yml` with the app, PostgreSQL, and a volume mounted at `/data/s3/<app>`; the `Dockerfile` makes that
  folder, owned by the user it runs as; `.env.example` and `.dockerignore` list the storage variables and keep `.env` out.
- `@sovereignfs/create`'s test holds the template to the manifest schema and builds the image, as it does today.

## Security and privacy

- **Isolation.** An app's container has its own folder and no other; only core and the toolkit see more.
- **No path from a request.** Paths are built from a checked `sub` and a server-made id.
- **Never script.** Types come from bytes; HTML and SVG are never served inline; every file response sends `X-Content-Type-Options:
nosniff` and `Content-Disposition`, `inline` for images and `attachment` for everything else.
- **Private by default.** Downloads need the owner's session or a signed address that ends within minutes; the key is generated per app.
- **Backups.** Files travel in the archive, encrypted to the operator's keys as everything else is; the server cannot read them.
- **Git.** Access the person gives is encrypted at rest and used for their repository alone; a public repository is said to be public
  before anything is written to it.
- **Deletion.** An account-deleted notice deletes the person's files; a restore of one app is followed by the notices it would have missed.

## Alternatives considered

- **Every container mounts the whole `data/`** (the first sketch): one app could read every other's files.
- **A directory scan for each quota check** (the first sketch): slow as folders grow, and two uploads at once both pass it.
- **Caddy serving the folder** (the first sketch): every file public to whoever learns its path.
- **A named volume per app**, as `data` paths are now: no single place for core, `sv status` and backups to see.
- **Core as the upload service for every app**: one more thing an app depends on core being up for, and a much larger core API; left out.

## Testing

- **The package:** quotas under concurrent uploads, a failed write giving its reservation back, a rebuilt usage record, types judged by
  bytes, a path from a request refused, signed addresses that expire and are compared in constant time; each driver against the same
  suite (`fs` on a temporary folder, `s3` against MinIO, `git` against a local bare repository).
- **Core:** every route calls `requireCapability`, and upload and delete `requireSameOrigin` (the existing tests that look for them); a
  person cannot read another's file.
- **The toolkit:** `sv apply` makes and mounts each folder, owned by the app's user, and a container cannot see another's (a Docker test);
  `sv backup` with each scope holds the right `files/*.tar`; `sv restore` streams an archive larger than 1 GiB, puts the folders back and
  removes the usage records; an app restore sends the deletions it missed.
- **The template:** a scaffold builds, starts with `compose.yml`, uploads and serves a file, and deletes a person's files on their notice.

## Rollout

Each phase is one task and ships on its own.

1. **The package with `fs`,** and core's folder, routes and capability (core-app §4.6).
2. **Manifest 3 and `sv apply`:** `sovereign-data`, folders, mounts, variables, purge, `sv status`.
3. **Backup and restore:** files in the archive, format 2, streaming restore, `deletions resend`.
4. **The template:** the package wired in, its routes, and its own Docker setup.
5. **`s3`.**
6. **`git`.**

## Settled in review

- **Docker Engine 26 is the minimum,** for `subpath`. There is no fallback to bind mounts.
- **The app serves its files itself in the first version.** Caddy's `forward_auth`, where the app says yes and the proxy sends the bytes,
  is left until large downloads show a cost that is measured: it adds a second request per download and a rule in the proxy for every
  app, for a saving nobody has seen yet. The download route streams, so a large file does not sit in memory.
- **The default quotas are 200 GB and 1000 files** per person in each app (`<PREFIX>_STORAGE_QUOTA_MB=204800`,
  `<PREFIX>_STORAGE_FILE_QUOTA=1000`).

## Decision requested

Accept the layout, the package and its three drivers, manifest 3, and the toolkit's backup and restore changes, so that the six tasks can
be added to the epics and built in that order.
