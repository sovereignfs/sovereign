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

#### 📋 13.2 — `sovereign-admin` in the image

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

#### 📋 13.3 — `sv apply`: the base

**Goal:** A hand-written `suite.yml` becomes a running core behind a proxy, and running it again changes nothing.

**Priority:** 3.

**Deliverables:**

- `apps/cli`, in the workspace and CI's change classification, with its licence
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

#### 📋 13.4 — `sv apply`: apps

**Goal:** Listing an app in `suite.yml` gives it a sign-in, and a hosted one a subdomain and a database.

**Priority:** 4.

**Deliverables:**

- Steps 6 and 7 of `sv apply`: database and role, client, environment, container, health check, proxy entry
- One network per app, with every public name aliased to the proxy
- External apps, which get only a client
- Reading the manifest from an image's label, or a given address
- Purging: `--purge`, its typed confirmation, and step 7 deleting the app's data after backing it up (operator-cli §6.2)
- `overrides/` for each app
- The two-app acceptance test: moving between apps with no second password, signing out of core ending both

**Dependencies:** 13.2, 13.3

**Spec reference:** operator-cli §6.1, §6.2, §6.4; `spec/app-manifest.md`; core-app §3.6.5, §3.7.4

**Review checklist:**

- An app cannot reach another app's container or database
- A failing app stops only itself
- Removing an app keeps its data, and only a purge deletes it
- A run stopped between making a client and saving its secret gives the app a new secret

#### 📋 13.5 — Commands on the operator's machine

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

**Not here:** `app <dir>`, the Next.js app template (13.11).

- A plain value never reaches the disk or the command history
- `sv push` stages only known files

#### 📋 13.6 — Deploying over SSH `[parallel]`

**Goal:** `sv deploy` works from a laptop to a server on a home network, with no GitHub.

**Priority:** 6.

**Deliverables:**

- `sv server bootstrap`: Docker, directories, the server's key, a deployment key limited with `command=`, address pools
- `sv deploy --ssh`: refuses unpushed work, sends the commit as an archive, runs `sv apply` from the pinned image
- `sv status`, `sv logs`, `sv doctor`, `sv app show`, `sv secret rotate`

**Dependencies:** 13.4

**Spec reference:** operator-cli §7, §8.1, §8.3, §9.3

**Review checklist:**

- The deployment key gives no shell
- The server holds no credential for the repository
- Following the guide on a new virtual machine reaches a healthy instance

#### 📋 13.7 — Publishing and upgrading

**Goal:** An operator starts from `npm create`, and takes an update with one reviewed change.

**Priority:** 7.

**Deliverables:**

- A `cli-vX.Y.Z` tag publishes `@sovereignfs/cli`, `@sovereignfs/create` and `ghcr.io/sovereignfs/cli`, by the same guards
  as core
- `suite.lock`, holding the image digest that matches the pinned toolkit
- `sv upgrade`, including rewriting `suite.yml` when its schema changes
- A CI job that deploys the previous release and upgrades it

**Dependencies:** 13.6

**Spec reference:** operator-cli §5, §10.1; `spec/suite.md` §2, §4

**Review checklist:**

- Images run by digest
- Every past schema version upgrades cleanly

#### 📋 13.8 — Backup, restore and rollback

**Goal:** A lost server is a recovery, not a rebuild from nothing, and a bad deployment can be undone.

**Priority:** 8.

**Deliverables:**

- `sv backup` and `sv restore`: every database and the server's secrets, encrypted to the operator's key
- `sv rollback`, refusing when core's version would go backward
- A backup before any deployment that changes core or the database server

**Dependencies:** 13.6

**Spec reference:** operator-cli §10.2, §10.3

**Review checklist:**

- A backup restored to a new machine gives a working instance, with people still signed in to their apps
- A backup cannot be read with what the server holds

#### 📋 13.9 — Deploying from GitHub `[parallel]`

**Goal:** A push can deploy without the operator's machine, and without GitHub holding a secret that decrypts anything.

**Priority:** 9.

**Deliverables:**

- A reusable workflow in this repository, pinned by the CLI's version, and the thin one `@sovereignfs/create` writes
- `sv deploy --github`

**Dependencies:** 13.7

**Spec reference:** operator-cli §8.2

**Review checklist:**

- A runner decrypts nothing
- Every action is pinned to a commit

#### 📋 13.10 — The operator's guide

**Goal:** Someone who has not seen this repository can run an instance from the documents alone.

**Priority:** 10.

**Deliverables:**

- `docs/operating.md`: from an empty folder to two apps, updating, backing up, and what to do when a deployment fails
- `docs/deploying.md` points to it, and keeps the plain Compose route

**Dependencies:** 13.8

**Spec reference:** operator-cli §13

**Review checklist:**

- Walked through as written on a new machine

#### 📋 13.11 — The app template

**Goal:** `npm create @sovereignfs app <dir>` makes a Next.js app that can be hosted as it stands.

**Priority:** 11.

**Deliverables:**

- Its design, in `docs/specs/operator-cli.md`, replacing the line that reserves it. `support/sovereign-plugin-template` is a possible
  starting point, though it was built for the plugin model
- A template that meets `spec/app-manifest.md`: sign-in through the SDK, `@sovereignfs/ui`, a health route, a back-channel logout
  route, its own migrations, an image, and the manifest label
- CI that creates an app from it, builds it, and hosts it with `sv apply`

**Dependencies:** 13.4, 14.3

**Spec reference:** operator-cli §2; `spec/app-manifest.md`

**Review checklist:**

- A new app is hosted with no change to what the template made
- The template stays in step with the manifest and the SDK, by that CI job
