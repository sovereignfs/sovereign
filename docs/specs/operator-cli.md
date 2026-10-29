# Sovereign — operator CLI specification

|            |                                                                                                                              |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------- |
| **Status** | Draft. Specified from [RFC 0002](../rfcs/0002-deployment-strategies.md); not built yet ([epic 13](../epics/operator-cli.md)) |
| **Covers** | `apps/cli`: the `sv` toolkit, `sv apply`, and `@sovereignfs/create`                                                          |

This document is the single source of truth for what the operator CLI does. Where code, another document or an issue
disagrees with it, this document wins until it is changed.

The key words **MUST**, **MUST NOT**, **SHOULD**, **SHOULD NOT** and **MAY** are used as described in RFC 2119.

The files it reads have their exact shapes elsewhere: [`spec/suite.md`](../../spec/suite.md) for the instance repository,
[`spec/app-manifest.md`](../../spec/app-manifest.md) for what an app provides, and [`spec/env.md`](../../spec/env.md) for
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

- `instance <dir>` makes an instance repository in `<dir>`. `app <dir>` is reserved and is not specified here: until it is,
  it MUST say so and change nothing.
- With no word it MUST ask, unless there is no terminal, when it MUST refuse and say what to pass.
- `--instance` and `--app` MUST be accepted in place of the word, read from the arguments or from `npm_config_instance` and
  `npm_config_app`, since npm keeps a flag before `--` for itself. The documented form is the word.
- `<dir>` MUST be empty or absent. Anything else is refused, and nothing is written.

`instance` MUST, in order: write the files of §2.1, run `git init`, install the toolkit from the lockfile it wrote, add
`--remote URL` as `origin` if given, and make the first commit. It MUST NOT push.

### 2.1 What an instance repository holds

```text
package.json          the pinned toolkit
package-lock.json     its exact version and integrity
sv                    the launcher (§3)
suite.yml             what the operator chose
suite.lock            the image digests those choices resolved to; generated
secrets.age.yml       secrets the operator entered, encrypted
overrides/            optional additions (spec/suite.md)
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

| Command               | What it does                                                                                                                | Reaches the server |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| `sv setup`            | Asks for the domain, the server and how to deploy, and writes `suite.yml`. Makes the operator's key if there is none (§9.1) | no                 |
| `sv server bootstrap` | Prepares a fresh machine (§8.3) and records its public key in `suite.yml`                                                   | yes                |
| `sv doctor`           | Checks DNS, ports, certificates, the toolkit's versions and the server's Docker, and says what to fix. Changes nothing      | yes, read only     |

### 4.2 Apps

| Command                          | What it does                                                                                                    | Reaches the server |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------ |
| `sv app add NAME --image REF`    | Adds a hosted app: reads its manifest, shows the scopes it asks for, and writes it to `suite.yml`               | no                 |
| `sv app add NAME --external ...` | Adds an external app, with its sign-in addresses                                                                | no                 |
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

| Command                       | What it does                                                      | Reaches the server |
| ----------------------------- | ----------------------------------------------------------------- | ------------------ |
| `sv push`                     | Checks the repository (§4.5), commits its known files, and pushes | no                 |
| `sv deploy [--ssh\|--github]` | Runs `sv apply` on the server for the pushed commit (§8)          | yes                |
| `sv status`                   | What is running, against what the repository says                 | yes, read only     |
| `sv logs [NAME]`              | What core, an app or the last deployment printed                  | yes, read only     |

`sv deploy` with neither flag uses `server.deploy` in `suite.yml`.

### 4.5 What `sv push` checks

`sv push` MUST refuse, changing nothing, when:

- `suite.yml`, `suite.lock` or a manifest does not meet its schema, or `suite.lock` does not match `suite.yml`;
- a value in `secrets.age.yml` is not age ciphertext, or `suite.yml` holds a value that looks like a secret (`spec/suite.md`);
- a file it would commit is outside the list of §2.1.

It MUST stage only the files of §2.1. It MUST NOT stage everything. These checks are a guard, not a guarantee, and MUST NOT be
described to operators as one.

### 4.6 Updating and recovering

| Command                    | What it does                                                                              | Reaches the server |
| -------------------------- | ----------------------------------------------------------------------------------------- | ------------------ |
| `sv upgrade [--to vX.Y.Z]` | Moves the repository to a newer release (§10)                                             | no                 |
| `sv rollback`              | Returns the server to the last release that worked (§10.3)                                | yes                |
| `sv backup [--to PATH]`    | Copies the databases, app data and the server's secrets to the operator's machine (§10.2) | yes                |
| `sv restore PATH`          | Restores a backup to the server (§10.2)                                                   | yes                |

---

## 5. Pinning

- The toolkit's version is the one in `package.json`, held by `package-lock.json`. No other field pins it.
- `suite.yml` pins core and each app by version. `suite.lock` holds the digest each resolved to, and everything that runs on
  the server MUST run by digest, so a moved tag cannot change it.
- `sv` MUST be the only thing that writes `suite.lock`, and MUST refresh it when `suite.yml` changes what runs.
- Each toolkit release states the core versions and `schema` versions it supports, and the proxy and toolkit images it uses.
- A toolkit that does not support the instance's core version or `schema` MUST refuse, and name the version that does.

---

## 6. `sv apply`

`sv apply` runs on the server, from the toolkit's image at the digest in `suite.lock`. It is not run by hand: `sv deploy`
starts it (§8). It takes the files of one commit.

### 6.1 The steps

Every step MUST do nothing when its result is already true. In order:

1. **Check.** Take the lock (§6.3). Validate `suite.yml`, `suite.lock` and every manifest. Refuse anything in §6.5.
2. **Look.** Check Docker, free disk space, and that DNS for each name in the instance answers with this server. A problem
   stops the run here, with nothing changed.
3. **Back up.** When core or the database server would change version, take a backup (§10.2) and keep it on the server. If it
   fails, stop.
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
- **Certificates** are per host by default (`spec/suite.md`).

What goes into an app's environment is in [`spec/app-manifest.md`](../../spec/app-manifest.md).

### 6.5 What it refuses

`sv apply` MUST refuse to run, changing nothing, when:

- `SV_AUTH_COOKIE_DOMAIN` is set in anything it would give core. A parent domain would send core's session cookie to every app,
  and any app could then act as the person on core ([core-app §3.5](core-app.md));
- `SV_AUTH_WEBAUTHN_RP_ID` is set, since apps never run a passkey ceremony and changing it later breaks passkeys;
- `suite.yml` names a value `sv apply` itself provides (`spec/suite.md`);
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
  state.json            what was applied
  age.key               the server's decryption key, readable by root only
  lock
```

- `state.json` records, for each app, its client ID, its database and role, the version last started and whether it is
  healthy. It holds no secret.
- Nothing in `releases/` is a secret. An environment file names a secret by its path, through the `_FILE` form
  (`spec/env.md`).
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
repository at the toolkit's version. It needs the server to be reachable from the internet.

- It authenticates with the deployment key (§8.3) and nothing else.
- A runner MUST NOT hold a key that decrypts `secrets.age.yml`.

### 8.3 `sv server bootstrap`

Runs over the operator's SSH access, once, and is safe to run again. It MUST:

- install Docker if it is absent, and refuse a version the toolkit does not support;
- create §7's directories;
- generate the server's age key, and add its public key to `secrets.recipients` in `suite.yml`;
- widen Docker's default address pools, which run out after a few dozen networks;
- install a deployment key in `authorized_keys`, limited with `command=` to receiving an archive and starting `sv apply`, and
  with no forwarding, no terminal and no other command, and print the private half once for the operator to store as a
  secret in the repository's Actions settings. With `server.deploy: ssh` it installs none.

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
2. update `core.version` in `suite.yml`;
3. rewrite `suite.yml` if its `schema` changed, and only then;
4. refresh `suite.lock`;
5. show what changed, for the operator to review before `sv push` and `sv deploy`.

It MUST NOT move an app's version, or `database.version`. A newer `schema` than the toolkit knows is refused, and an older one is
migrated only by `sv upgrade`, never in passing by another command.

A dependency bot MAY open the change to `package.json`. `sv upgrade` then finishes it.

### 10.2 Backing up and restoring

A backup MUST hold every database, each hosted app's data volumes, `state.json` and `secrets/`, encrypted to the operator's
key alone, so that the server cannot read a backup it no longer should.

`sv restore PATH` MUST need the operator's key, stop core and the hosted apps, restore everything, and start them, on the same
server or a new one. To move to a new server: `sv backup`, `sv server bootstrap` on the new one, change `server.host`, and
`sv restore`. There is no other command for it.

A backup taken by a deployment (§6.1) stays on the server, under the same encryption.

### 10.3 Rolling back

`sv rollback` applies the previous release's files. Core's migrations go forward only, so when the previous release has an
older core `sv rollback` MUST refuse, and point to `sv restore`. Rolling an app back does not undo its migrations, and the
command MUST say so before it runs.

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

A suite across several machines; Kubernetes; sqld or SQLite under `sv apply` (the plain Compose files keep both for running
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

## Changelog

| Date       | Change                                   |
| ---------- | ---------------------------------------- |
| 2026-10-30 | First draft, from the accepted RFC 0002. |
