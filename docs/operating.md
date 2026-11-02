# Running an instance

This is for the person who runs Sovereign: core, with the apps people sign in to through it, on one machine you control. It takes you
from an empty folder to two apps, and then to updating, backing up, and putting right a deployment that failed. Everything is done
with `sv`, the operator toolkit, from your own computer. What it promises, and why, is in
[the specification](specs/operator-cli.md).

If you only want core on a machine with Docker, without the toolkit, [Deploying core](deploying.md) has the plain Compose route.

## What you need

- **A machine** with a public address that you can reach over SSH as `root`, or as a user who can use `sudo` without a password.
  Debian or Ubuntu is easiest: `sv` installs Docker there. On anything else, install Docker 24 or newer with Compose 2.20 or newer first.
- **A domain** you can add DNS records to: one name for core, and one for each app you host.
- **On your computer:** Node 24 or newer, git, and SSH access to the machine. A git remote to push to (a private repository) is
  where your instance lives.
- **Ports 80 and 443** reachable on the machine, for certificates and for people.
- **A free address range.** `bootstrap` widens Docker's address pools to `172.16.0.0/12` so that it does not run out of networks. If your
  network already uses addresses there, change the pools in `/etc/docker/daemon.json` to a range it does not.

The machine and the repository hold different things, and it helps to know which is which. **The repository** holds what you chose: which
versions run, which apps, your settings, and your secrets, encrypted. **The machine** holds what it made for itself: the databases, and
the passwords it generated. So the repository alone cannot rebuild an instance; a backup can ([below](#backing-up-and-restoring)).

## Make the instance

```bash
npm create @sovereignfs my-instance
cd my-instance
git remote add origin git@github.com:you/my-instance.git
./sv setup
```

`npm create` makes a folder with a `./sv` launcher and a `package.json` that pins the toolkit. Everything below is `./sv ...`: the
launcher runs the version this repository pins, and installs it from the lockfile if it is missing. It never uses `npx`.

`./sv setup` asks for the domain core is served on, the machine's address, and how you will deploy (`ssh` from your computer, or `github`
from a workflow). It writes `suite.yml` and `suite.lock`, and makes **your key** at `~/.config/sovereign/age.key`. That key is the only
thing that opens your secrets and your backups. Keep a copy somewhere safe, and never in the repository.

## Trying it out: development and staging

An instance is `production` unless you say otherwise. `./sv setup --environment development` (or `staging`) makes one that catches its own
mail, so you can sign up and reset a password with no mail server:

```bash
./sv setup --environment development --domain sovereign.test --host 127.0.0.1 --tls internal
./sv mail                  # after the first deployment: the inbox, at http://localhost:8025
```

On these two, `sv apply` runs [Mailpit](https://mailpit.axllent.org) beside core and points core at it. It takes every message core sends and
keeps them for you to read. `./sv mail` opens its inbox on your computer, through SSH, and keeps it open until Ctrl-C. The inbox holds the
links that verify and reset accounts, so it has no public address: the server publishes it on its own loopback address only, and SSH is the
one way in.

Mailpit is only the default. To send mail somewhere real from a staging instance, set `SV_SMTP_HOST` (and the rest of the `SV_SMTP_*` settings)
under `core.env` in `suite.yml`; the next deployment stops running Mailpit. Set `SV_SMTP_FROM` alone to keep Mailpit and change the sender.
`production` runs no Mailpit and gives core no mail settings: they are yours, from `core.env`, `./sv secret set SV_SMTP_PASSWORD`, or the Console.

A development or staging instance can also be given something to try: `./sv seed` makes an owner, an admin and an ordinary person
(`owner@`, `admin@` and `user@sovereign.local`) and a sample app to sign in from. It runs once and leaves what is there when run
again. On a **development** instance every account has the same password, `sovereign-dev-password`. On a **staging** instance, which may be
reachable from the internet, each account has a random password, shown **once** when the account is made and never again: copy
it then. `./sv seed` is refused on a production instance, and core refuses as well, on production, and on any instance that has an
account a seed did not make. It needs core to be running (`./sv deploy` first) and a core new enough to have it.

On your own machine, `pnpm seed` in the core repository does the same for a local instance, with `SEED_PASSWORD` to choose the password.

## Prepare the machine

Point the DNS name at the machine first, then:

```bash
./sv server bootstrap
./sv doctor
```

`bootstrap` is safe to run again. It installs Docker if it is missing, makes the folders under `/var/lib/sovereign`, widens Docker's
address pools, installs the toolkit's image, and makes the machine's own key, which it adds to `suite.yml` so the machine can read the
secrets you give it. `doctor` checks DNS, the ports, Docker and the disk, and says what to fix. It changes nothing.

## The first deployment

```bash
./sv push
./sv deploy
```

`push` checks the repository, commits only the instance's own files, and pushes. `deploy` sends that commit to the machine and starts
the deployment there, showing what it prints. It takes a few minutes the first time: it starts a database, a proxy, and core, and waits
for each to be healthy, and for every public name to answer over `https`. Then open your domain. **The first account to sign up becomes
the owner.**

Run `./sv deploy` again and it changes nothing. That is the point of it: a deployment makes the machine match the commit, and anything
already true is left alone.

## Add two apps

To start a new hosted app, `npm create @sovereignfs app my-notes` makes one that signs in through your instance, keeps its data in its
own database and builds into an image the instance can host as it stands; its README says how.

An app is **hosted** (it runs on your machine, from an image) or **external** (it runs somewhere else and signs in through core).

```bash
# A hosted app, from an image that carries a manifest:
./sv app add notes --image ghcr.io/example/notes:1.2.0

# An external app, with the addresses it signs in at:
./sv app add wiki --external --name "Team wiki" --redirect https://wiki.sovereign.local/auth/callback
```

For a hosted app `sv` reads the manifest from the image without pulling it, and shows you the scopes it asks for before it writes
anything; a scope outside the manifest cannot be given to it. A hosted app gets its own address (`notes.` in front of your domain, which
needs a DNS record), its own database that no other app can open, and a network of its own. It is told where core is and given its secrets
as files, never as plain environment.

Some apps need a setting or a secret of yours, such as a mail password. A secret is never typed on a command line:

```bash
./sv secret set NOTES_SMTP_PASSWORD --app notes     # a hidden prompt, or standard input
./sv push && ./sv deploy
```

An external app is configured by you with core's address and its **client secret**, which core made. Get it with:

```bash
./sv app show wiki --secret
```

That is the only command that prints a secret. Once both apps are up, sign in to one, open the other, and you are not asked again; sign
out of core and you are signed out of both.

## Every day

| To see                                    | Run                                                       |
| ----------------------------------------- | --------------------------------------------------------- |
| What is running, against the repository   | `./sv status`                                             |
| What core, an app or the last deploy said | `./sv logs`, `./sv logs core`, `./sv logs notes`          |
| What is wrong with DNS, ports or Docker   | `./sv doctor`                                             |
| An app's address, client ID and state     | `./sv app show notes`                                     |
| Change an app's version or setting        | `./sv app update notes --image ...`, then push and deploy |
| Give an app a new client secret           | `./sv secret rotate wiki`                                 |

Changing an app's version moves only that app. Its database migrations are the app's own, and they go forward: see
[rolling back](#going-back) before you rely on undoing one.

To take an app away, `./sv app remove notes`. That stops it and removes its sign-in, and **keeps its data**, so adding it again picks
up where it was. To delete its database, files and secrets for good, `./sv app remove notes --purge`, which asks you to type its name
and takes a backup first.

## How many connections the database gets

Core and every hosted app share one PostgreSQL server, which allows 100 connections. So that one app cannot take them all and leave core
waiting, `./sv deploy` limits each one's database role, and sizes each one's connection pool to match. You do nothing for the defaults,
which are what core and the app template already use: 10 each.

`./sv database` shows how they are shared out now: the server's total, each role's pool and limit, and how many are left. To change
them:

```bash
./sv database set --max-connections 200   # the server's total; 100 if you leave it out, or say `default`
./sv database set --core 10 --app 6       # core's pool, and every hosted app's; 10 each if you leave them out
./sv app update notes --connections 3     # this app's own, instead of the one above
```

Each takes a whole number, or the word `default` to go back. `./sv` refuses numbers that add up to more than the server allows, and says
where the connections go. Then `./sv push` and `./sv deploy`. (These settings are in `suite.yml` under `database` and under the app,
and do not touch `suite.lock`.)

`./sv status` shows what is open now against each limit, and `./sv doctor` warns when a role, or the whole server, is close to its
limit (four fifths or more), which is the time to raise it.

- A role may hold its pool's size **plus 2**, so a connection that a killed container has not yet closed does not keep its replacement
  out. Eight apps at the defaults need more than 97 connections, which the server leaves for them (3 are kept for the superuser).
- When what you set adds up to more than the server allows, `./sv deploy` stops before it changes anything and says where the
  connections go. When you set nothing and the apps outgrow the defaults, it deploys and warns you; raise `maxConnections` or lower the
  pools.
- A new `maxConnections` **restarts the database server**, and the deployment says so before it does. Core and the apps reconnect. A
  lower limit on a role never ends a connection that is open: it applies to the next one.
- An app is given two addresses for its database, `<PREFIX>_POSTGRES_URL` and `<PREFIX>_POSTGRES_DIRECT_URL`. They are the database
  server, until you turn the pooler on (below), and then only an app whose manifest says `database.pooling: transaction` (`./sv app add`
  tells you) has the first go through it. The direct address stays the server itself, so an app that needs a session is never moved by
  what you turn on.
- An app reads its pool size from `<PREFIX>_POSTGRES_POOL_MAX`, which the app template does (two of those connections go to the direct address). An app made before this keeps its own pool,
  and its role's limit is what holds it.

### The connection pooler

You do not need one until your apps' connections do not fit the server: `./sv database` shows the budget, and `./sv status` and `./sv doctor`
warn when a role or the server is near its limit. A pooler lets apps share server connections instead of holding their own, so more apps fit.

```bash
./sv database pooler enable [--pool-size N] [--max-clients N]
./sv push && ./sv deploy
./sv database pooler disable    # and the same two commands, to go back
```

- It is PgBouncer in transaction mode, in this project's own image, started by the next deployment as `sv-pooler`. It publishes no port.
- **Only an app that says it can use it goes through it:** its manifest declares `database.pooling: transaction`, which the app template
  does. Every other app, and core always, connects to the database server as before, so turning it on cannot break an app that needs a
  session. `./sv database pooler enable` lists which apps go through it.
- `--pool-size` is how many server connections the pooler may open for each app that goes through it (default 5), and `--max-clients` how many
  connections those apps may open to the pooler between them (default 200). A pooled app's role is then limited to its `--pool-size`,
  plus 2 for its direct address and 2 of headroom, which is what counts against `maxConnections`: with a pool size of 2 each pooled app costs 6
  of the server's connections instead of 12.
- An app that goes through it is restarted by the deployment that turns it on or off, so it reads its new address.
- `./sv status` shows each app's pool: clients active and waiting, and server connections active and idle.
- It keeps no data, and holds no password that the server did not generate. Turning it off and on again changes nothing else.
- It needs a toolkit release that publishes it: if `enable` says the image cannot be found, `./sv upgrade` first.

## Updating

```bash
./sv upgrade
git diff
./sv push && ./sv deploy
```

`upgrade` moves the repository to the newest release of the toolkit, or `--to vX.Y.Z`. It changes the toolkit's version in
`package.json`, core's version in `suite.yml` to the one that release was made for, and `suite.lock`, and nothing else: your apps and
your database version stay where they are. Read the diff, then deploy it like any other change. A dependency bot may open the
`package.json` change for you; run `./sv upgrade --finish` on it to complete it.

If you edit `suite.yml` yourself (a version, `environment`, an app), `./sv push` writes `suite.lock` again for you, keeping the
digest of everything you did not change, and says what it changed. A `suite.lock` that is damaged is not rewritten, because the digests in
it are what runs: restore it from git.

`./sv deploy` first checks which toolkit the server runs. When it is not the one `suite.lock` pins, as after an upgrade, it brings the
server to it, over your own SSH access (as root, or through `sudo` without a password), and says so before it sends anything. A runner's
deployment key cannot do this: if a deployment from GitHub is refused for its `suite.lock`, run `./sv deploy --ssh` once from your own
machine.

When a deployment would change core's version or the database server's, it **takes a backup first**, on the machine. If it cannot
(the machine has no key of yours to encrypt it to), it stops and says so.

## Backing up and restoring

```bash
mkdir -p ~/backups
./sv backup --to ~/backups/
```

A backup is every database, each hosted app's files, and the machine's generated secrets, **encrypted to your key alone**: the machine
cannot read a backup it made, so a machine that is lost or taken over gives nothing away. Keep it where you keep your key. A backup taken
by a deployment stays on the machine in `/var/lib/sovereign/backups`; copy it down with `scp` to use it.

To restore, on the same machine or a new one:

1. On a new machine: change `server.host` in `suite.yml`, point DNS at it, `./sv server bootstrap`, `./sv push`.
2. `./sv restore ~/backups/the-file.tar.age`

`restore` opens the backup with your key, replaces what the machine holds with it, and brings the instance up at the commit you pushed.
Everyone is **signed out** of core and of every app, by design, so that a restore cannot bring back a session that was ended after the
backup. People deleted since the backup stay deleted when the same machine is restored. Restoring onto a new machine cannot know of them,
and says so.

## Going back

```bash
./sv rollback
```

runs the previous release again. It refuses when core's version would go backward, since core's migrations only go forward; for that,
restore a backup taken before the upgrade. Rolling an app back does **not** undo its migrations: if the newer version changed its data,
the older one may not read it. `rollback` says so before it runs.

## When a deployment fails

Every command ends with a code, and says what to do:

| Code | Meaning                          | What to do                                        |
| ---- | -------------------------------- | ------------------------------------------------- |
| `0`  | Done, or there was nothing to do |                                                   |
| `1`  | It failed partway                | Fix what it says, then run the same command again |
| `2`  | It refused, and changed nothing  | Do what it says                                   |
| `3`  | Another deployment is running    | Wait, or look at it with `./sv logs deploy`       |

A failed deployment is safe to run again: it carries on from the first step that is not yet true. Nothing after a failed step has
happened, and the machine keeps running what it was running. The exception is one app: if a hosted app does not start, the others are
still deployed and core stays up, the run is reported as failed, and the proxy does not answer for that app until it is healthy. Look at
what it printed with `./sv logs notes`.

If the connection drops while a deployment runs, the deployment carries on on the machine; `./sv logs deploy` shows how it went.

If `./sv doctor` is clean and `./sv logs deploy` does not explain it, the machine's own journal and `docker ps -a` will.

## Deploying from GitHub

With `deploy: github` in `suite.yml`, a push to `main` deploys. `sv setup` writes the workflow, and `sv server bootstrap` prints a
**deployment key** once. Store it as the Actions secret `SV_DEPLOY_KEY` and keep no other copy. It can send a deployment to the machine
and do nothing else there, and the runner holds no key that opens your secrets. The machine's SSH host key is kept in `suite.yml`, so the
runner checks it is deploying to the right machine. `./sv deploy --github` starts the workflow without a push.

## What lives where

```text
Your computer
  ~/.config/sovereign/age.key   your key: opens your secrets and your backups
  my-instance/                   suite.yml, suite.lock, secrets.age.yml, overrides/, package.json

The machine, in /var/lib/sovereign
  releases/       the files of each deployment (the last five)
  secrets/        what it generated for itself, one file each
  backups/        backups that deployments took
  state.json      what was applied
  age.key         the machine's own key
```

`suite.yml` takes settings but never secrets, and `sv push` refuses a value that looks like one. `overrides/` is where you change what
`sv` writes for core, the proxy, the database or an app, without it being written over: a Compose override per project, and Caddy
snippets. An override may not publish a port or change a network.
