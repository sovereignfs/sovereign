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

An app is **hosted** (it runs on your machine, from an image) or **external** (it runs somewhere else and signs in through core).

```bash
# A hosted app, from an image that carries a manifest:
./sv app add notes --image ghcr.io/example/notes:1.2.0

# An external app, with the addresses it signs in at:
./sv app add wiki --external --name "Team wiki" --redirect https://wiki.example.com/auth/callback
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
