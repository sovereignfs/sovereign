# RFC 0002 — Deployment: the operator CLI

|                |                                                                                                                                                                                             |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Status**     | Accepted; not implemented                                                                                                                                                                   |
| **Date**       | October 2026                                                                                                                                                                                |
| **Author**     | Claude Code, for review                                                                                                                                                                     |
| **Scope**      | New `apps/cli`; `sovereign-admin` in the image; a managed key on clients; `docs/specs/operator-cli.md`, `spec/suite.md`, `spec/app-manifest.md`; `docs/specs/core-app.md` §3.6, §3.7, §3.15 |
| **Tasks**      | [Epic 12](../epics/release.md), [Epic 13](../epics/operator-cli.md)                                                                                                                         |
| **Supersedes** | Nothing in this repository. The legacy `sovereign-infra` had a template for the old single platform; this replaces the need for a new one                                                   |

## Summary

Core is deployed from **one image, with no mode switch**. An operator can run it alone with any OpenID Connect apps, or
with Sovereign apps on its subdomains (`{app}.sovereign.fs`). The second is the first with apps added, not a different
kind of instance.

Operators manage either with **`sv`, a command line built in this repository**, and no `sovereign-infra` repository
exists. `@sovereignfs/create` makes a small git repository that belongs to the operator, holds what they chose, and pins
the toolkit as a dependency. Commands run from that repository change only its files. `./sv deploy` runs **`sv apply` on
the server**, which makes the server match them, and can be run again safely after a failure. Keeping up with upstream is
a small reviewed change to that pin.

Apps sign in by redirect, so a suite shares a **sign-in, not a cookie**.

## Motivation

Phase 1 is finished, and nothing says how to run it for real. An operator who wants one sign-in for the apps they already
run needs a guide, which task 12.2 wrote. An operator who wants the Sovereign product needs a proxy, certificates, a
client per app, a database per app and containers that can reach each other, and today works all of it out by hand.

They also need to stay current. A template gives them a copy with no way to take later changes. A fork takes changes but
cannot be private on GitHub when upstream is public, and an operator's repository holds their domain, their app list and
their encrypted secrets. Both conflict whenever upstream changes a file the operator edited. The cause is that settings
and code live in the same files, so this design keeps them apart.

## Current state

Checked in the repository, October 2026:

- **Scenario 1 works**, with limits. Task 0.6's acceptance suite signs a person in to a stock `openid-client` app, with
  consent, refresh, the Directory, both kinds of sign-out and revocation. The limits are below.
- **Core expects to be reachable at its own address** from inside its container (§3.15). In a suite this becomes every app
  reaching core, and core reaching every app.
- **A client is written only through `ClientRegistry`** (`apps/core/src/clients/registry.ts`), which takes a
  `RegistryActor` (an account and request headers) and checks `client:manage`. There is no way to script it, and nothing
  identifies a client across runs but its generated ID.
- **The image holds no command line.** `apps/core/scripts/seed.ts` runs through `tsx`, which is not in the image, and
  AGENTS.md requires the image to ship every CLI it needs.
- **Addresses in a client must be `https`**, or `http` on `localhost` on a development instance. An app's back-channel
  address cannot be an internal name like `http://app:3000`.
- **An `http` address that is not `localhost` gets an `https` issuer** in discovery, so it does not match `SV_URL`. An
  instance needs TLS from the start, including a test one.
- **Migrations go forward only**, applied when core starts (`docs/deploying.md`).
- **`packages/config` already implements** the environment rules, including `_FILE` secrets (`spec/env.md`).
- **Provisioning databases for apps is out of scope for core** (§3.16).
- **Core sends HSTS without `includeSubDomains`**, and its cookies use the `__Secure-` prefix, not `__Host-`.

## Goals

1. An operator goes from an empty folder to a running instance with a handful of commands.
2. Connecting an app they do not host, and adding one they do, are the same command with one flag between them.
3. Moving from no hosted apps to many needs no migration.
4. Taking an upstream update is a reviewed one-line change, and never a merge.
5. A failed deployment is fixed by running it again.
6. It works on a server reachable only from the operator's own network, with no GitHub involved.
7. Core's image and code are the same however it is deployed. Nothing in this repository names an app.
8. A compromised or careless app cannot act as a person on core or on another app.

## Non-goals

- Kubernetes, or a suite across several machines. One machine with Docker is the first target.
- Core creating databases, or holding an admin credential for them. §3.16 stays as it is.
- Sharing a session between apps by cookie.
- A hosted or multi-tenant offering.
- Upgrades that happen without the operator choosing them.
- Replacing the plain Compose files. `docs/deploying.md` stays a supported way to run core alone.

## Design

### Scenario 1: what "any app" means

Core is stricter than many providers, on purpose. This is what keeps some ordinary apps out today:

| Core's behaviour                                 | Consequence                                                                                                                                                     |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ID tokens are signed with EdDSA only             | An app whose library handles only RS256 cannot verify them. OpenID Connect Core makes RS256 the algorithm a provider must support, so such an app is reasonable |
| PKCE is required for every client                | A confidential app that does not send PKCE cannot sign in                                                                                                       |
| Clients are registered for `client_secret_basic` | An app that can send the secret only in the request body may be refused. Discovery lists `client_secret_post` too; this is not yet tested                       |
| No CORS on the token and userinfo endpoints      | A page with no server of its own cannot connect                                                                                                                 |

**Proposal:** keep the last, and close the first two per app rather than for the instance, off by default:

- **RS256 as an additional signing algorithm.** better-auth's JWT plugin accepts more than one key pair
  (`keyPairConfigs`), and discovery would list both. EdDSA stays the default.
- **"This app can't send PKCE"**, a technical setting for confidential apps only, which better-auth supports per client
  (`require_pkce`). A public app can never have it, and the Console says what it gives up.

Both change §3.6.1 and need a test against real apps first. Before the first release, a few widely used self-hosted apps
are tried (task 12.6), which shows whether both are needed. If the secret must also go in the body, that is a third per-app setting.

### One image, no mode

Core does not know whether it has neighbours. Everything that differs is in what surrounds it, so there is one thing to
test and one thing to release. The CLI has no `--standalone` or `--suite` either: an instance with no hosted apps is the
smallest case of one with many, and adding the first app changes nothing that was there.

### The parts

| Part                | Where it lives                                       | Where it runs           | What it does                                                  |
| ------------------- | ---------------------------------------------------- | ----------------------- | ------------------------------------------------------------- |
| `sv`                | `apps/cli` in this repository                        | The operator's machine  | Edits the instance repository, checks it, starts a deployment |
| `sv apply`          | `apps/cli`, published as an image as well            | The server              | Makes the server match the instance repository                |
| `sovereign-admin`   | `apps/core`, in core's image                         | Inside core's container | Registers apps through `ClientRegistry`                       |
| Instance repository | Made by `@sovereignfs/create`, owned by the operator | Any git host, or none   | Holds the operator's choices and their encrypted secrets      |

### Starting an instance

`@sovereignfs/create` follows npm's convention, so `npm create @sovereignfs` runs it. It makes one of two things, named by
a word:

```bash
npm create @sovereignfs instance my-instance
cd my-instance
./sv setup
```

- **`instance <dir>`** makes the instance repository below. It holds what the operator chose. It is not infrastructure
  code: that is generated on the server, from these files, by the pinned toolkit.
- **`app <dir>`** comes later and is out of scope here. It makes a Next.js app that already meets the app manifest: sign-in
  with core, `@sovereignfs/ui`, a health route, a back-channel logout route, its own migrations and an image. It needs its
  own design, and `spec/app-manifest.md` is what it has to satisfy.

With no word, it asks. `--instance` and `--app` are accepted as well, for anyone who prefers them, but the documented form
is the word: npm keeps a flag for itself unless it follows a `--`, and warns that such a flag stops working in its next
major version. A word needs no `--` on npm, pnpm or yarn.

`instance` runs `git init`, adds a remote if given `--remote URL`, installs the toolkit from the lockfile, and writes the
files below.

**The toolkit is run as `./sv`,** a small script in the repository, like Gradle's `./gradlew`. It runs only the copy in
`node_modules`, and installs from the lockfile if that is missing. `npx sv` is not used, because outside the repository or
before an install npx can fetch Svelte's `sv` package from npm and run it.

### The instance repository

```text
package.json          the pinned toolkit, @sovereignfs/cli
package-lock.json     its exact version and integrity
sv                    runs the pinned toolkit
suite.yml             what the operator chose: domain, versions, apps
suite.lock            the exact image digests those versions resolved to
secrets.age.yml       secrets the operator typed in, encrypted
overrides/            optional Compose and Caddy additions, applied last
.github/workflows/    a thin workflow that calls upstream's, if GitHub is used
.gitignore
```

Every file in it is the operator's. Nothing upstream owns is copied in, so an update can never conflict with it. What the
tool generates (the Compose files, the Caddyfile, each app's environment) is written on the server and never committed.

```yaml
schema: 1
domain: sovereign.fs
core:
  version: 0.49.0
database:
  version: '18'
server:
  host: 203.0.113.7
  deploy: ssh # or github
secrets:
  recipients:
    - age1operator...
    - age1server...
apps:
  notes:
    image: ghcr.io/example/notes:1.2.0
  wiki:
    external: true
    name: Team wiki
    redirect:
      - https://wiki.example.com/auth/callback
```

`spec/suite.md` defines this file, versioned by `schema`, with a JSON Schema the CLI validates against.

### Commands

```text
sv setup                          ask for the domain, the server and the database
sv doctor                         check DNS, ports, certificates and the versions in use
sv server bootstrap               prepare a fresh machine

sv app add NAME --image REF       host an app on a subdomain, with a database and a sign-in
sv app add NAME --external ...    give an app we do not host a sign-in only
sv app update NAME [--image REF]  change what an app runs, or its settings
sv app remove NAME [--purge]      stop and unregister an app; --purge also deletes its data
sv app list

sv secret set NAME                encrypt a value into secrets.age.yml; it is never written in plain text
sv secret rotate NAME             make a new client secret for an app, on the server

sv push                           check, commit the known files, and push
sv deploy [--ssh|--github]        run `sv apply` on the server, for the commit that is pushed
sv status                         what is running, against what the repository says
sv logs [NAME]                    read what the server is doing

sv upgrade [--to vX.Y.Z]          move to a newer release: toolkit, versions, digests and file format
sv rollback                       go back to the last deployment that worked
sv backup, sv restore             the databases and the server's secrets
```

`sv push` is worth having only for what it adds to git: it refuses a broken `suite.yml` or a secret in plain text, and
stages the repository's known files rather than everything.

`--purge` needs the app's name typed to confirm, and its data survives every other command.

### `sv apply`

The hard part, so it is specified first and built first. It reads the deployed commit and works through these steps, each
of which does nothing if its result is already true:

1. **Check.** The schema, the CLI's support for this core version, every app's manifest. Take a lock, so two deployments
   never overlap.
2. **Look.** Docker, disk space, DNS for each name. Anything wrong stops here, with nothing changed.
3. **Back up** the databases, if core or the database server is changing version.
4. **Render** the Compose files, Caddyfile and environment files into a new release directory.
5. **Start the base.** Networks, then the database server, then core, then wait for its health check.
6. **Each app,** in the order given: its database and role, its client (`sovereign-admin apps ensure`), its environment,
   its container, its health check, its proxy entry. An external app has only the client.
7. **Removed apps.** Stop the container, remove the proxy entry and the client. Data stays unless the removal was a purge.
8. **Verify.** From inside each container, its peers' public names answer, on real certificates.
9. **Record.** Point `current` at this release and write what was done.

A step that fails stops the run and names what to do. Nothing after it has happened, and running `sv deploy` again carries
on. An app that fails its health check does not stop apps already running.

The server holds:

```text
/var/lib/sovereign/
  releases/<commit>/    rendered files for each deployment; `current` points at the last that worked
  secrets/              generated secrets, readable by root only
  state.json            what was applied: each app's client ID, database and version
  age.key               the server's own decryption key
```

**Generated secrets stay on the server.** `SV_AUTH_SECRET`, the field encryption keys, database passwords and client
secrets are made there, once, and never leave except in a backup. So nothing has to be committed back from a deployment,
and a stolen repository holds none of them. The price is that the repository alone cannot rebuild an instance, but the
databases are not in it either, so a rebuild already needs a backup. `sv backup` covers both, encrypted to the operator's
key.

**Rollback** returns to the previous release's files. Migrations go forward only, so when core's version would go backward
it refuses and points at `sv restore`.

### Getting a deployment to the server

`sv deploy` refuses uncommitted or unpushed work, so what is deployed is always in git. It sends the exact commit as an
archive over SSH, so the server needs no credential for the repository, then runs `sv apply` there.

- **`--ssh`** does this from the operator's machine. It works on a home network, with no GitHub.
- **`--github`** starts a workflow in the instance repository, which calls a reusable workflow in this repository, pinned
  to the CLI's version, and does the same from a runner. It needs the server to be reachable from the internet.

The deployment key can run one command. `sv server bootstrap` installs it in `authorized_keys` with `command=` set, so it
receives an archive and starts `sv apply`, and gives no shell.

**The decryption key is not in GitHub.** Secrets are encrypted to the operator's key and the server's. A runner decrypts
nothing, so a leak of its credentials reveals no secret.

The server runs `sv apply` from the published image, at the digest in `suite.lock` that matches the pinned toolkit, so it
needs only Docker. Commands above are written `sv`, and run as `./sv`.

### Keeping up with upstream

`sv upgrade --to v0.49.0` updates the repository: the toolkit in `package.json` and its lockfile, core's version, the digests
in `suite.lock`, and `suite.yml` if its schema changed. The operator reviews the change, then pushes and deploys. Renovate
or Dependabot already understand `package.json`, so they can open the toolkit's update as a pull request, and `sv upgrade`
finishes it.

Because the toolkit is a locked dependency, every operator and every runner install the same version, with its integrity
checked, and there is no version field of our own to keep in step. Each CLI version states the core versions and schema
versions it supports.

### Registering apps: `sovereign-admin`

A small command line in core's image, called by `sv apply` and not by hand:

```text
sovereign-admin apps ensure KEY --name NAME --redirect URL ... [--trusted] [--json]
sovereign-admin apps list [--json]
sovereign-admin apps rotate-secret KEY [--json]
sovereign-admin apps remove KEY
```

- It calls `ClientRegistry`, so every rule of §3.7 applies, with the same refusals. It adds no second path to a client.
- **A managed key.** `ensure` needs to find the same client again on the next run, so a client gains an optional, unique
  key set only here. The Console shows such an app as managed from the command line, and a change made there is
  overwritten on the next deployment, which it says.
- **A secret is returned once**, with `--json`, and written to the server's `secrets/`.
- **A system actor.** `RegistryActor` becomes a union of today's operator and a `system` actor, which `#require` accepts.
  It is constructed in one place, this command's entry point, which no route or action imports; an architecture test holds
  that. Its trust comes from running inside the container: anyone who can do that already holds `SV_AUTH_SECRET`, so it
  grants nothing new. Each write is logged to the container's output.
- **Bundling.** One file, built in the Dockerfile's build stage and copied into the run stage, reading the same environment
  and database code as core. The image stays free of a package manager and of `tsx`.
- **No HTTP API for this.** An API needs a stored credential that can create clients, to do what `exec` does without one.

### Sign-in

- **By redirect only.** Each app is an ordinary OpenID Connect client of core. Someone signed in to core passes through
  silently, so moving to a second app feels like a single sign-in.
- **`SV_AUTH_COOKIE_DOMAIN` stays unset. This becomes a rule.** It would send core's session cookie to every app, and any
  app could then act as the person on core, including in the Console if they are an operator. `sv apply` refuses to run
  with it set.
- **Hosted apps are registered as trusted**, so people are not asked about each one, and they may receive `roles`. The
  operator chose to install them. An external app stays untrusted unless the operator says otherwise.
- **Sign-out** uses the existing back-channel logout. A notice that fails is not retried (§3.6.5), so apps must also stop
  when their tokens do.
- **Passkeys stay on core's host.** `SV_AUTH_WEBAUTHN_RP_ID` stays unset. Apps never run a passkey ceremony, since they send
  people to core. With core on the apex the default RP ID is the apex itself, and the origin check still limits a ceremony
  to core's own address.

### Topology

```text
                 https://sovereign.fs          https://notes.sovereign.fs
                          |                              |
                    +-----+------------------------------+-----+
                    |                  proxy                   |
                    |   every public name is also an alias     |
                    +-----+------------------------------+-----+
             core network |                  app network |
                    +-----+-----+                  +-----+-----+
                    |   core    |                  |    app    |
                    +-----+-----+                  +-----+-----+
             core network |                  app network |
                    +-----+------------------------------+-----+
                    |              database server             |
                    +------------------------------------------+
```

- **One proxy** holds every name and terminates TLS. Core and each app are reachable only through it.
- **One network per app, and one for core.** Each holds that container, the proxy and the database server, so an app can
  reach no other app except by its public address, as anyone can. The tool generates this, so a network per app costs
  nothing to maintain. `sv server bootstrap` widens Docker's default address pools, which run out after a few dozen networks.
- **Every public name is a network alias of the proxy** on each network, so a container resolving `notes.sovereign.fs`
  reaches the proxy, on the certificate a browser sees. This one rule covers an app reading core's keys, core checking its
  own, and core posting a logout notice. No client needs an internal address, which the registry would refuse anyway.
- **Each app is its own Compose project**, so it can be started, upgraded and removed alone.

**Certificates: one per host by default**, by the proxy's HTTP challenge, with a wildcard by DNS challenge as an option. A
per-host certificate needs no DNS provider credential on the server. The price is that each name appears in public
certificate logs. A server with no public port uses the DNS challenge.

### Databases

`sv apply` creates one database and one role per app, on one PostgreSQL server per instance. Core is not involved and holds
no credential for it. The server's admin credential stays with `sv apply`, and an app gets only its own URL and manages its
own migrations.

**PostgreSQL only, at first.** Its isolation is by credential. sqld namespaces separate data by name, and whether a
per-namespace credential is practical needs checking first. The plain Compose files keep sqld and SQLite for running core
alone.

### The app manifest

What an app must provide to be hosted, defined in `spec/app-manifest.md` so that this repository still names no app. It is
carried as a label on the app's image, so `sv app add` can read it from the registry without pulling, or given with
`--manifest URL`:

- the port it listens on and its health route;
- its redirect, post-logout and back-channel paths;
- the scopes it needs, which `sv app add` shows the operator;
- the names of the variables it reads for its public address, issuer, client ID, client secret and database URL, each
  secret also as `_FILE` (`spec/env.md`);
- the core versions it supports.

It applies its own migrations when it starts.

`sv app add notes` with no image needs a catalogue of known apps, which would name them. If that is wanted, it lives outside
this repository and is fetched when the command runs.

### Moving between apps

The launcher on core's address is the suite's home page, and that works today. An app that wants a switcher of its own needs
to know which apps a person can open. **Proposal:** add a Core API call listing the launcher's tiles (name, icon, launch
address), for a token with a new `launcher` scope, in `spec/core-api/openapi.yaml`. It is the only part of this RFC that adds
to the published contract, and it can wait until an app wants it.

### Packaging and release

- **`apps/cli`** is a workspace app, licensed AGPL-3.0-or-later like core. It reuses `packages/config`, and adds `yaml` and
  `age-encryption`.
- **One tag publishes three things,** `cli-vX.Y.Z`, like `ui-v`, by the same guards as core: `@sovereignfs/cli` and
  `@sovereignfs/create` to npm, so that they cannot drift apart, and the image `ghcr.io/sovereignfs/cli`.
- **`@sovereignfs/create` stays small,** and depends on nothing a fresh `npm create` would have to download for long.
- **Node is required on the operator's machine,** and never on the server.
- **Nothing is installed globally,** so `sv` cannot clash with Svelte's CLI or runit's service tool on the same machine.
- **Its tag is separate from `vX.Y.Z`,** because one CLI works with several core versions.

## Security and privacy

- **A subdomain can still set a cookie for its parent.** Keeping the cookie domain unset stops apps reading core's cookie,
  but an app on `notes.sovereign.fs` can set a cookie with `Domain=sovereign.fs`, which core receives. It cannot forge a
  session, but it could put a browser into a session it chose. The `__Host-` prefix prevents this, and core's cookies use
  `__Secure-`. Core uses `__Host-` when no cookie domain is set, in any deployment, from before the first release, so
  that nobody has to be signed out (task 12.5).
- **`sv apply` is root on the server,** because it holds the Docker socket. It runs only the digest in `suite.lock`, so a
  moved tag cannot change what runs, and the deployment key can start nothing else.
- **Everything in `suite.yml` runs.** An app's image gets a trusted client and a database. `sv app add` shows the scopes it
  asks for, and the repository's history shows who added it.
- **`sv push` refuses plain text** in the repository's files, as a guard rather than a guarantee. `sv secret set` never
  writes one.
- **A hostile app is contained to its own data:** its own role, its own network, and tokens only for itself.
- **HSTS** names no subdomains, and stays that way, so core's header cannot break something else on the domain.
- **The `sovereign-admin` system actor** is reachable only inside the container, and a test keeps it out of every route.
- **The database admin credential** stays on the server, and is never given to core or an app.
- **Backups hold every generated secret,** so they are always encrypted, to the operator's key and not the server's: a
  stolen server must not be enough to read an older backup copied elsewhere.

## Alternatives considered

- **A template repository.** No shared history, so every update is copied by hand.
- **A fork.** It cannot be private when upstream is public, and it conflicts on every file both sides change.
- **A separate `sovereign-infra` repository for the tool.** It gains nothing over a workspace app, and loses sharing
  `packages/config` and changing the tool in the same commit as what it depends on.
- **Running the whole tool as an image, on the operator's machine.** Workable, but every command needs Docker there and a
  long `docker run`. The server does this, since it has Docker anyway.
- **Applying from the operator's machine over the Docker API.** No release is left on the server, a dropped connection stops
  it halfway, and there is nothing to roll back to.
- **`sv add app` acting on the server directly.** It would make the repository a record of what happened rather than what
  should be, and would need the server to answer during every edit.
- **`--standalone` and `--suite`.** Two kinds of instance, and a migration between them, for a difference one list holds.
- **Committing generated secrets back to the repository.** The deployment would need write access to git, and the repository
  would become the thing worth stealing.
- **Thin wrappers for all of git** (`sv add origin`). They hide nothing worth hiding. `--remote` when creating covers the one
  moment it helps.
- **Installing the CLI globally,** with `sv init`. Each machine would need the right version, the pin would be a field of our
  own to check, and the name would have to be unique on the machine.
- **A standalone binary.** It would free operators from Node, at the price of a build per platform, and of Renovate and
  Dependabot no longer understanding the pin. It can follow if operators ask.
- **Core on a subdomain (`id.sovereign.fs`) with the launcher at the apex.** It would remove the cookie question above.
  Rejected because the apex is the product's address. Nothing depends on the apex, so an operator can still do it.
- **A shared session cookie across subdomains.** Simple for apps, and fatal: every app could act as every person.
- **Apps on paths (`sovereign.fs/notes`).** All apps would share an origin, and with it cookies and storage.
- **Core provisioning app databases.** It would give core an admin credential for every app's data.

## Testing

- **`sv apply` against real Docker in CI.** A fixture instance with a test image of a small app, using an internal
  certificate authority, since an instance needs TLS. Run twice, proving the second run changes nothing.
- **Failure at every step.** A test stops `sv apply` after each step and runs it again, proving it finishes.
- **Upgrade.** Deploy the previous release, then upgrade, on every CLI release.
- **Acceptance across apps.** Two apps, one person, moving between them with no second password, and signing out of core
  ending both.
- **The manifest and `suite.yml`** against their JSON Schemas, including every past schema version.
- **`sovereign-admin`** in `pnpm docker:smoke`: ensure twice, sign in, rotate, remove.
- **An architecture test** that nothing but `sovereign-admin`'s entry point builds a system actor.
- **The refusals:** the cookie domain set, a dirty tree, a plain-text secret.
- **Scenario 1:** a record of the third-party apps tried, in `docs/connecting-an-app.md`.

## Rollout

1. Try real third-party apps and release core (tasks 12.1 to 12.3, 12.6 and 12.8). Scenario 1 needs nothing more.
2. Write this RFC's outcome into the spec, with `spec/suite.md` and `spec/app-manifest.md`.
3. `sovereign-admin` in the image.
4. `sv apply` on a hand-written `suite.yml`: core, the proxy and the database.
5. Hosted and external apps in `sv apply`.
6. The commands on the operator's machine, and deploying over SSH.
7. Publishing the CLI, and `sv upgrade`.
8. Backup, restore and rollback, before anyone relies on it.
9. GitHub deployment, and the launcher API only if an app needs it.

Each is its own task. The tasks and their order are in [Epic 13](../epics/operator-cli.md).

## Open questions

1. **`__Host-` cookies.** Do this before the first release, while no instance exists to sign out? Leaning towards yes.
2. **RS256.** Add it now, or only when testing shows an app needs it? Leaning towards when testing shows it.
3. **An app catalogue.** Is `--image` enough at first? Leaning towards yes.
4. **Moving a server.** Is backup and restore enough for moving to a new machine, or does it need its own command? Leaning
   towards enough.

## Decision requested

Approve the design, answer the open questions (or accept the leanings), and confirm the order in the rollout. On approval,
the outcome goes into the spec before any code.

## Outcome

Accepted as proposed, with the open questions answered as leaned:

1. **`__Host-` cookies:** done before the first release, while no instance exists to sign out (task 12.5).
2. **RS256:** added only when testing shows an app needs it. Tasks 12.6 and 12.8 tried six apps ([research
   0002](../research/0002-third-party-app-compatibility.md)): two cannot verify EdDSA at all, and one of those needs the secret accepted
   in the request body as well. Both are task 12.7, which also ignores a scope core does not offer, where it now refuses the sign-in. A PKCE opt-out is not
   needed, since no app tried needed one.
3. **An app catalogue:** not at first. `--image` and `--manifest` are enough, and a catalogue, if one comes, lives outside
   this repository.
4. **Moving a server:** `sv backup` and `sv restore` are enough, with no command of its own.

`create` is told what to make by a word (`instance <dir>`, `app <dir>`), which needs no `--` on any package manager. The
flags are accepted too. `app <dir>` needs its own design.

The outcome goes into the spec in task 13.1, before any code in epic 13. That is
[`docs/specs/operator-cli.md`](../specs/operator-cli.md), `spec/suite.md`, `spec/app-manifest.md` and core-app §3.7.4, which
now win over this document. Writing them changed four things:

- **Wildcard certificates are not in the first version.** The stock proxy image has no DNS provider module, so a server with
  no public port uses `tls: internal`, and its devices must trust the server's authority.
- **A manifest names its prefix, not each variable,** and an app is given `spec/env.md`'s shared names under it, with
  `CORE_CLIENT_ID` and `CORE_CLIENT_SECRET` added. It also gains `generate` and `data`, since most apps need a secret of their
  own and somewhere to keep files.
- **`sv app show --secret`** is how an operator gets an external app's secret, which stays on the server.
- **A confidential client with no saved secret gets a new one,** since core returns a secret once and a run can stop between
  making the client and saving it.
