# **TITLE**

An app for a [Sovereign](https://github.com/sovereignfs/sovereign) instance, made with `npm create @sovereignfs app`. It signs people
in through the instance's core, keeps its own data in its own PostgreSQL database, and can be hosted by the instance's toolkit as it
stands. It is a starting point: a notes page, to show the pieces. Change it into your app.

## What is here

| Where                                                 | What                                                                                                                                         |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `sovereign.manifest.json`                             | The manifest, the one copy: what the instance needs to know to host it (its address paths, the scopes it asks for, its port and health path) |
| `Dockerfile`                                          | One image, not root, on the manifest's port. Its label and port are made from the manifest when it is built                                  |
| `.github/workflows/publish.yml`                       | On a `vX.Y.Z` tag, builds the image for amd64 and arm64 and publishes it to `ghcr.io/<owner>/<repository>`                                   |
| `app/auth/[action]/route.ts`                          | Sign-in, sign-out, core's back-channel logout, and core's notice that a person deleted their account                                         |
| `lib/auth.ts`, `lib/stores.ts`                        | The SDK's sign-in, and where it keeps sessions and refresh tokens (your database; tokens encrypted)                                          |
| `app/api/health/route.ts`                             | Answers 200 when the database does                                                                                                           |
| `instrumentation.ts`, `lib/migrate.ts`, `migrations/` | The app applies its own migrations when it starts, each once                                                                                 |
| `app/page.tsx`                                        | A page behind sign-in, using [`@sovereignfs/ui`](https://www.npmjs.com/package/@sovereignfs/ui)                                              |
| `lib/files.ts`, `app/api/files/`, `app/upload.tsx`    | People's files, kept the suite's way: a folder and a quota for each person, served only to them (below)                                      |
| `compose.yml`                                         | Runs the app and a PostgreSQL database for it on your own machine with Docker (below)                                                        |

## Build and host it

The image's label (which is how an instance reads the manifest without pulling the image) and its port are made from
`sovereign.manifest.json` by [`@sovereignfs/manifest`](https://www.npmjs.com/package/@sovereignfs/manifest), so build with what it prints:

```bash
npm install
eval "docker build $(npx sovereign-manifest docker-args) -t ghcr.io/you/__NAME__:0.1.0 ."
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
its secrets, and registers it with core. Change `sovereign.manifest.json` and build again; `npm run manifest:check` says whether it is
valid.

## People's files

The manifest says `"storage": true`, so an instance gives the app a folder of its own for the files people upload, at `/data/s3/__NAME__`,
and nothing else of its disk ([`app-manifest.md`](https://github.com/sovereignfs/sovereign/blob/main/contracts/app-manifest.md) §2.7).
`lib/files.ts` makes the store with [`@sovereignfs/storage`](https://www.npmjs.com/package/@sovereignfs/storage): one folder for each
person, named by `session.sub`, and a quota for each person (`__PREFIX___STORAGE_QUOTA_MB` and `__PREFIX___STORAGE_FILE_QUOTA`, which an
operator can change; 200 GB and 1000 files unless they do).

- `POST /api/files` keeps a file (the body is the file, its name is in `X-File-Name`), `GET /api/files` lists the person's own,
  `GET /api/files/{id}` serves one to its owner, and `DELETE /api/files/{id}` removes it. Each asks who is calling, and a request that
  changes something must come from the app's own pages.
- A file is served whole or by `Range`, so a video can be sought in and a download resumed.
- Images are shown, and everything else is downloaded: what a file is comes from its bytes, so nothing uploaded runs as script.
- A refusal is a `StorageError` with a code and words a person can act on (`over_quota`, `too_large`), which the routes pass on.
- When a person deletes their account, `onAccountDeleted` in `lib/auth.ts` deletes their folder along with their notes.

If your app keeps no files, set `"storage": false` (or remove it), delete `lib/files.ts`, `app/api/files/` and `app/upload.tsx`, and the
`files()` calls in `lib/auth.ts`, `app/actions.ts` and `app/page.tsx`.

## Run it with Docker

`compose.yml` starts the app and a PostgreSQL database for it, with the files in a volume mounted where an instance mounts the app's folder,
so the code is the same in both:

```bash
cp .env.example .env              # and give it a core you can reach, and its client there
docker compose up --build         # http://localhost:__PORT__
```

The image makes `/data/s3/__NAME__` and gives it to the user the app runs as, which is what lets Docker's volume be written by it.

Two things to know. A person is identified by `session.sub` and by nothing else. And when you add data about people, delete it in
`onAccountDeleted` in `lib/auth.ts`, which core calls when someone deletes their account.

## Run it on your machine

```bash
cp .env.example .env     # point it at a core you can reach and a PostgreSQL database
npm run dev              # http://localhost:__PORT__
```

The port is `port` in `sovereign.manifest.json`, the one copy: the image listens on it, and `npm run dev`, `npm start` and
`__PREFIX___URL` in `.env.example` were made with it. To change it, change the manifest, the `dev` and `start` scripts and
`__PREFIX___URL` together.

See [Using the SDK](https://github.com/sovereignfs/sovereign/blob/main/docs/using-the-sdk.md) for what `sv.as(person)` can call, and
[the app manifest](https://github.com/sovereignfs/sovereign/blob/main/contracts/app-manifest.md) for what the instance gives and expects.
