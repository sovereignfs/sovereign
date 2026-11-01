# Epic 13: Operator CLI

> An operator goes from an empty folder to a running instance, adds apps, and keeps up with upstream, with one command
> line.

## Status

⏳ In Progress. [RFC 0002](../rfcs/0002-deployment-strategies.md) is accepted

## Overview

`@sovereignfs/create` makes a small repository the operator owns, which pins the toolkit. `./sv`, run from it, changes only
its files. `sv apply` runs on the
server and makes it match them. `sovereign-admin`, in core's image, registers apps. This epic follows the RFC's rollout,
and the hardest part, `sv apply`, comes before the commands that drive it.

## Related

- [docs/rfcs/0002-deployment-strategies.md](../rfcs/0002-deployment-strategies.md): the design, the alternatives, the open questions
- [docs/specs/operator-cli.md](../specs/operator-cli.md): what the CLI must do, and where every task below is checked
- [spec/suite.md](../../spec/suite.md) and [spec/app-manifest.md](../../spec/app-manifest.md): the files it reads
- [docs/specs/core-app.md](../specs/core-app.md): §3.5, §3.7.4, §3.15, §3.16
- [spec/env.md](../../spec/env.md): the rules an app's variables follow
- Epic 12 releases the image that this epic deploys
- [docs/workstreams/0001-operator-workflow.md](../workstreams/0001-operator-workflow.md): the order 13.13–13.19 are built in, and the decisions behind them
- [docs/workstreams/0002-test-instances.md](../workstreams/0002-test-instances.md): 13.20–13.21, and the decisions behind them

## Tasks

#### ✅ 13.1 — The specifications

**Goal:** What the CLI must do, what an instance repository holds and what an app must provide are written down before any
of it is built.

**Priority:** 1.

**Deliverables:**

- `docs/specs/operator-cli.md`: every command, the steps of `sv apply`, deploying, secrets, upgrades and recovery
- `spec/suite.md` and `spec/app-manifest.md`, with JSON Schemas under `spec/schemas/`, and a test that holds the documents'
  examples to them
- The RFC's outcome in core's spec: `sovereign-admin`, the managed key and the system actor (§3.7.4)
- The shared variable names apps are given, in `spec/env.md`

**Dependencies:** 12.4

**Spec reference:** §3.7.4, §3.15; RFC 0002

**Review checklist:**

- No app is named
- Every field has one meaning, and a rule for what happens when the schema version changes
- Every failure of `sv apply` has a stated result, and running it again is defined at every step

#### ✅ 13.2 — `sovereign-admin` in the image

**Goal:** Something inside the container can register an app, under every rule the Console follows.

**Priority:** 2.

**Deliverables:**

- A `system` actor for `ClientRegistry`, and an architecture test that only this command's entry point builds one
- A managed key on clients, in a migration on all three databases, and the Console's note on managed apps
- `sovereign-admin apps ensure|list|rotate-secret|remove`, bundled into the image
- `pnpm docker:smoke` runs it

**Dependencies:** 13.1

**Spec reference:** §3.7

**Review checklist:**

- Every write goes through `ClientRegistry`, and each is logged
- `ensure` run twice changes nothing and makes one client
- The image gains no package manager and no `tsx`

#### ✅ 13.3 — `sv apply`: the base

**Goal:** A hand-written `suite.yml` becomes a running core behind a proxy, and running it again changes nothing.

**Priority:** 3.

**Deliverables:**

- `tools/cli`, in the workspace and CI's change classification, with its licence
- Steps 1 to 5, 8 and 9 of the RFC's `sv apply`: checks, a lock, rendering, networks, PostgreSQL, Caddy, core, verifying,
  releases and `state.json`
- Generated secrets on the server, and the refusals of operator-cli §6.5
- Certificates in both `tls` modes, `per-host` and `internal`
- `overrides/` for core, the proxy and the database (`spec/suite.md` §5)
- A small test app, with a manifest, for this task and 13.4 to deploy
- A CI job that runs it against real Docker, twice, and stops it after each step and resumes

**Dependencies:** 12.3, 13.1

**Spec reference:** operator-cli §6, §7, §9.2; core-app §3.15

**Review checklist:**

- A second run changes nothing
- A run stopped after any step finishes when run again
- No secret reaches a log or the release directory's world-readable files

#### ✅ 13.4 — `sv apply`: apps

**Goal:** Listing an app in `suite.yml` gives it a sign-in, and a hosted one a subdomain and a database.

**Priority:** 4.

**Deliverables:**

- Steps 6 and 7 of `sv apply`: database and role, client, environment, container, health check, proxy entry
- One network per app, with every public name aliased to the proxy
- External apps, which get only a client
- Reading the manifest from an image's label, or a given address
- Purging: `--purge`, its typed confirmation, and step 7 deleting the app's data after backing it up (operator-cli §6.2)
- `overrides/` for each app
- The two-app acceptance test: two apps and an external one up together, kept apart, a failing one stopping only itself, removal and purge, against real Docker (the sign-in half, moving between apps with no second password and signing out of core ending both, needs an app that signs in and is done by hand on the first real instance, operator-cli §13)

**Dependencies:** 13.2, 13.3

**Spec reference:** operator-cli §6.1, §6.2, §6.4; `spec/app-manifest.md`; core-app §3.6.5, §3.7.4

**Review checklist:**

- An app cannot reach another app's container or database
- A failing app stops only itself
- Removing an app keeps its data, and only a purge deletes it
- A run stopped between making a client and saving its secret gives the app a new secret

#### ✅ 13.5 — Commands on the operator's machine

**Goal:** An operator never edits `suite.yml` by hand unless they want to.

**Priority:** 5.

**Deliverables:**

- `@sovereignfs/create`: `instance <dir>`, `git init`, `--remote`, the toolkit pinned and installed, the `./sv` script
- `sv setup`, `sv app add|update|remove|list`, `sv secret set|remove|list|rekey`, `sv push`
- Secrets encrypted to the operator's key and the server's, and a plain text check on push
- `--json` on read commands, and the exit codes of operator-cli §11

**Dependencies:** 13.1

**Spec reference:** operator-cli §2, §3, §4, §9.1; `spec/suite.md`

**Review checklist:**

- These commands change only files
- `./sv` never fetches anything but what the lockfile names

**Not here:** `app <dir>`, the Next.js app template (13.11), and the server's own key as a recipient, which `sv server bootstrap` adds (13.6).

- A plain value never reaches the disk or the command history
- `sv push` stages only known files

#### ✅ 13.6 — Deploying over SSH `[parallel]`

**Goal:** `sv deploy` works from a laptop to a server on a home network, with no GitHub.

**Priority:** 6.

**Deliverables:**

- `sv server bootstrap`: Docker, directories, the server's key, a deployment key limited with `command=`, address pools
- `sv deploy --ssh`: refuses unpushed work, sends the commit as an archive, runs `sv apply` from the pinned image
- `sv status`, `sv logs`, `sv doctor`, `sv app show`, `sv secret rotate`
- The toolkit as an image (`tools/cli/Dockerfile`), which is what the server runs; publishing it is 13.7

**Not verified here:** following the guide on a new virtual machine, and Docker's installation on one. The checklist's last item is done by hand on the first real instance (operator-cli §13).

**Dependencies:** 13.4

**Spec reference:** operator-cli §7, §8.1, §8.3, §9.3

**Review checklist:**

- The deployment key gives no shell
- The server holds no credential for the repository
- Following the guide on a new virtual machine reaches a healthy instance

#### ✅ 13.7 — Publishing and upgrading

**Goal:** An operator starts from `npm create`, and takes an update with one reviewed change.

**Priority:** 7.

**Deliverables:**

- A `cli-vX.Y.Z` tag publishes `@sovereignfs/cli`, `@sovereignfs/create` and `ghcr.io/sovereignfs/cli`, by the same guards
  as core
- `suite.lock`, holding the image digest that matches the pinned toolkit
- `sv upgrade`, including rewriting `suite.yml` when its schema changes
- A CI job that deploys the previous release and upgrades it

**Not done here:** the CI job that deploys the previous release and upgrades it needs a published release to start from; it is added with the first release (12.3). The workflow itself, the package rules for a tool, and `sv upgrade` are tested; the publish has not run.

**Dependencies:** 13.6

**Spec reference:** operator-cli §5, §10.1; `spec/suite.md` §2, §4

**Review checklist:**

- Images run by digest
- Every past schema version upgrades cleanly

#### ✅ 13.8 — Backup, restore and rollback

**Goal:** A lost server is a recovery, not a rebuild from nothing, and a bad deployment can be undone.

**Priority:** 8.

**Deliverables:**

- `sv backup` and `sv restore`: every database and the server's secrets, encrypted to the operator's key. `sv restore` runs
  `sovereign-admin instance restored` before core starts for people, and fails if it does not succeed (operator-cli §10.2)
- `sv rollback`, refusing when core's version would go backward
- A backup before any deployment that changes core or the database server

**Dependencies:** 13.6

**Spec reference:** operator-cli §10.2, §10.3

**Verified here:** against real Docker, an instance with an app holding data in its database and a volume is backed up, lost with every container, volume and the state directory, and restored on a fresh state directory: the app's data, its client and its secret come back, and what was written after the backup does not. People staying signed in to their apps is not tried: a restore ends every session by design (core-app §4.4).

**Review checklist:**

- A backup restored to a new machine gives a working instance, with people still signed in to their apps
- A backup cannot be read with what the server holds

#### ✅ 13.9 — Deploying from GitHub `[parallel]`

**Goal:** A push can deploy without the operator's machine, and without GitHub holding a secret that decrypts anything.

**Priority:** 9.

**Deliverables:**

- A reusable workflow in this repository, pinned by the CLI's version, and the thin one `@sovereignfs/create` writes
- `sv deploy --github`

**Not verified here:** a run on a GitHub runner against a real server. The workflow is tested for what it holds and how it is pinned, and `sv deploy --ci` against a fake server, with the key and the host key written to files that are gone afterwards.

**Dependencies:** 13.7

**Spec reference:** operator-cli §8.2

**Review checklist:**

- A runner decrypts nothing
- Every action is pinned to a commit

#### ✅ 13.10 — The operator's guide

**Goal:** Someone who has not seen this repository can run an instance from the documents alone.

**Priority:** 10.

**Deliverables:**

- `docs/operating.md`: from an empty folder to two apps, updating, backing up, and what to do when a deployment fails
- `docs/deploying.md` points to it, and keeps the plain Compose route

**Not verified here:** the guide has not been walked through on a new machine. It was written from the commands as built, and its commands, flags and promises were checked against them. Walking it is the first thing to do with the first release.

**Dependencies:** 13.8

**Spec reference:** operator-cli §13

**Review checklist:**

- Walked through as written on a new machine

#### ✅ 13.11 — The app template

**Goal:** `npm create @sovereignfs app <dir>` makes a Next.js app that can be hosted as it stands.

**Priority:** 11.

**Deliverables:**

- Its design, in `docs/specs/operator-cli.md`, replacing the line that reserves it. `support/sovereign-plugin-template` is a possible
  starting point, though it was built for the plugin model
- A template that meets `spec/app-manifest.md`: sign-in through the SDK, `@sovereignfs/ui`, a health route, a back-channel logout
  route, its own migrations, an image, and the manifest label
- CI that creates an app from it, builds it, and hosts it with `sv apply`

**Verified:** a generated app was installed against this repository's packages, type-checked and built with Next.js. The test that builds its image and hosts it with `sv apply` (`app-template.docker.test.ts`) is run by CI. It also found that `@sovereignfs/ui`'s published bundle imported a CSS file that is not in `dist/` (fixed in `ui` 0.89.1, with a build check), and that a Server Component cannot import the bundle directly (the template re-exports it from a client module).

**Dependencies:** 13.4, 14.3

**Spec reference:** operator-cli §2, §2.2; `spec/app-manifest.md`

**Review checklist:**

- A new app is hosted with no change to what the template made
- The template stays in step with the manifest and the SDK, by that CI job

#### ✅ 13.12 — The specification for the operator workflow

**Goal:** What an operator needs after the first deployment, adding apps from their repositories, upgrading them, rolling back to a
chosen release, and backing up to somewhere other than their own machine, is written down before any of it is built.

**Priority:** 12.

**Deliverables:**

- `docs/specs/operator-cli.md`: apps from git and app upgrades (§4.2.1), the app template's publish workflow (§2.2), a backup before an
  app changes version (§6.1), scheduled backups (§6.4.3), destinations and one-app backups (§10.2.2), rollback to a named release
  (§10.3), the newest published core in `sv upgrade` (§10.1), more commands from GitHub and servers its runners cannot reach (§8.2), and
  the acceptance items that go with them (§13)
- `spec/suite.md`: an app's `source` (§1.7) and `backup` (§1.8)
- Tasks 13.13–13.19, and [workstream 0001](../workstreams/0001-operator-workflow.md), which orders them

**Dependencies:** 13.11

**Spec reference:** operator-cli §2.2, §4.2.1, §6.1, §6.4.3, §8.2, §10; `spec/suite.md` §1.7, §1.8

**Review checklist:**

- `sv server bootstrap`, `sv push` and `sv deploy` stay three commands
- The server still builds nothing and holds no credential for a repository, and a runner still decrypts nothing
- Every new command says what it changes, and what it refuses

#### 📋 13.13 — The SSH path, walked on a server

**Goal:** `docs/operating.md` is followed as written, over SSH, to a running core that people can sign up to, and what it finds is fixed.

**Priority:** 13.

**Deliverables:**

- A walk from an empty folder with the published toolkit: `npm create`, `sv setup`, `sv server bootstrap`, `sv push`, `sv deploy`,
  `sv doctor`, `sv status` and `sv logs`, on a machine that is not the operator's (a virtual machine, or a server in a container with
  `/var/lib/containerd` as a volume), as a user who is not root
- `environment: development` with Mailpit: an account signed up and verified through `sv mail`
- A second `sv deploy` that changes nothing, and a reboot that core comes back from
- A fix for each finding, and the guide corrected where it is wrong

**Dependencies:** 13.12

**Spec reference:** operator-cli §13 (1, 2); `docs/operating.md`

**Review checklist:**

- Every command was run as the guide says, and its output read
- Each finding has a fix, or a reason it is not one, in the pull request

#### 📋 13.14 — Upgrades for core and apps

**Goal:** An operator moves core to its newest release, and an app to its next, with one command each, and can review the change before
it is deployed.

**Priority:** 14.

**Deliverables:**

- `sv upgrade` takes core to the newest published release within the toolkit's range, never older than `newestCore` and never backward
- `sv app upgrade [NAME | --all] [--to X.Y.Z]`: the newest release of each app's image whose manifest accepts the instance's core, with
  versions and scopes shown, and files written for review
- `sv apply` takes a backup before an app's version changes

**Dependencies:** 13.13

**Spec reference:** operator-cli §4.2.1, §6.1, §10.1

**Review checklist:**

- Nothing moves backward
- An app whose manifest excludes the instance's core is refused, naming the core it needs
- A scope an upgrade adds is shown and asked about

#### 📋 13.15 — Apps from git

**Goal:** An app's repository publishes its own image, and an operator adds the app by naming the repository.

**Priority:** 15.

**Deliverables:**

- `.github/workflows/publish.yml` in the app template: linux/amd64 and linux/arm64 images on `vX.Y.Z` tags, with the manifest label,
  published to `ghcr.io/<owner>/<repository>`
- `sv app add NAME --git URL [--tag X.Y.Z]`, which resolves the image and then does what `--image` does, and records `source`
- `sv app upgrade` follows `source`

**Dependencies:** 13.14

**Spec reference:** operator-cli §2.2, §4.2.1; `spec/suite.md` §1.7

**Review checklist:**

- An app made from the template, tagged once, is hosted with `sv app add --git` and nothing else
- A repository with no published image is refused, and told how to publish one
- The server pulls by digest and holds no credential for the repository

#### 📋 13.16 — Rollback to a chosen release `[parallel]`

**Goal:** A bad deployment can be undone to any release the server still keeps, not only the last one.

**Priority:** 16.

**Deliverables:**

- `sv rollback --list`, with each kept release's commit, date, and the versions of core and each app it ran
- `sv rollback --to RELEASE`, with the refusals of §10.3, and for an app that goes back, the backup taken before its version changed

**Dependencies:** 13.13

**Spec reference:** operator-cli §10.3

**Review checklist:**

- A release with an older core is refused, and the refusal points to `sv restore`
- Rolling an app back says, before it runs, that its migrations stay

#### 📋 13.17 — Scheduled backups to S3, and one app's backup

**Goal:** Backups leave the server on their own, on a schedule, to storage the operator chooses, and one app can be backed up and
restored alone.

**Priority:** 17.

**Deliverables:**

- `backup` in `suite.yml` and its schema; `sv-backup`, run by `sv apply` when a schedule is set; retention by `keep`
- The `s3` destination, with its credentials as operator secrets under `backup`
- `sv backups`, `sv restore --from BACKUP`, `sv backup --app` and `sv restore --app`
- A failed scheduled backup in `sv status` and `sv doctor`

**Dependencies:** 13.13

**Spec reference:** operator-cli §6.4.3, §10.2.2; `spec/suite.md` §1.8, §3

**Review checklist:**

- What reaches the destination cannot be read with what the server holds
- `sv restore --from` reads the destination with the operator's own access, never the server's
- `keep: 0` needs no permission to delete

#### 📋 13.18 — Backups to git and SFTP `[parallel]`

**Goal:** A git repository or a machine reached over SSH can be the destination as well as S3.

**Priority:** 18.

**Deliverables:**

- The `git` destination: one parentless commit per backup on `backup/<timestamp>`, parts of at most 95 MB with their SHA-256,
  retention by deleting branches, and `sv push` refusing the instance's own repository
- The `sftp` destination, with its host key pinned

**Dependencies:** 13.17

**Spec reference:** operator-cli §10.2.2; `spec/suite.md` §1.8

**Review checklist:**

- A backup over 100 MB reaches a GitHub repository and is restored from it
- Deleting old backups frees what they held

#### 📋 13.19 — More from GitHub, and servers its runners cannot reach

**Goal:** An operator deploys, rolls back and backs up from GitHub Actions, to a server on the internet or on a private network, with
the runner still holding nothing that decrypts.

**Priority:** 19.

**Deliverables:**

- Manual commands in the thin workflow: `deploy`, `rollback`, `backup`, and `app-upgrade`, which opens a pull request
- The deployment key allowing exactly `version`, `deploy`, `rollback` and `backup`
- A self-hosted runner (the workflow takes its labels) and a Tailscale step, documented in `docs/operating.md`
- The first run on a GitHub runner against a real server, which 13.9 could not do

**Dependencies:** 13.16, 13.17

**Spec reference:** operator-cli §8.2, §8.3

**Review checklist:**

- A runner decrypts nothing, and receives no backup
- Bootstrap and restore cannot be run from GitHub
- Every action is pinned to a commit

#### 📋 13.20 — Core knows what the instance is for

**Goal:** Core is told whether it is a development, staging or production instance, so that what only a test instance may do can be refused anywhere else, and a mistake cannot read as a permission.

**Priority:** 20.

**Deliverables:**

- `SV_ENVIRONMENT` in core's configuration: `development`, `staging` or `production`, `production` when unset, and any other value a start-up error. Declared in `apps/core/.env.example` and in core-app §3.15's table
- `sv apply` gives core `SV_ENVIRONMENT` from `environment` in `suite.yml`; `core.env` cannot set it (the schema and `suiteProblems` refuse it, as they refuse the other names the deployment provides)
- The spec's "not built yet" notes for this removed

**Dependencies:** 13.12

**Spec reference:** core-app §3.15.1; operator-cli §6.4; `spec/suite.md` §1.1.1, §1.2

**Review checklist:**

- An instance with no `environment` is told `production`
- A value that is not one of the three stops core, naming the three
- `core.env` setting `SV_ENVIRONMENT` is refused, with or without `_FILE`

#### 📋 13.21 — Seeding development and staging instances

**Goal:** A development or staging instance can be tried at once, with accounts to sign in as and an app to sign in from, and a production instance can never be seeded.

**Priority:** 21.

**Deliverables:**

- `sovereign-admin seed [--json]`: an owner, an admin and an ordinary person at `@sovereign.local`, and one public sample app made through the registry as the system actor; idempotent; refused when `SV_ENVIRONMENT` is not `development` or `staging`, and when any account that is not a seed account exists
- Passwords by environment: one documented password on `development` (`SEED_PASSWORD` to change it), a random one of at least 24 characters per account on `staging`, written once to the command's output and never logged or shown again
- `pnpm seed` moved onto the same code, keeping its rule that core's address must be on the machine
- `sv seed [--json]`: refused on production before it connects, not available to the deployment key, and the passwords never written to a file
- `docs/operating.md`: how to seed and sign in; the "not built yet" notes removed from the specs

**Dependencies:** 13.20

**Spec reference:** core-app §3.15.1, §3.7.4; operator-cli §4.4; `spec/suite.md` §1.1.1

**Review checklist:**

- Each of the two checks refuses on its own: the environment alone, and an existing real account alone
- Running it twice makes nothing the second time
- A staging password cannot be read back from anywhere after it is shown
- The sample app's redirect is settled against core-app §3.7.3 and holds on a development machine and on a server
