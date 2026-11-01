# Workstream 0001 — The operator workflow

**Status:** 📋 Planned\
**Date:** November 2026\
**Author:** kasunben\
**Goal owner:** kasunben\
**Governs:** [RFC 0002](../rfcs/0002-deployment-strategies.md) (Accepted, Implemented), extended within its design;
[operator-cli](../specs/operator-cli.md) §2.2, §4.2.1, §6.1, §6.4.3, §8.2, §10; [`contracts/suite.md`](../../contracts/suite.md) §1.7, §1.8;
epic [13](../epics/operator-cli.md) (Operator CLI)\
**Research:** none. The Decisions locked table below was settled with the goal owner in a planning conversation (2026-11-01), and is
that record.

---

## Goal

An operator runs an instance end to end with `sv`, as they already can, and then also: adds an app by naming its GitHub repository and
hosts it under its own subdomain; upgrades core and each app to a newer release after reviewing the change; rolls back to any release
the server still keeps; has backups leave the server on a schedule for S3-compatible storage, a git repository or a machine over SSH,
and restores from there, for the whole instance or one app; and does deploy, rollback, backup and app upgrades from GitHub Actions as
well as from their own machine, for a server on the internet or on a private network. The server still builds nothing and holds no
credential for a repository, and a runner still decrypts nothing.

## Definition of done

- [ ] `13.13` — The SSH path, walked on a server
- [ ] `13.14` — Upgrades for core and apps
- [ ] `13.15` — Apps from git
- [ ] `13.16` — Rollback to a chosen release
- [ ] `13.17` — Scheduled backups to S3, and one app's backup
- [ ] `13.18` — Backups to git and SFTP
- [ ] `13.19` — More from GitHub, and servers its runners cannot reach
- [ ] operator-cli §13 items 11–16 hold, each shown by a test or a recorded run

## Decisions locked

| Decision                      | Choice                                                                                                                                                                                  | Rejected alternative and why                                                                                                                                                                                                                                           |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Install steps                 | `sv server bootstrap`, `sv push` and `sv deploy` stay three commands, as they are                                                                                                       | One command from bootstrap to a running core: bootstrap needs root and runs once, a deployment runs on every change; joined, a failure in either leaves the other half done and harder to run again                                                                    |
| Where an app's image is built | In the app's own repository, by GitHub Actions, published to GHCR for linux/amd64 and linux/arm64; `sv` resolves and pins the digest                                                    | On the server: slow on an arm64 machine, needs repository credentials there, and a rebuild is not what was tested, so pinning and rollback lose their meaning. On the operator's machine: needs Docker and cross-architecture builds locally, and the machine to be on |
| Where `--git` looks           | GitHub repositories, at `ghcr.io/<owner>/<repo>`                                                                                                                                        | Any git host: each registry names images its own way; another host's app can still be added by naming its image with `--image`                                                                                                                                         |
| Which apps                    | Sovereign apps only: they carry the manifest (sign-in, health, data, database)                                                                                                          | Any Docker app: without a manifest none of those is known, and it would need a second way to describe an app                                                                                                                                                           |
| Backup destinations           | S3-compatible, a git repository and SFTP, besides downloading; S3 first                                                                                                                 | Git only: archives grow without end, history cannot be pruned without rewriting it, and GitHub refuses files over 100 MB                                                                                                                                               |
| A git destination             | A repository for backups alone; one parentless commit per backup on its own `backup/<timestamp>` branch; parts of at most 95 MB with their SHA-256                                      | A linear history: deleting a backup would free nothing, since earlier commits still hold it. The instance's own repository: backups would grow every clone                                                                                                             |
| What runs the schedule        | `sv-backup`, a container `sv apply` runs from the toolkit's image when `backup.schedule` is set                                                                                         | A systemd timer installed by bootstrap: changing the schedule would need bootstrap again, and a deployment, which runs in a container, cannot install one on the host                                                                                                  |
| Destination credentials       | Operator secrets under `backup` in `secrets.age.yml`, decrypted on the server, able to write and nothing more where the store allows; `keep: 0` for a store that expires backups itself | Sending backups from the operator's machine: the machine would have to be on for every scheduled backup                                                                                                                                                                |
| Restoring                     | Decrypted on the operator's machine, which reads the destination with its own access                                                                                                    | Restoring on the server or through GitHub: either would need the operator's private key where it must never be                                                                                                                                                         |
| App upgrades                  | `sv app upgrade` writes files for review; only `sv push` and `sv deploy` change the server; never backward                                                                              | Upgrading apps inside `sv upgrade`: the toolkit's release and an app's release are separate decisions, and the spec already keeps them apart (operator-cli §10.1)                                                                                                      |
| GitHub commands               | `deploy`, `rollback`, `backup` and `app-upgrade` (as a pull request) by hand; the deployment key allows exactly `version`, `deploy`, `rollback` and `backup`                            | A key that opens a shell, or restore and bootstrap from GitHub: a runner would hold more than it needs, and restore needs the operator's key                                                                                                                           |
| Private servers               | A self-hosted runner, or a Tailscale network the run joins                                                                                                                              | Opening the server's SSH port to the internet for GitHub's runners                                                                                                                                                                                                     |
| Governance                    | No new RFC: this extends RFC 0002 within its design, and the spec is the source of truth                                                                                                | A new RFC: no design question is open beyond the ones settled here                                                                                                                                                                                                     |
| Execution                     | Legs: one branch, one draft PR, one review gate each                                                                                                                                    | One PR for everything, or one per task with no ordering recorded                                                                                                                                                                                                       |

## Prerequisites

- **13.12 merged:** the specification these legs build to.
- **Toolkit 0.3.0 published** (done): the non-root fixes and the development environment with Mailpit that leg 1 walks.
- **A server for leg 1**, owned by the goal owner: a virtual machine, or a server in a container. The container used so far is built
  from `sv-server-image/Dockerfile` beside this repository (Ubuntu 24.04 with systemd and sshd; it needs `/var/lib/containerd` as a
  volume as well as `/var/lib/docker`). The Raspberry Pi first planned for it is out until its disk is replaced.
- **For leg 7:** a server GitHub's runners can reach, and a machine that can run a self-hosted runner.

## Legs

| Leg | Name                                | Epic tasks | Gate?                                    | Done when                     |
| --- | ----------------------------------- | ---------- | ---------------------------------------- | ----------------------------- |
| 1   | Walk the SSH path                   | `13.13`    | Yes: its findings are fixed before leg 2 | 13.13 ✅, reviewed and merged |
| 2   | Upgrades                            | `13.14`    | No                                       | 13.14 ✅, reviewed and merged |
| 3   | Apps from git                       | `13.15`    | No                                       | 13.15 ✅, reviewed and merged |
| 4   | Rollback to a release               | `13.16`    | No                                       | 13.16 ✅, reviewed and merged |
| 5   | Scheduled backups and S3            | `13.17`    | No                                       | 13.17 ✅, reviewed and merged |
| 6   | Backups to git and SFTP             | `13.18`    | No                                       | 13.18 ✅, reviewed and merged |
| 7   | GitHub commands and private servers | `13.19`    | Yes: a run on a real runner passes       | 13.19 ✅, reviewed and merged |

Leg 4 depends only on leg 1, and may run alongside legs 2 and 3. Leg 5 also depends only on leg 1. Leg 7 needs legs 4 and 5. Releasing the
toolkit (`cli-vX.Y.Z`) after a leg merges lets the next one be walked against a published toolkit, as leg 1 is.

## Leg detail

### Leg 1 — Walk the SSH path

**Epic tasks:** `13.13`

**Why here:** the rest builds on deploying over SSH, which has only been run on a container on the operator's machine. It found four bugs
on its first run (fixed in 0.3.0). The guide (13.10) has never been walked as written.

**Technical notes:** follow `docs/operating.md` literally, as a user who is not root, with `--environment development`, and record
every command's output. Things already known: `sv setup` takes `--port` and `--user`; `docs/operating.md` shows `npm create
@sovereignfs my-instance` without the word `instance`; a container server needs `/var/lib/containerd` as a volume, or Docker cannot run a
container inside it.

**Do not proceed if:** a clean machine cannot reach a healthy core this way without a change to the design. That goes back to the spec
first.

### Leg 2 — Upgrades

**Epic tasks:** `13.14`

**Why here:** apps from git (leg 3) are upgraded through the command this leg adds.

**Technical notes:** reuse `newestPublishedCore` (`tools/cli/src/core-version.ts`) in `sv upgrade --finish`
(`tools/cli/src/commands/upgrade.ts`); `Registry.tags` (`tools/cli/src/registry.ts`) lists an app's tags; the manifest is read as
`sv app add` reads it (`tools/cli/src/commands/app.ts`). The backup before an app changes version belongs to step 3 of `sv apply`
(`tools/cli/src/apply/apply.ts`), comparing `state.json`'s app versions with the commit's.

**Do not proceed if:** leg 1 left a finding open.

### Leg 3 — Apps from git

**Epic tasks:** `13.15`

**Why here:** it needs `sv app upgrade` to follow `source`.

**Technical notes:** the template is `tools/create/template/app` (its Dockerfile, `scripts/manifest.mjs` and the manifest label); the CI
job that hosts it is `tools/cli/src/apply/app-template.docker.test.ts`. GHCR names are lower-cased. The publish workflow pins every
action to a commit, as this repository's do. `sv app add --git` ends in the same code as `--image`.

**Do not proceed if:** listing a public image's tags on GHCR needs a login: `sv` must work for a public app with no credential.

### Leg 4 — Rollback to a release

**Epic tasks:** `13.16`

**Why here:** small, and needed by leg 7's `rollback` command.

**Technical notes:** the server keeps five releases and `state.json` records `previous` (`tools/cli/src/apply/state.ts`); `rollback` is
a request the server already parses (`tools/cli/src/server/request.ts`) and answers (`tools/cli/src/server/receive.ts`). `--to` and
`--list` extend both. The pre-upgrade backup an app's rollback names comes from leg 2.

**Do not proceed if:** never.

### Leg 5 — Scheduled backups and S3

**Epic tasks:** `13.17`

**Why here:** the destination model, the schedule and one-app backups land with the first destination, so legs 6 and 7 add to it.

**Technical notes:** backups are made in `tools/cli/src/apply/backup.ts`, sent down by `tools/cli/src/commands/backup.ts`, and restored
by `tools/cli/src/apply/restore.ts`. `sv-backup` joins the fixed names in `tools/cli/src/apply/names.ts`. Choose the S3 client in the leg
for size in the toolkit's image (a small request signer over a full SDK). Test against a MinIO container. `backup` also goes into
`contracts/schemas/suite-v1.schema.json` here.

**Do not proceed if:** a backup cannot reach the destination without the server holding a key that reads it.

### Leg 6 — Backups to git and SFTP

**Epic tasks:** `13.18`

**Why here:** after the destination model exists.

**Technical notes:** `git` and `ssh` go into the toolkit's image (`tools/cli/Dockerfile`). Spawned `git` gets its key through its
environment (`GIT_SSH_COMMAND` with a key file), never on its command line (AGENTS.md hard rule). Test git against a local bare
repository and GitHub (one backup over 100 MB); SFTP against the container server.

**Do not proceed if:** never.

### Leg 7 — GitHub commands and private servers

**Epic tasks:** `13.19`

**Why here:** last, because it runs what legs 4 and 5 add.

**Technical notes:** the reusable workflow is `.github/workflows/deploy.yml`; the thin one is written by
`tools/cli/src/suite/workflow.ts`; the deployment key's verbs are checked in `tools/cli/src/server/receive.ts` (`--deploy-only`). The
Tailscale step's action is pinned to a commit like every other.

**Do not proceed if:** a command needs the runner to hold more than the deployment key and the repository's contents.

## Risks

- **Reaching the server from GitHub.** A home server is not reachable from GitHub's runners; leg 7 is not done until both routes are run.
- **Destination credentials live on the server.** A compromised server can write to the destination, and delete from it unless
  `keep: 0` and a write-only credential are used. The guide must say so.
- **Rolling an app back does not undo its migrations.** The pre-upgrade backup is the only full way back; leg 2 makes sure it exists.
- **The toolkit's image grows** with an S3 client, `git` and `ssh`. Keep the additions small and measured.
- **Private app images** are out of scope (operator-cli §12): an app whose GHCR image is private cannot be pulled by the server yet.

## Kill criteria

- If leg 1 shows the SSH path needs a redesign, stop and change the spec first; legs 2–7 wait.
- If leg 7 cannot work without the runner holding more than the deployment key, drop leg 7. The SSH path stays complete, with every
  other leg's capability.
- Each leg ships on its own: upgrades without apps from git, or backups to S3 without git or SFTP, are each coherent.

## Changelog

| Version | Date     | Change                                                            |
| ------- | -------- | ----------------------------------------------------------------- |
| 0.1     | Nov 2026 | Initial draft, with 13.12 (the specification) merged alongside it |
