# **TITLE**

An app for a [Sovereign](https://github.com/sovereignfs/sovereign) instance, made with `npm create @sovereignfs app`. It signs people
in through the instance's core, keeps its own data in its own PostgreSQL database, and can be hosted by the instance's toolkit as it
stands. It is a starting point: a notes page, to show the pieces. Change it into your app.

## What is here

| Where                                                 | What                                                                                                            |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `sovereign.manifest.json`                             | What the instance needs to know to host it: its address paths, the scopes it asks for, its port and health path |
| `Dockerfile`                                          | One image, not root, on port 3000. Its `io.github.sovereignfs.app-manifest` label is the manifest               |
| `app/auth/[action]/route.ts`                          | Sign-in, sign-out, core's back-channel logout, and core's notice that a person deleted their account            |
| `lib/auth.ts`, `lib/stores.ts`                        | The SDK's sign-in, and where it keeps sessions and refresh tokens (your database; tokens encrypted)             |
| `app/api/health/route.ts`                             | Answers 200 when the database does                                                                              |
| `instrumentation.ts`, `lib/migrate.ts`, `migrations/` | The app applies its own migrations when it starts, each once                                                    |
| `app/page.tsx`                                        | A page behind sign-in, using [`@sovereignfs/ui`](https://www.npmjs.com/package/@sovereignfs/ui)                 |

## Build and host it

```bash
docker build -t ghcr.io/you/__NAME__:0.1.0 .
docker push ghcr.io/you/__NAME__:0.1.0
```

then, in your instance repository:

```bash
./sv app add __NAME__ --image ghcr.io/you/__NAME__:0.1.0
./sv push && ./sv deploy
```

`sv` reads the manifest from the image's label, shows you the scopes it asks for, gives it its address, its database and its secrets,
and registers it with core. Change `sovereign.manifest.json`, then `npm run manifest:write` to copy it into the Dockerfile, and
build again; `npm run manifest:check` says whether they agree.

Two things to know. A person is identified by `session.sub` and by nothing else. And when you add data about people, delete it in
`onAccountDeleted` in `lib/auth.ts`, which core calls when someone deletes their account.

## Run it on your machine

```bash
cp .env.example .env     # point it at a core you can reach and a PostgreSQL database
npm run dev
```

See [Using the SDK](https://github.com/sovereignfs/sovereign/blob/main/docs/using-the-sdk.md) for what `sv.as(person)` can call, and
[the app manifest](https://github.com/sovereignfs/sovereign/blob/main/spec/app-manifest.md) for what the instance gives and expects.
