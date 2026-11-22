# **TITLE**

An app for a [Sovereign](https://github.com/sovereignfs/sovereign) instance, made with `npm create @sovereignfs app`. It signs people
in with accounts of its own, through the instance's core, or both (`@sovereignfs/auth`), keeps its own data in its own PostgreSQL database, and can be hosted by the instance's toolkit as it
stands. It is a starting point: a notes page, to show the pieces. Change it into your app.

## What is here

| Where                                                   | What                                                                                                                                         |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `sovereign.manifest.json`                               | The manifest, the one copy: what the instance needs to know to host it (its address paths, the scopes it asks for, its port and health path) |
| `Dockerfile`                                            | One image, not root, on the manifest's port. Its label and port are made from the manifest when it is built                                  |
| `.github/workflows/publish.yml`                         | On a `vX.Y.Z` tag of a commit on `main`, builds the image for amd64 and arm64 and publishes it to `ghcr.io/<owner>/<repository>`             |
| `CONTRIBUTING.md`                                       | How work lands on `develop` and is released to `main` (below)                                                                                |
| `RELEASING.md`, `CHANGELOG.md`                          | How a version is released (a promotion titled `Release vX.Y.Z`), and each version's notes                                                    |
| `AGENTS.md`, `CLAUDE.md`                                | The conventions for agents: the app's own sections, and one shared by every app of the suite                                                 |
| `.github/repository.json`                               | The repository's merge settings and rulesets, as code (`npm create @sovereignfs app settings apply`)                                         |
| `.github/workflows/promotion.yml`, `release.yml`        | The promotion check and the release on merge, which call the workflows every app shares                                                      |
| `.github/workflows/ci.yml`, `.githooks/pre-push`        | The checks: CI for pull requests into `main` and release tags only, the pre-push hook for everything else                                    |
| `.github/workflows/sync-develop.yml`                    | After a promotion into `main` is merged, fast-forwards `develop` to the merge commit                                                         |
| `lib/sign-in.ts`, `lib/session.ts`                      | The sign-in ([`@sovereignfs/auth`](https://www.npmjs.com/package/@sovereignfs/auth)): its ways in, from the settings, and the session        |
| `app/sign-in/`, `app/sign-up/`, `app/security/`         | The sign-in and sign-up pages, and a person's password and sessions                                                                          |
| `app/api/auth/`, `app/api/sovereign/`                   | The sign-in's routes, core's back-channel logout, and core's notice that a person deleted their account (`lib/notices.ts`)                   |
| `lib/sovereign.ts`, `lib/stores.ts`                     | Core as a way in: the SDK, and where it keeps refresh tokens (your database; encrypted)                                                      |
| `app/api/health/route.ts`                               | Answers 200 when the database does                                                                                                           |
| `instrumentation.ts`, `lib/migrate.ts`, `migrations/`   | The app applies its own migrations when it starts, each once                                                                                 |
| `app/page.tsx`                                          | A page behind sign-in, using [`@sovereignfs/ui`](https://www.npmjs.com/package/@sovereignfs/ui)                                              |
| `lib/files.ts`, `app/api/files/`, `app/upload.tsx`      | People's files, kept the suite's way: a folder and a quota for each person, served only to them (below)                                      |
| `lib/push.ts`, `app/api/push/`, `app/notifications.tsx` | Notifications on a person's devices (Web Push), from a key the instance makes (below)                                                        |
| `compose.yml`                                           | Runs the app and a PostgreSQL database for it on your own machine with Docker (below)                                                        |

## Branches and releases

Work lands on `develop`, committed directly or merged from a feature branch; `main` is what is released, protected, and changed only by a
pull request from `develop` titled with its version, merged with a merge commit, which is tagged `vX.Y.Z` when that version is published. `npm create @sovereignfs app`
made both branches and left you on `develop`. [CONTRIBUTING.md](CONTRIBUTING.md) has the whole workflow, the shared files `npm create @sovereignfs app sync` keeps, and how `main` is protected on
GitHub.

## Build and host it

The image's label (which is how an instance reads the manifest without pulling the image) and its port are made from
`sovereign.manifest.json` by [`@sovereignfs/manifest`](https://www.npmjs.com/package/@sovereignfs/manifest), so build with what it prints:

```bash
__INSTALL__
eval "docker build $(__EXEC__ sovereign-manifest docker-args) -t ghcr.io/you/__NAME__:0.1.0 ."
docker push ghcr.io/you/__NAME__:0.1.0
```

or push a tag and let `.github/workflows/publish.yml` do it (`package.json`'s `version` must be the tag's):

```bash
git tag v0.1.0 && git push origin v0.1.0
```

then, in your instance repository:

```bash
./sv app add __NAME__ --image ghcr.io/you/__NAME__:0.1.0     # the name is the app's address; it may be left out, and is then the manifest's prefix
./sv push && ./sv deploy
```

`sv` reads the manifest from the image's label, shows you the scopes it asks for, gives it its address, its port (as `PORT`), its database and
its secrets, and registers it with core. Change `sovereign.manifest.json` and build again; `__RUN__ manifest:check` says whether it is
valid.

## People's files

The manifest says `"storage": true`, so an instance gives the app a folder of its own for the files people upload, at `/data/s3/__NAME__`,
and nothing else of its disk ([`app-manifest.md`](https://github.com/sovereignfs/sovereign/blob/main/contracts/app-manifest.md) §2.7).
`lib/files.ts` makes the store with [`@sovereignfs/storage`](https://www.npmjs.com/package/@sovereignfs/storage): one folder for each
person, named by the person's id here (`session.user.id`), and a quota for each person (`__PREFIX___STORAGE_QUOTA_MB` and `__PREFIX___STORAGE_FILE_QUOTA`, which an
operator can change; 200 GB and 1000 files unless they do).

- `POST /api/files` keeps a file (the body is the file, its name is in `X-File-Name`), `GET /api/files` lists the person's own,
  `GET /api/files/{id}` serves one to its owner, and `DELETE /api/files/{id}` removes it. Each asks who is calling, and a request that
  changes something must come from the app's own pages.
- A file is served whole or by `Range`, so a video can be sought in and a download resumed.
- Images are shown, and everything else is downloaded: what a file is comes from its bytes, so nothing uploaded runs as script.
- A refusal is a `StorageError` with a code and words a person can act on (`over_quota`, `too_large`), which the routes pass on.
- When a person deletes their account, `onAccountDeleted` in `lib/notices.ts` deletes their folder along with their notes.

If your app keeps no files, set `"storage": false` (or remove it), delete `lib/files.ts`, `app/api/files/` and `app/upload.tsx`, and the
`files()` calls in `lib/notices.ts`, `app/actions.ts` and `app/page.tsx`.

## Notifications

The manifest asks the instance for `__PREFIX___VAPID_PRIVATE_KEY` (`generate`), so a hosted app can notify people on a phone or a computer
where it is not open, with [`@sovereignfs/push`](https://www.npmjs.com/package/@sovereignfs/push). Running it yourself, make a key with
`npx @sovereignfs/push keys`; without one the app sends no notifications and the home page says nothing of them. Away from an https
address, set `__PREFIX___VAPID_SUBJECT` to a `mailto:` address.

- A person turns them on for a device with the switch on the home page (`app/notifications.tsx`), which sends the device's subscription
  to `app/api/push/subscription`; "Send me a test notification" shows the whole path.
- `lib/push.ts` keeps devices and waiting pushes in your database (`migrations/002_push.sql`), a device's keys sealed. To notify someone,
  call `enqueuePush(pushStore(client), { account, message, now: Date.now() })` with the client of the transaction that makes the change,
  as `app/push-actions.ts` does: a change rolled back sends nothing. The outbox, started in `instrumentation.ts`, sends what is waiting.
- Signing out turns the device off first, and a deleted account's devices are forgotten (`lib/notices.ts`).

If your app sends no notifications, remove the key from `generate`, and delete `lib/push.ts`, `app/api/push/`, `app/notifications.tsx`,
`app/push-actions.ts` and their calls in `app/page.tsx`, `app/sw.js/route.ts`, `app/sign-out.tsx`, `instrumentation.ts` and
`lib/notices.ts`.

## Run it with Docker

`compose.yml` starts the app and a PostgreSQL database for it, with the files in a volume mounted where an instance mounts the app's folder,
so the code is the same in both:

```bash
cp .env.example .env              # and, to sign in through an instance too, a core you can reach and its client there
docker compose up --build         # http://localhost:__PORT__
```

The image makes `/data/s3/__NAME__` and gives it to the user the app runs as, which is what lets Docker's volume be written by it.

Two things to know. A person is identified by `session.user.id` and by nothing else, however they signed in. And when you add data about
people, delete it in `onAccountDeleted` in `lib/notices.ts`, which core calls when someone who came through it deletes their account.

## Run it on your machine

```bash
cp .env.example .env     # point it at a PostgreSQL database, and at a core you can reach to sign in through one
__RUN__ dev              # http://localhost:__PORT__
```

The port is `port` in `sovereign.manifest.json`, the one copy: the image listens on it, and `__RUN__ dev`, `__RUN__ start` and
`__PREFIX___URL` in `.env.example` were made with it. To change it, change the manifest, the `dev` and `start` scripts and
`__PREFIX___URL` together.

## How people sign in

`__PREFIX___AUTH_LOCAL` turns on accounts of the app's own: a password the browser derives before it is sent, so the app never receives
the one a person types, and their sessions. `__PREFIX___CORE_URL` turns on core as a way in, "Continue with Sovereign"; with core the only
way in, the sign-in page sends a person straight on to it. Without a core address the app's own accounts are on; with one they are off unless
`__PREFIX___AUTH_LOCAL=true`. `__PREFIX___AUTH_SIGNUP` says who may make an account: `open`, or `closed` (the first account only). An
instance hosting the app gives it a core address, so there it signs people in through core. Signing out of an app an instance hosts
signs out of core too.

An app made with `--encryption` signs in through core only, on the same package, which serves the key secret its pages keep the keys
with; it keeps everything of a person under the `sub` core knows them by (`ENCRYPTION.md`).

See [Using the SDK](https://github.com/sovereignfs/sovereign/blob/main/docs/using-the-sdk.md) for what `sv.as(person)` can call, and
[the app manifest](https://github.com/sovereignfs/sovereign/blob/main/contracts/app-manifest.md) for what the instance gives and expects.
