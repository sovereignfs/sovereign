# Sovereign — operator CLI specification

|            |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Status** | Draft. Specified from [RFC 0002](../rfcs/0002-deployment-strategies.md); the commands on the operator's machine and `sv apply` for core and apps, deploying over SSH, backups, restores, rollbacks, publishing, upgrading and deploying from GitHub are built ([epic 13](../epics/operator-cli.md)). Apps from git, app upgrades, rollback to a chosen release, backups to a destination and more commands from GitHub are specified and not built yet ([workstream 0001](../workstreams/0001-operator-workflow.md)) |
| **Covers** | `tools/cli`: the `sv` toolkit, `sv apply`, and `@sovereignfs/create`                                                                                                                                                                                                                                                                                                                                                                                                                                                 |

This document is the single source of truth for what the operator CLI does. Where code, another document or an issue
disagrees with it, this document wins until it is changed.

The key words **MUST**, **MUST NOT**, **SHOULD**, **SHOULD NOT** and **MAY** are used as described in RFC 2119.

The files it reads have their exact shapes elsewhere: [`contracts/suite.md`](../../contracts/suite.md) for the instance repository,
[`contracts/app-manifest.md`](../../contracts/app-manifest.md) for what an app provides, and [`contracts/env.md`](../../contracts/env.md) for
variable names. `sovereign-admin`, which ships in core's image, is in [core-app §3.7.4](core-app.md). This document
describes behaviour; those define the shapes.

---

## 1. What it is

The operator CLI deploys core, with or without apps, to one machine with Docker, and keeps it running and up to date.

### 1.1 Principles

1. **Files first.** A command on the operator's machine changes files in the instance repository and nothing else, unless
   this document says it reaches the server. What the server should be is always in git.
2. **The server converges.** `sv apply` makes the server match a commit. It can be run again at any point, and a run with
   nothing to do changes nothing.
3. **No modes.** An instance with no hosted apps is the smallest case of one with many. Nothing distinguishes them, and
   adding the first app migrates nothing.
4. **Upstream owns no file in the instance repository.** What is generated from it is written on the server and never
   committed, so an update can never conflict with an operator's change.
5. **Generated secrets stay on the server.** Nothing a deployment generates is committed back, and a runner decrypts
   nothing.
6. **Nothing here names an app.** An app is an image with a manifest.

### 1.2 Terminology

| Term                    | Meaning                                                                        |
| ----------------------- | ------------------------------------------------------------------------------ |
| **Instance repository** | The git repository an operator owns, holding what they chose (§2)              |
| **Toolkit**             | `@sovereignfs/cli`, pinned by the instance repository and run as `./sv`        |
| **Server**              | The one machine an instance runs on                                            |
| **Hosted app**          | An app run on the server, on a subdomain, with a database and a sign-in        |
| **External app**        | An app run elsewhere, which gets only a sign-in                                |
| **Operator's machine**  | Wherever an operator runs `./sv`. It needs Node, git and SSH, and never Docker |
| **Release**             | The files rendered for one commit, kept on the server (§7)                     |
| **Runner**              | A GitHub Actions job deploying the instance (§8.2)                             |

---

## 2. Creating an instance

`npm create @sovereignfs` runs `@sovereignfs/create`. It takes a word saying what to make, and a directory:

```bash
npm create @sovereignfs instance my-instance
```

- `instance <dir>` makes an instance repository in `<dir>`. `app <dir>` makes an app (§2.2).
- With no word it MUST ask, unless there is no terminal, when it MUST refuse and say what to pass.
- `--instance` and `--app` MUST be accepted in place of the word, read from the arguments or from `npm_config_instance` and
  `npm_config_app`, since npm keeps a flag before `--` for itself. The documented form is the word.
- `<dir>` MUST be empty or absent. Anything else is refused, and nothing is written.

`instance` MUST, in order: write the files of §2.1, run `git init`, install the toolkit from the lockfile it wrote, add
`--remote URL` as `origin` if given, and make the first commit. It MUST NOT push.

### 2.2 An app

`npm create @sovereignfs app my-notes` makes a Next.js app in `my-notes` that an instance can host as it stands. The folder's name is the
app's name (it MUST be one `sv app add` accepts, and not `sv`), its variable prefix is that name upper-cased without hyphens, and its title
is the name in words.

It MUST meet [`contracts/app-manifest.md`](../../contracts/app-manifest.md), and so MUST hold:

- `sovereign.manifest.json`, valid against the manifest schema, and a `Dockerfile` whose `io.github.sovereignfs.app-manifest` label is that
  manifest, with a script that checks the two agree and one that copies the manifest over the label;
- sign-in through `@sovereignfs/sdk` with its sessions and refresh tokens in the app's own database, the tokens encrypted, and routes for
  sign-in, the callback, sign-out, core's back-channel logout and core's account-deleted notice at the paths the manifest names;
- a page behind sign-in using `@sovereignfs/ui`, whose every server action asks who is calling and whose every delete names the owner;
- a health route that answers 200 when its database does;
- its own migrations, applied once each when it starts, behind a lock;
- an image that does not run as root, listens on 3000 and is configured by its environment alone;
- a workflow, `.github/workflows/publish.yml`, that on a `vX.Y.Z` tag builds that image for linux/amd64 and linux/arm64, with the
  manifest label, and publishes it to `ghcr.io/<owner>/<repository>` tagged `X.Y.Z`, which is where `sv app add --git` looks for it
  (§4.2.1).

`create` writes the files, runs `git init`, resolves the lockfile and makes the first commit. It MUST NOT install or build, and it
writes nothing outside the folder. The versions it writes are held by a test to the packages of this repository.

### 2.1 What an instance repository holds

```text
package.json          the pinned toolkit
package-lock.json     its exact version and integrity
sv                    the launcher (§3)
suite.yml             what the operator chose
suite.lock            the image digests those choices resolved to; generated
secrets.age.yml       secrets the operator entered, encrypted
overrides/            optional additions (contracts/suite.md)
.github/workflows/    a thin deployment workflow
.gitignore
README.md
```

`package.json` MUST pin `@sovereignfs/cli` to an exact version. Every file here belongs to the operator.

---

## 3. Running the toolkit

`sv` is a small script in the instance repository's root, run as `./sv`.

- It MUST run only the toolkit in the repository's `node_modules`.
- When that is missing it MUST run `npm ci`, and nothing else that fetches a package. It MUST NOT use `npx`, which can fetch
  an unrelated package of the same name from the registry.
- With no Node, or a Node the toolkit does not support, it MUST say so and stop.
- It MUST work from any directory inside the repository, and refuse outside one.

Nothing is installed globally. Every command below is written `sv` and run as `./sv`.

---

## 4. Commands

Each command MUST state what it changed, and MUST exit as §11 says.

### 4.1 Setting up

| Command               | What it does                                                                                                                                                                                                         | Reaches the server |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| `sv setup`            | Asks for the domain, the server, how to deploy and what the instance is for (`--environment`), and writes `suite.yml` on the newest core the toolkit supports (§5). Makes the operator's key if there is none (§9.1) | no                 |
| `sv server bootstrap` | Prepares a fresh machine (§8.3) and records its public key in `suite.yml`                                                                                                                                            | yes                |
| `sv doctor`           | Checks DNS, ports, certificates, the toolkit's versions and the server's Docker, and says what to fix. Changes nothing                                                                                               | yes, read only     |

### 4.2 Apps

| Command                          | What it does                                                                                                    | Reaches the server |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------ |
| `sv app add NAME --image REF`    | Adds a hosted app: reads its manifest, shows the scopes it asks for, and writes it to `suite.yml`               | no                 |
| `sv app add NAME --external ...` | Adds an external app, with its sign-in addresses                                                                | no                 |
| `sv app add NAME --git URL`      | Adds a hosted app from the image its repository publishes (§4.2.1)                                              | no                 |
| `sv app upgrade [NAME \| --all]` | Moves hosted apps to a newer release of their image, for review (§4.2.1)                                        | no                 |
| `sv app update NAME [...]`       | Changes what an app runs, or its settings                                                                       | no                 |
| `sv app remove NAME [--purge]`   | Takes an app out of `suite.yml`. With `--purge`, also records that its data goes (§6.2)                         | no                 |
| `sv app list`                    | Lists the apps in `suite.yml`                                                                                   | no                 |
| `sv app show NAME [--secret]`    | Shows what the server recorded for an app: its address, client ID and state. `--secret` shows its client secret | yes                |

- `sv app add` MUST read the manifest from the image's label, without pulling the image, or from `--manifest URL`. An image
  with neither is refused, as is a manifest this toolkit cannot read or whose `core` range excludes the instance's version.
- `sv app add NAME --external` MUST take `--name`, at least one `--redirect`, and MAY take `--post-logout`, `--back-channel`,
  `--scope`, `--public` and `--trusted`. An external app is untrusted unless `--trusted` is given.
- A hosted app's scopes come from its manifest and MUST be shown to the operator when it is added. A scope outside the
  manifest cannot be given to it.
- `--purge` MUST ask for the app's name to be typed, and with no terminal MUST need `--yes-delete-data NAME`.
- `sv app show --secret` is how an operator gets the secret an external app needs. It MUST NOT be offered by the deployment
  itself, whose output may be kept in a log.

#### 4.2.1 Apps from git, and upgrading apps

An app is deployed by its image and is never built on the server, which holds no credential for an app's repository. `--git` is a way to
name that image, and only an app that carries a manifest (`contracts/app-manifest.md`) can be added either way.

- `sv app add NAME --git URL [--tag X.Y.Z]` MUST take a GitHub repository address (`https://github.com/OWNER/REPO`, with or without
  `.git`) and look for its image at `ghcr.io/OWNER/REPO`, lower-cased. It takes the newest tag of the form `X.Y.Z`, or the one `--tag`
  names. A repository with no such image is refused, and the refusal names the workflow the app template carries (§2.2).
- From there it MUST do exactly what `--image` does: read the manifest from the label, show the scopes, refuse what `--image` refuses,
  and pin the digest in `suite.lock`. It MUST record the repository as the app's `source` (`contracts/suite.md` §1.7) and the image it found
  as its `image`.
- `sv app upgrade [NAME | --all] [--to X.Y.Z]` MUST, for each hosted app it names, list its image's tags, take the newest `X.Y.Z`
  newer than the one in `suite.yml` (or the one `--to` names), read that release's manifest, and refuse it when its `core` range
  excludes the instance's core, naming the core it needs. It MUST NOT move an app backward: that is `sv rollback` (§10.3).
- It MUST show each change of version and every scope added or removed, ask before writing when a scope is added (or need `--yes` with
  no terminal), and write `suite.yml` and `suite.lock` only. It changes nothing on the server: `sv push` and `sv deploy` do.
- An app added with `--image` is upgraded from its image's repository, and one with a `source` from that. An external app runs
  nothing, and is not upgraded by `sv`.

### 4.3 Secrets

| Command                             | What it does                                                                                 | Reaches the server |
| ----------------------------------- | -------------------------------------------------------------------------------------------- | ------------------ |
| `sv secret set NAME [--app APP]`    | Reads a value from a hidden prompt or standard input, and encrypts it into `secrets.age.yml` | no                 |
| `sv secret remove NAME [--app APP]` | Removes it                                                                                   | no                 |
| `sv secret list`                    | Lists names, never values                                                                    | no                 |
| `sv secret rekey`                   | Re-encrypts every value to the recipients in `suite.yml`                                     | no                 |
| `sv secret rotate APP`              | Gives an app a new client secret, on the server, and restarts it (§9.3)                      | yes                |

`sv secret set` MUST NOT take the value as an argument, where it would reach the shell's history and the process list.

### 4.4 Deploying

| Command                       | What it does                                                                      | Reaches the server |
| ----------------------------- | --------------------------------------------------------------------------------- | ------------------ |
| `sv push`                     | Checks the repository (§4.5), commits its known files, and pushes                 | no                 |
| `sv deploy [--ssh\|--github]` | Runs `sv apply` on the server for the pushed commit (§8)                          | yes                |
| `sv status`                   | What is running, against what the repository says                                 | yes, read only     |
| `sv mail [--port N]`          | Opens Mailpit's inbox on this machine, over SSH (below)                           | yes, read only     |
| `sv logs [NAME]`              | What core, an app or the last deployment printed                                  | yes, read only     |
| `sv seed [--json]`            | Makes test accounts and a sample app on a development or staging instance (below) | yes                |

`sv deploy` with neither flag uses `server.deploy` in `suite.yml`.

`sv mail` is for an instance whose `environment` is `development` or `staging` and that has not named its own mail server
(`contracts/suite.md` §1.1.1), and refuses any other. It MUST listen on this machine's loopback address only, reach the server's loopback
address only, run no command on the server, and stay open until the operator ends it. The inbox holds the links that verify and reset
accounts, so there MUST be no other way to it: it has no public name, and the server publishes it nowhere but its own loopback address.

`sv seed` runs `sovereign-admin seed` in core's container ([core-app §3.15.1](core-app.md); [workstream 0002](../workstreams/0002-test-instances.md)).

- It MUST refuse on a `production` instance, and exit 2, **before it connects**: the first of two checks, the second being core's own.
- Core MUST be running, and the answer is the command's: what it made and what it kept, and on `staging` each new account's password.
  `sv seed` MUST NOT write a password to a file or a log. The passwords are shown once, to the operator who asked.
- It is the operator's alone. The deployment key MUST NOT be able to run it (§8.2): a runner has no reason to seed an instance, and the
  output holds passwords.

### 4.5 What `sv push` checks

`sv push` MUST refuse, changing nothing, when:

- `suite.yml`, `suite.lock` or a manifest does not meet its schema, or `suite.lock` does not match `suite.yml`;
- a value in `secrets.age.yml` is not age ciphertext, or `suite.yml` holds a value that looks like a secret (`contracts/suite.md`);
- a file it would commit is outside the list of §2.1.

It MUST stage only the files of §2.1. It MUST NOT stage everything. These checks are a guard, not a guarantee, and MUST NOT be
described to operators as one.

### 4.6 Updating and recovering

| Command                                         | What it does                                                                                              | Reaches the server |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------ |
| `sv upgrade [--to vX.Y.Z]`                      | Moves the repository to a newer release (§10)                                                             | no                 |
| `sv rollback [--to RELEASE \| --list]`          | Returns the server to an earlier release that worked: the previous one, or one it names (§10.3)           | yes                |
| `sv backup [--app NAME] [--to PATH]`            | Takes a backup and copies it to the operator's machine, or sends it to the instance's destination (§10.2) | yes                |
| `sv backups`                                    | Lists the backups at the instance's destination and those kept on the server (§10.2.2)                    | yes, read only     |
| `sv restore PATH \| --from BACKUP [--app NAME]` | Restores a backup to the server, from a file or from the destination (§10.2)                              | yes                |

---

## 5. Pinning

- The toolkit's version is the one in `package.json`, held by `package-lock.json`. No other field pins it.
- `suite.yml` pins core and each app by version. `suite.lock` holds the digest each resolved to, and everything that runs on
  the server MUST run by digest, so a moved tag cannot change it.
- `sv` MUST be the only thing that writes `suite.lock`, and MUST refresh it when `suite.yml` changes what runs.
- Each toolkit release states the core versions and `schema` versions it supports, and the proxy and toolkit images it uses.
- A toolkit that does not support the instance's core version or `schema` MUST refuse, and name the version that does.
- `sv setup` starts an instance on the newest published core within the range the toolkit supports, never older than the toolkit's
  `newestCore`, the core it was made for. Only a plain `X.Y.Z` tag counts. If the registry cannot be asked, setup uses `newestCore`
  and says so. The version it writes is exact, and `suite.lock` pins its digest, as for any version (§6.3).

---

## 6. `sv apply`

`sv apply` runs on the server, from the toolkit's image at the digest in `suite.lock`. It is not run by hand: `sv deploy`
starts it (§8). It takes the files of one commit.

### 6.1 The steps

Every step MUST do nothing when its result is already true. In order:

1. **Check.** Take the lock (§6.3). Validate `suite.yml`, `suite.lock` and every manifest. Refuse anything in §6.5.
2. **Look.** Check Docker, free disk space, and that DNS for each name in the instance answers with this server. A problem
   stops the run here, with nothing changed.
3. **Back up.** When core, the database server or a hosted app would change version, take a backup (§10.2) and keep it on the
   server, and send it to the instance's destination when there is one (§10.2.2). If it fails, stop.
4. **Render.** Write the Compose files, the proxy's configuration and each environment into a new release directory (§7).
5. **Start the base.** Create the networks (§6.4), start the database server, generate any secret that does not exist yet,
   start core, and wait for its health check. Core applies its own migrations when it starts.
6. **Each app,** in `suite.yml`'s order:
   - hosted: ensure its database and role, ensure its client (`sovereign-admin apps ensure`), write its environment, start its
     container, wait for its health check, and add its proxy entry;
   - external: ensure its client.

   Core returns a client secret once. So `sv apply` MUST write it to `secrets/` before anything else, and a confidential
   client that already exists with no such file (a run stopped between the two) MUST be given a new secret, not left without
   one.

7. **Removed apps.** For an app in `state.json` and no longer in `suite.yml`: remove its proxy entry, stop its container, and
   remove its client. Its database, role, data and generated secrets stay unless the commit recorded a purge (§6.2).
8. **Verify.** From inside core and each hosted app, every peer's public name answers over https with a certificate that
   verifies, and core's discovery document names the instance's issuer.
9. **Record.** Point `current` at this release, and write `state.json`.

### 6.2 Purging

`sv app remove --purge` records the app's name under `purge` in `suite.yml`. At step 7 `sv apply` MUST delete that app's
database, role, data volumes and generated secrets, after taking a backup of that app. The record is removed by the next
`sv` command that writes the file. A purge of an app still listed under `apps` is refused.

### 6.3 Failing

- A failure at any step MUST stop the run, name what failed and what to do, and exit as §11 says. Nothing after the step has
  happened, and `current` has not moved.
- The exception is one app. A hosted app that fails at step 6 MUST NOT stop the other apps, which are still worked through;
  it is reported, the run still fails, and steps 8 and 9 are skipped. Core and other apps stay running.
- `sv apply` MUST NOT start an app's previous version by itself, because an app's migrations may already have run.
- Running `sv deploy` again MUST carry on and finish, whatever step the last run stopped at.
- One run at a time: a run that cannot take the lock MUST exit as §11 says, without waiting. A lock left by a process that has
  gone MUST NOT block the next run.

### 6.4 What it builds

- **One proxy,** Caddy, holds every public name and terminates TLS. Core and each hosted app are reachable only through it,
  and only the proxy publishes a port.
- **One network for core and one for each hosted app.** Each holds that container, the proxy and the database server, and
  nothing else, so an app reaches no other app except by its public address.
- **Every public name is a network alias of the proxy on every network.** A container resolving a public name reaches the
  proxy, on the certificate a browser sees. No client is given an internal address.
- **Each hosted app is its own Compose project,** so it can be started, upgraded and removed alone.
- **One PostgreSQL server per instance,** with one database and one role per hosted app, and one for core. Its admin
  credential stays with `sv apply`, and is given to neither core nor an app. An app applies its own migrations.
- **Certificates** are per host by default (`contracts/suite.md`).
- **Core is told what the instance is for.** Core's `SV_ENVIRONMENT` is the `environment` of `suite.yml`, and `core.env` MUST
  NOT set it, since a deployment that can be told otherwise would let the seed run on production (`contracts/suite.md` §1.1.1).

What goes into an app's environment is in [`contracts/app-manifest.md`](../../contracts/app-manifest.md).

### 6.4.1 As built

- **Names.** Compose projects are `sovereign-proxy`, `sovereign-database`, `sovereign-core` and `sovereign-app-<name>`; containers
  `sv-proxy`, `sv-database`, `sv-core` and `sv-app-<name>`; networks `sv-net-core` and `sv-net-app-<name>`. They are fixed, so a test, `sv
status` and a person reading `docker ps` agree, and `sv apply` will not run in a way that makes two.
- **A deployment that changes nothing recreates nothing.** Each Compose file carries its environment inline and mounts only paths that do
  not change between deployments (`secrets/`, `proxy/`, `pki/`), so Compose recreates a container only when its own configuration
  differs. The proxy's `Caddyfile` is kept at `proxy/Caddyfile` for the same reason and is reloaded in place when it changes.
- **Networks.** Compose attaches each container to core's network. The proxy's public names are aliases put on its networks by `sv
apply` itself after Compose, since an alias set that changes would otherwise recreate the proxy.
- **Secrets.** `secrets/` is `0700`, and each file in it `0444`: a container's own user is not root, and reads the file Docker mounts, so
  the protection is the directory's. Each is mounted read-only at `/run/secrets/<NAME>` and named to the container by its `_FILE` form.
- **The database.** Core's role is made with its password sent to `psql` on standard input, never as an argument, and `PUBLIC` is
  denied `CONNECT` on its database. The server's administrator password is its own secret, used by `sv apply` alone.
- **`tls.mode: internal`.** The proxy makes its own authority, whose certificate `sv apply` copies to `pki/root.crt` (replacing it only when it differs) and mounts the
  `pki/` folder, not the file, into core, with `NODE_EXTRA_CA_CERTS` naming it: a file mounted alone goes stale when it is replaced. Core
  needs it since core fetches its own signing keys from its public name and must trust the certificate it finds there.
- **The look at the machine** asks Docker for its version (24 or newer, Compose 2.20 or newer), the free space under the state directory
  (1 GB), and whether each public name resolves to the server's address. A name that does not is a refusal with `per-host`
  certificates, which cannot be issued without it, and a warning with `internal`. `--skip-dns` is for a server reached by another address.
- **An app (step 6)** gets, in this order: a network of its own, which the database server and the proxy join (the proxy with every
  public name as an alias); a role and a database named for it (`app_<name>`, a hyphen made an underscore) that only that role may open;
  its client at core, made by `sovereign-admin apps ensure` run inside core, whose secret is written to `secrets/` before anything else is
  done with it, and which is given a new secret if it exists with none on disk (a run stopped between the two); its environment and
  secrets by the `_FILE` form (`contracts/app-manifest.md` §3); its own Compose project; and a wait for its health path, asked from the proxy,
  which is on the app's network. The proxy answers for an app only once it is healthy, and keeps answering for those that were up while
  the others are looked at. An external app gets its client and nothing else.
- **An app taken out of `suite.yml`** (step 7) has its container removed, its client removed at core and its network removed. Its
  database, role, data volumes and secrets stay until a purge, which takes a backup first and then deletes them. What is running is
  looked at as well as `state.json`, since an app that never came up is not in it.
- **Verifying (step 8)** asks every public name, with a certificate that must verify, from inside core and from inside each hosted
  app's network namespace, using the toolkit's own image, since an app's image may have nothing to ask with.
- **A backup (step 3)** is taken before core's or the database's version changes, by the same code `sv backup` uses (§10.2): a
  `pg_dumpall` of every database, `state.json` and `secrets/`, in one archive encrypted to every recipient but the server's own.
- **The state directory** is `/var/lib/sovereign`, or `--state-dir` / `SV_STATE_DIR`. `--no-publish-ports` leaves the proxy's ports
  unpublished, for a test on a machine that has something on 80 or 443.

### 6.4.2 Mailpit

On a `development` or `staging` instance (`contracts/suite.md` §1.1.1), after the proxy and before core, `sv apply` starts Mailpit as a
Compose project of its own, `sovereign-mailpit`, container `sv-mailpit`, from the image `suite.lock` pins.

- It is on core's network. Its SMTP port is on that network and nowhere else, and takes mail without a login, since nothing outside the
  network can reach it.
- Its inbox is published on the server's loopback address, `127.0.0.1:8025`, and on no other address. It is the one port besides the
  proxy's that a container publishes, and `--no-publish-ports` leaves it unpublished too.
- Its mail is kept in a volume, so it survives a deployment, and is not part of a backup.
- When the instance becomes `production`, or the operator names a mail server, the next deployment removes the container and leaves the
  volume. `sv logs mailpit` shows what it printed.

### 6.4.3 Scheduled backups

When `backup.schedule` is set (`contracts/suite.md` §1.8), `sv apply` runs a container of its own, `sv-backup`, from the toolkit's image at the
digest in `suite.lock`, with the Docker socket and the state directory, as `sv-apply` has them. It takes a backup on the schedule and sends
it to the destination (§10.2.2). It publishes no port and joins no network but the default. When the schedule is removed, the next
deployment removes the container. A scheduled backup that fails is recorded in `state.json`, and `sv status` and `sv doctor` report it.

### 6.5 What it refuses

`sv apply` MUST refuse to run, changing nothing, when:

- `SV_AUTH_COOKIE_DOMAIN` is set in anything it would give core. A parent domain would send core's session cookie to every app,
  and any app could then act as the person on core ([core-app §3.5](core-app.md));
- `SV_AUTH_WEBAUTHN_RP_ID` is set, since apps never run a passkey ceremony and changing it later breaks passkeys;
- `suite.yml` names a value `sv apply` itself provides (`contracts/suite.md`);
- the toolkit does not support the instance's core version or `schema`;
- core's version would go backward, unless the run is a restore;
- `database.version` differs from the running server's major version;
- a manifest's `core` range excludes the instance's core version.

---

## 7. What the server holds

```text
/var/lib/sovereign/
  releases/<commit>/    the rendered files of each deployment
  current               a link to the last release that worked
  secrets/              generated secrets, one file each, readable by root only
  backups/              backups taken by deployments
  incoming/             the files of a deployment being received, removed by the next one
  toolkit-image         the toolkit's image, by digest, which the wrapper in 8.3 starts
  state.json            what was applied
  age.key               the server's decryption key, readable by root only
  lock
```

- `state.json` records, for each app, its client ID, its database and role, the version last started and whether it is
  healthy. It holds no secret.
- Nothing in `releases/` is a secret. An environment file names a secret by its path, through the `_FILE` form
  (`contracts/env.md`).
- Decrypted operator secrets MUST be written only to `secrets/`.
- The last five releases are kept, and always the one `current` names.

---

## 8. Deploying

`sv deploy` MUST refuse uncommitted or unpushed work, so that what is deployed is always in git. It sends the commit's files as
an archive, so the server holds no credential for the repository, and then starts `sv apply`.

### 8.1 `--ssh`

From the operator's machine, over the operator's own SSH access. It needs no GitHub, and works wherever that machine can
reach the server. Its output is shown as it happens, and it fails if the connection is lost before `sv apply` has been handed
the archive. After that, `sv apply` MUST carry on without the connection, and `sv logs` shows how it went.

### 8.2 `--github`

From a runner. `sv deploy --github` starts a workflow in the instance repository, which calls a reusable workflow in this
repository at the toolkit's version. The runner must reach the server over SSH (below).

- It authenticates with the deployment key (§8.3) and nothing else.
- A runner MUST NOT hold a key that decrypts `secrets.age.yml`.
- The thin workflow MUST also run by hand (`workflow_dispatch`), with a command: `deploy`; `rollback`, to the previous release or one
  named; `backup`, which the server sends to the instance's destination (§10.2.2), so the runner never receives an archive; and
  `app-upgrade`, which runs `sv app upgrade` on the runner and opens a pull request with the change, to be reviewed and merged before
  anything is deployed.
- The deployment key MUST allow exactly `version`, `deploy`, `rollback` and `backup` (§8.3). As built it allows `version` and `deploy` (§8.4).
- `sv server bootstrap`, `sv restore`, `sv secret` and anything else that needs the operator's key MUST stay on the operator's machine.
- A server that GitHub's runners cannot reach MUST be deployable in one of two ways that change nothing the runner holds: a self-hosted
  runner on a network that reaches it (the thin workflow takes the runner's labels), or a Tailscale network the workflow joins for the
  run, with its auth key kept as a repository secret.

#### 8.2.1 As built

- **Three pieces.** The reusable workflow in this repository (`.github/workflows/deploy.yml`, called at `@cli-vX.Y.Z`), the thin workflow
  in the instance repository (`.github/workflows/deploy.yml`, written by `sv setup --deploy github`, which runs on every push to `main`
  and on demand), and `sv deploy --ci`, which is what the runner runs. `sv upgrade` moves the version the thin workflow calls with the
  toolkit.
- **What the runner holds:** one secret, `SV_DEPLOY_KEY`. It checks out the repository without keeping a credential, installs the
  toolkit the repository pins with `npm ci --ignore-scripts`, and runs `./sv deploy --ci`, which writes the key and a `known_hosts` to a
  temporary folder, deploys, and removes them. It has no key that decrypts `secrets.age.yml`, and `sv deploy --ci` never decrypts.
- **The server is checked, not trusted at first sight.** A runner has no `known_hosts`, so `sv server bootstrap` writes the server's SSH
  host key to `server.hostKey` in `suite.yml` (and says when it changes), and the runner connects with `StrictHostKeyChecking=yes` against
  only that. `--ci` refuses when there is none.
- **`sv deploy --github`** starts that workflow on the pushed commit with `gh workflow run`, and refuses work that is not pushed. A push to
  `main` deploys without it.
- **Not tried here:** a run on a GitHub runner against a server.

### 8.3 `sv server bootstrap`

Runs over the operator's SSH access, once, and is safe to run again. It MUST:

- install Docker if it is absent, and refuse a version the toolkit does not support;
- when the SSH user is not root, add it to the `docker` group, since every `sv` command runs the toolkit's image as that user, and
  Docker's socket belongs to root and that group;
- create §7's directories;
- generate the server's age key, and add its public key to `secrets.recipients` in `suite.yml`;
- widen Docker's default address pools, which run out after a few dozen networks;
- install a deployment key in `authorized_keys`, limited with `command=` to the requests §8.2 allows it, and
  with no forwarding, no terminal and no other command, and print the private half once for the operator to store as a
  secret in the repository's Actions settings. With `server.deploy: ssh` it installs none.

### 8.4 As built

- **One program on the server.** `sv server bootstrap` installs `/usr/local/sbin/sovereign-receive`, a shell script of a dozen lines that
  runs the toolkit's image (the one named in `toolkit-image`) with the Docker socket and the state directory, and passes the request on as a
  single argument. It parses nothing. The toolkit answers the request, so the checking is code that is tested: a request is a verb and the
  few words it takes, each matched against a pattern (`version`, `deploy COMMIT`, `status`, `doctor`, `logs TARGET [LINES]`,
  `app NAME [--secret]`, `rotate NAME`), and anything else is refused. The deployment key runs the wrapper as `restrict,command="…
--deploy-only"`, and the toolkit then answers `deploy` and `version` and nothing else.
- **The archive** is what `git archive` writes for the pushed commit's `suite.yml`, `suite.lock`, `secrets.age.yml` and `overrides/`. The
  toolkit reads it with its own reader and writes nothing until the whole archive is accepted: a link, a device, a name that climbs out of
  the folder or is not an instance file, an archive over 32 MB or one that is cut short is refused. It is written to `incoming/<commit>/`.
- **The lock is checked too.** It arrives in the archive, and its toolkit image is run with the Docker socket, so the image is refused
  unless it is a reference by digest that cannot be read as an option.
- **`sv apply` runs in a container of its own,** `sv-apply`, started detached from the image named in the commit's `suite.lock` (pulled
  if the machine does not have it), with the Docker socket and the state directory at the same path as on the host, so the paths Compose
  mounts mean the same to the host's Docker. The receiving process follows its output to the operator and ends with its exit code; if the
  connection is lost, the container goes on. The container is kept after it ends, so `sv logs` shows the last deployment, and a second
  deployment is refused (exit 3) while it runs. When `sv apply` finishes it writes its image into `toolkit-image`, so the next request
  starts from the toolkit the instance now pins.
- **The deployment key is made on the operator's machine,** so its private half never exists on the server; the server gets the public half
  and the operator is shown the private half once. Running bootstrap again leaves an installed key alone unless `--new-deploy-key`.
- **The server's key** is made by the toolkit's image on the server (`sv server-key`) and printed; bootstrap adds it to
  `secrets.recipients` and re-encrypts what is held, which needs the operator's key (otherwise it says to run `sv secret rekey`).
- **Not tried here:** installing Docker on a clean Debian or Ubuntu machine, and a whole deployment on a virtual machine (§13). The
  script is checked to be a program a shell reads and its inputs are checked; the receiving side is run against real Docker with the
  toolkit's own image.

---

## 9. Secrets

### 9.1 What the operator enters

`secrets.age.yml` holds secrets the operator entered (an SMTP password, say), each encrypted to every recipient in `suite.yml`:
the operator's public key and the server's.

The operator's key is made by `sv setup` and kept outside the repository, at `~/.config/sovereign/age.key`, readable by them
alone. A second operator adds their public key to `secrets.recipients`, and someone who already has access runs `sv secret
rekey`. Removing a recipient and re-keying does not take back what they could already read, and `sv secret rekey` MUST say so.

### 9.2 What the server generates

`sv apply` generates these once, in `secrets/`, and never replaces them:

| Secret                                | For                       |
| ------------------------------------- | ------------------------- |
| `SV_AUTH_SECRET`                      | Core                      |
| `SV_FIELD_ENCRYPTION_KEYS`            | Core                      |
| The database's admin password         | `sv apply`                |
| A database role's password            | Core, and each hosted app |
| A client secret                       | Each confidential app     |
| What a manifest's `generate` asks for | That hosted app           |

They reach a container only through the `_FILE` form, MUST NOT appear in a log, and leave the server only in a backup.

So the repository alone cannot rebuild an instance. It holds neither the databases nor these secrets, and a rebuild needs a
backup (§10.2).

### 9.3 Rotating

`sv secret rotate APP` calls `sovereign-admin apps rotate-secret`, replaces the file, and restarts the app. The old secret stops
working at once ([core-app §3.7.3](core-app.md)), so an external app stops signing people in until it is given the new one,
and the command MUST say so before it runs.

`SV_AUTH_SECRET` is not rotated by any command: changing it signs everyone out and ends every two-factor enrolment.

---

## 10. Keeping up, and recovering

### 10.1 Upgrading

`sv upgrade [--to vX.Y.Z]` changes the repository and nothing else. Given a release, or the newest one, it MUST:

1. update `@sovereignfs/cli` in `package.json` and its lockfile;
2. update `core.version` in `suite.yml` to the newest published core within the range the toolkit supports, as `sv setup` chooses one
   (§5): never older than the toolkit's `newestCore`, and never backward;
3. rewrite `suite.yml` if its `schema` changed, and only then;
4. refresh `suite.lock`;
5. show what changed, for the operator to review before `sv push` and `sv deploy`.

It MUST NOT move an app's version, which `sv app upgrade` does (§4.2.1), or `database.version`. A newer `schema` than the toolkit knows is refused, and an older one is
migrated only by `sv upgrade`, never in passing by another command.

A dependency bot MAY open the change to `package.json`. `sv upgrade` then finishes it.

#### 10.1.1 As built

- **Two steps, because a toolkit can only describe itself.** `sv upgrade` installs the release asked for (`npm install --save-exact
--ignore-scripts`, which updates `package.json` and the lockfile), then runs the new toolkit's `sv upgrade --finish`, which does steps
  2 to 5 with that release's own idea of the core it was made for, the images it uses and the `schema` it reads. `--finish` is also what
  to run after a dependency bot has changed `package.json` and `npm ci` has installed it; it works offline except for resolving digests.
  With no `--to` it asks npm for the newest release and does nothing if that is the one running.
- **What it moves:** the toolkit's image in the lock, `core.version` to the release's `newestCore` (never backward; step 2 above, the
  newest published core, is not built yet), the schema through the
  migrations in order (none yet: there is one schema), and the digests of what changed. It shows each change, and writes `suite.yml` and
  `suite.lock` only when they are all good. A repository from a newer schema than the toolkit reads is refused, as is one that pins a
  different toolkit than the one running.
- **Release:** the toolkit, `create` and the image are one release on the tag `cli-vX.Y.Z` ([releasing](../releasing.md#releasing-the-toolkit)).
- **Not done here:** the CI job that deploys the previous release and upgrades it needs a published release to start from, so it waits
  for the first one.

### 10.2 Backing up and restoring

A backup MUST hold every database, each hosted app's data volumes, `state.json` and `secrets/`, encrypted to the operator's
key alone, so that the server cannot read a backup it no longer should.

`sv restore PATH` MUST need the operator's key, stop core and the hosted apps, restore everything, and start them, on the same
server or a new one. After the database is back and **before core is started for people**, it MUST run
`sovereign-admin instance restored` in core's container (`docker compose run --rm core sovereign-admin instance restored`, since core
is stopped) and MUST fail the restore if that command does not succeed: a backup brings back the sessions, consents and tokens that
were ended after it was taken, and that command ends them again and records the time, so that core refuses any token issued before it
([core-app §4.4](core-app.md)). Running it twice is harmless.

A restore also has to keep deletions that happened after the backup. `sv restore` MUST, **before** it stops core, run
`sovereign-admin instance deletions export` and keep the file under the server's own state; and, **after** `sovereign-admin instance
restored`, run `sovereign-admin instance deletions apply` with it (on standard input, or as a file), and remove the file ([core-app §4.5](core-app.md)). When core cannot
be reached to export (a server that is gone, restoring onto a new one), the restore goes ahead without it and MUST say that people
deleted since the backup will reappear. The file holds `sub`s and nothing else about a person. To move to a new server: `sv backup`, `sv server bootstrap` on the new one, change `server.host`, and
`sv restore`. There is no other command for it.

A backup taken by a deployment (§6.1) stays on the server, under the same encryption.

#### 10.2.1 As built

- **What a backup holds:** one `pg_dumpall` of every database and role, `state.json`, the generated secrets, and a tar of each hosted
  app's data volume (`sovereign-app-<name>_data-<n>`, copied through the toolkit's image, which has `tar`). Volumes are copied while the
  app runs, so they are as consistent as a crash would leave them. It is encrypted to `secrets.recipients` without the server's own key.
- **`sv backup`** has the server make one, sends it down the connection as it is, and does not keep a copy there. The backups a
  deployment takes stay in `backups/`, and are restored by copying them down (`scp`) and using `sv restore`.
- **`sv restore`** decrypts here, with your key, and sends the pushed commit's deployment files and then the backup in the clear over
  the encrypted connection: the server has no key that opens a backup. The server runs `sv apply --restore-from`, which, in this order:
  backs up what is there (when there is something), keeps the deletions core remembers, stops core and the apps, puts the backup's
  secrets in place **before** any is made, starts the database server, empties it and loads the dump (the only errors it accepts are the
  administrator's own role, which it cannot drop while connected as it), puts each app's volume back, and, with core still stopped, runs
  `sovereign-admin instance restored` and then `instance deletions apply` in a container of its own. Only then does it start the proxy,
  core and the apps, and verify as a deployment does. A restore may take core's version backward.
- **`sv rollback`** applies the previous release's files again, as the commit they were. `state.json` records which that is
  (`previous`); only the last five releases are kept. It is refused when core's version would go backward, and says so before it runs
  for apps.
- **Not done:** the volumes of the proxy (certificates are issued again), and restoring a backup taken by a newer toolkit than the one
  restoring it.

#### 10.2.2 Destinations, schedules and one app

Not built yet. A backup leaves the server for the operator's machine (`sv backup`), and may also go to a **destination**, on a
schedule, without the operator's machine.

- **What is sent** is the archive `sv backup` makes: encrypted to the operator's recipients and not the server's own key, so the
  destination need not be trusted and the server cannot read what it sent.
- **Destinations** (`backup.destination` in `suite.yml`, `contracts/suite.md` §1.8): `s3`, any S3-compatible store (an endpoint, a bucket, a
  prefix); `git`, a repository kept for backups alone; `sftp`, a directory on a machine reached over SSH, whose host key is pinned as
  `server.hostKey` is. With a destination, a backup taken by a deployment (§6.1) or by the schedule (§6.4.3) is sent to it, and
  `sv backup` sends to it when it is given no `--to`.
- **A git destination** MUST NOT be the instance's own repository: `sv push` refuses one with the same address as `origin`. Each backup
  is one commit with no parent, on a branch of its own, `backup/<timestamp>`, so that deleting the branch frees what it held; its archive
  is split into parts of at most 95 MB, beside a list of the parts and their SHA-256, since GitHub refuses a file over 100 MB.
- **Credentials** for a destination are secrets the operator enters (`contracts/suite.md` §3, under `backup`), decrypted only on the server,
  and SHOULD be able to write and nothing more: an S3 key that may put objects, a git deploy key for that repository alone, an SFTP
  account in that directory alone.
- **Retention:** `backup.keep` is how many backups are kept at the destination; after one is sent, older ones beyond that are deleted.
  `0` deletes none, for a store whose own rules expire them, so that its credential need not be able to delete.
- **Listing and restoring:** `sv backups` lists what is at the destination and what is kept on the server. `sv restore --from BACKUP`
  fetches one with the operator's own access to the destination (their S3 credentials in the environment, their git or SSH access),
  never with the server's, and then restores it as `sv restore PATH` does: it is decrypted on the operator's machine.
- **One app:** `sv backup --app NAME` holds that app's database and role and its data volumes, under the same encryption.
  `sv restore --app NAME` stops that app, puts them back and starts it, and touches neither core nor another app. Core's record of the app
  (its client and the consents people gave it) is not in such a backup and is not changed.

### 10.3 Rolling back

`sv rollback` applies the previous release's files, and `sv rollback --to RELEASE` those of a release the server still keeps (§7);
`sv rollback --list` lists them, each with its commit, when it was applied, and the versions of core and of each app it ran. Core's
migrations go forward only, so when the release has an older core `sv rollback` MUST refuse, and point to `sv restore`. Rolling an app back
does not undo its migrations: the command MUST say so before it runs, and name the backup taken before that app's version last changed
(§6.1).

---

## 11. Output and exit codes

- Every refusal MUST say what is wrong and what to do about it.
- `--json` on a read command MUST print a stable document and nothing else.
- With no terminal, a command that would ask MUST refuse and say what to pass.
- No secret value is ever printed, except by `sv app show --secret`, and `sv server bootstrap`'s deployment key.

| Code | Meaning                                     |
| ---- | ------------------------------------------- |
| `0`  | Done, or nothing to do                      |
| `1`  | It failed partway. Running it again is safe |
| `2`  | Refused, with nothing changed               |
| `3`  | Another deployment holds the lock           |

---

## 12. Not in this version

A suite across several machines; Kubernetes; building an app's image on the server; an app with no manifest; pulling a private image
on the server; restoring through GitHub; sqld or SQLite under `sv apply` (the plain Compose files keep both for running
core alone); wildcard certificates; an app catalogue; a standalone binary; automatic upgrades; `app <dir>`; a Core API call
listing a person's apps; changing `database.version` on a running instance.

Wildcard certificates, and so a server with no public port and a publicly trusted certificate, need a proxy image built
with a DNS provider's module, which the stock image does not carry.

## 13. This version is done when

1. From an empty folder, `npm create`, `sv setup`, `sv server bootstrap`, `sv push` and `sv deploy` reach a healthy core on a
   new virtual machine, following `docs/operating.md` as written.
2. `sv deploy` run again changes nothing.
3. A deployment stopped after any step of §6.1 finishes when run again.
4. Two hosted apps and one person: moving between them asks for no second password, and signing out of core ends both.
5. An external app signs in with what `sv app show --secret` gives.
6. A hosted app cannot reach another app's container or database.
7. Every refusal in §6.5 and §4.5 is tested.
8. `sv upgrade` moves an instance from the previous release, on every release.
9. A backup restored to a new machine gives a working instance.
10. `sv deploy --ssh` works with no GitHub, and a runner decrypts nothing.
11. An app made from the template is hosted with `sv app add --git`, from the image its own workflow published, and `sv app upgrade`
    moves it to its next release.
12. `sv upgrade` moves core to the newest published release, and never backward.
13. `sv rollback --to` returns to a named release, and refuses as §10.3 says.
14. A scheduled backup reaches each kind of destination, and is restored from it to a new machine with `sv restore --from`.
15. `sv backup --app` and `sv restore --app` bring one app back without touching core or another app.
16. From GitHub, deploy, rollback and backup run against a server the runners reach, and against one reached through a self-hosted
    runner.
17. `sv seed` makes the accounts and the sample app on a development instance and on a staging one, with a random password on staging,
    and is refused on production by `sv` before it connects and by core when it is asked to anyway.

## Changelog

| Date       | Change                                                                                                                                                                                                                                                                                              |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-10-30 | First draft, from the accepted RFC 0002.                                                                                                                                                                                                                                                            |
| 2026-11-01 | Apps from git and app upgrades (§4.2.1), backups before an app changes version, scheduled backups to S3, git or SFTP and per-app backups (§6.4.3, §10.2.2), rollback to a named release (§10.3), and more commands from GitHub (§8.2): [workstream 0001](../workstreams/0001-operator-workflow.md). |
| 2026-11-01 | `sv seed` and core's `SV_ENVIRONMENT` (§4.4, §6.4, §13): test accounts and a sample app on development and staging instances, refused on production: [workstream 0002](../workstreams/0002-test-instances.md).                                                                                      |
