# Research 0005 — Files for people, in core and in every app

|                   |                                                                                                                                                                                                                                                                                 |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Status**        | Recommended and accepted as [RFC 0004](../rfcs/0004-file-storage.md); the tasks are in milestone M14 of the roadmap                                                                                                                                                             |
| **Date**          | November 2026                                                                                                                                                                                                                                                                   |
| **Author**        | Claude Code                                                                                                                                                                                                                                                                     |
| **Scope**         | [core-app](../specs/core-app.md) §3.15, §4.5; [operator-cli](../specs/operator-cli.md) §6.4, §7, §10.2; [`contracts/app-manifest.md`](../../contracts/app-manifest.md) §2, §4, §5; [`contracts/env.md`](../../contracts/env.md); the app template (`tools/create/template/app`) |
| **Versions read** | Core 0.60.0, toolkit 0.7.0, manifest 2, the app template as `@sovereignfs/create` 0.7.0 writes it                                                                                                                                                                               |

---

## Question

People upload files to apps: a photo for a note, an attachment to a task, a document. Today every app that needs this invents its own
place on disk, its own limits and its own way of serving what it kept. What should the suite give every app, core included, so that a
person's files are kept the same way everywhere, are limited per person, are served only to their owner, survive a backup, and can later
live somewhere other than the server's disk (any S3-compatible store, or a git repository the person connects)?

## Method

- **The code:** how `sv apply` renders an app's data volumes (`tools/cli/src/apply/render.ts`, one named volume per manifest `data`
  path), how backups copy them (`tools/cli/src/apply/backup.ts`, `appVolumes`) and put them back (`apply/restore.ts`, `restoreVolumes`),
  how `sv receive` takes a restore (`server/receive.ts`), core's image (`Dockerfile`), and what the template writes
  (`tools/create/template/app`).
- **The contracts:** the manifest's schema (`contracts/schemas/app-manifest-v2.schema.json`) and its rule for changing the format
  (§5), the environment convention, and core-app §4.5 on telling apps an account was deleted, before and after a restore.
- **A first sketch** of the idea: one `data/` directory shared by every app, a folder per app and per person, quotas from the environment,
  a directory scan to enforce them, and Caddy serving the folder directly.

**Not done:** a load test of uploads, and the S3 and git drivers tried against real stores. Docker's volume `subpath` was read from its
documentation, not tried on the minimum engine the toolkit accepts.

## Findings

1. **There is no shared place for files.** An app keeps what must survive an upgrade "only in its database or under `data`"
   (app-manifest §4). `sv apply` gives each `data` path its own named volume, `sovereign-app-<name>_data-<n>`, and nothing else. Core keeps
   pictures in its database (§3.15) and has `/data` only for a SQLite file. The template declares no `data` path at all.
2. **One shared mount would join every app's files.** If every container mounted the whole `data/`, an app that is taken over could read
   and change every other app's files and core's. The apps are separate programs, often from separate authors; their files must be as
   separate as their databases, which no app can open but its own.
3. **Counting on every upload is slow and does not hold.** A scan of a person's folder before each upload costs more as the folder grows,
   and two uploads at once both pass it and together exceed the quota. On S3, listing a prefix to add up sizes is slow and billed per call.
4. **A proxy cannot tell whose a file is.** Caddy serving the folder makes every file public to anyone who learns its path. Serving
   through the app costs a Node process per download, which only matters for large files, and Caddy's `forward_auth` lets the app say yes
   and Caddy send the bytes.
5. **A file can attack the app that serves it.** HTML or SVG served inline from an app's own address runs as script there, with the
   person's session. Core already judges an image by its bytes and rebuilds an SVG (`sanitiseSvg`) rather than passing one through.
6. **A name from the uploader is not a path.** It may hold `../`, be very long, repeat, or say something about the person. Core's
   layout must come from values it controls: the person's `sub`, and an id it makes.
7. **Backups do not know about it.** `takeBackup` copies volumes whose names match `sovereign-app-<name>_data-<n>`; a new volume would be
   left out without a word. `sv receive` reads a restore into memory, up to 1 GiB (`MAX_RESTORE_BYTES`), which files will soon exceed.
8. **A restore of one app brings back people who were deleted.** A whole-instance restore runs `instance deletions apply`, which makes a
   new account-deleted notice for every app (core-app §4.5). A restore of one app (`sv restore --app`) does not touch core, so nothing tells
   that app again: the database rows and, with this, the files of people deleted since the backup come back.
9. **The manifest cannot say "this app keeps files".** Its schema has `additionalProperties: false`; a new field is a new version
   (app-manifest §5), and the toolkit reads every version it ever supported.
10. **A git repository is a different kind of store.** It keeps every version, so it only grows and a quota on size means little; GitHub
    refuses a file over 100 MB and slows writes to a large repository. Its raw-content address (`raw.githubusercontent.com`) serves a
    **public** repository's files to anyone; for a private one it needs a token, and the addresses it hands out expire. It belongs to the
    person, not to the instance: the access to it is theirs to give.
11. **Docker can mount part of a volume.** A volume mount with a `subpath` mounts one folder of a named volume, so every app's folder can
    live in one volume (`sovereign-data`) while each container sees only its own. It needs Docker Engine 26 (the toolkit accepts 24 today)
    and the folder to exist before the mount; a bind mount of a host folder under `/var/lib/sovereign` does the same on any engine.

## Options

**Where the files live on the server.**

| Option                                             | For                                                                 | Against                                                                       |
| -------------------------------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| A. One volume, every container mounts all of it    | Simple                                                              | Every app reads every app's files (finding 2)                                 |
| B. One volume, each container mounts its `subpath` | One place to back up and measure; each app sees only its own folder | Docker Engine 26; the toolkit must make each folder first, owned by the app   |
| C. A host folder per app, bind-mounted             | Any engine; visible on the host                                     | Files outside Docker's volumes; a second layout beside `/var/lib/sovereign`   |
| D. A named volume per app, as `data` paths today   | Exists                                                              | No shared root for core to see, measure or back up as one; the name says less |

**How quotas are kept.** A scan on each upload (finding 3); a usage record kept beside the files and reserved before a write; or the
app's database. A record the storage package keeps works with no database, which a standalone app may not have; a store an app may
replace with its database (as the SDK's token stores are replaced today) covers apps that run more than one process.

**How files are served.** The proxy alone (finding 4); the app alone; the app deciding and the proxy sending (`forward_auth`).

## Recommendation: B, a usage record, the app deciding

1. **One volume, `sovereign-data`, with a folder per app under `s3/`, and a folder per person under that.** Each app mounts only
   `s3/<app>` at `/data/s3/<app>`; core mounts `s3/core` at `/data/s3/core`. Nothing mounts the whole volume but the toolkit, to make the
   folders and back them up. A standalone app mounts a volume of its own at the same path, so its code never knows which it is in.
2. **One package, `@sovereignfs/storage`, with drivers chosen by `<PREFIX>_STORAGE_DRIVER`:** `fs` first, then `s3`, then `git`. The
   package lays out files, keeps the usage record, checks what a file is by its bytes, and signs download addresses. It needs neither core
   nor a database.
3. **A quota per person, in each app, from its environment:** `<PREFIX>_STORAGE_QUOTA_MB` and `<PREFIX>_STORAGE_FILE_QUOTA`. Reserved
   before a write, released if the write fails, re-counted when the record is missing or older than a day. No Console override yet.
4. **Every file is private to its owner.** The app serves it to its owner's session, or through a signed address that ends within
   minutes; images are shown, everything else is downloaded, nothing is served as HTML or SVG.
5. **Git is the person's own store.** The app lets a person connect a repository, with access they give; files are committed there. A
   public repository's files are served from its raw-content address, with the person told they are public; a private one's through the
   app, as with `fs`.
6. **The toolkit and the template follow.** Manifest 3 says an app keeps files; `sv apply` makes and mounts its folder; `sv backup` and
   `sv restore` carry the folders; the template ships the package, its routes, its account-deleted cleanup and a Docker setup of its own.

Core writing into an app's folder, and an operator changing a quota from the Console, are left out for now.

## Not now

- **Core writing into an app's folder** on an app's behalf, and a Console override of quotas.
- **Sharing files between people, or public links** from `fs` or `s3`. The layout leaves room for them.
- **Encrypting files at rest** beyond what the disk or the store does.
- **Files moved between drivers** when an operator changes `STORAGE_DRIVER`: an app starts empty on the new one until a command exists.

## Settled in review

- The toolkit's minimum Docker Engine rises to 26 for `subpath`; option C is not kept for older engines.
- The app serves files itself at first; `forward_auth` waits until large downloads show a measured cost.
- The default quotas are 200 GB and 1000 files per person in each app.

## To settle in the tasks

- How `sv apply` learns the user an image runs as, to own the app's folder: `Config.User` when it is numeric, otherwise `id -u` run in
  the image.

## Changelog

| Date       | Change                                                     |
| ---------- | ---------------------------------------------------------- |
| 2026-11-12 | Written                                                    |
| 2026-11-12 | Settled the minimum engine, serving and the default quotas |
