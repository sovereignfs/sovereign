# Building an app

Everything a person or an agent needs to plan and build a new app of the Sovereign suite, in one place: what the pieces are, how they
relate, the rules an app keeps, and where each detail lives. It is written to be handed to an agent starting a new project, so that it
does not have to be told the context again.

It summarises; it does not replace. Where this guide and a contract disagree, the contract wins and this guide is the bug:
[`contracts/app-manifest.md`](../contracts/app-manifest.md), [`contracts/env.md`](../contracts/env.md),
[`contracts/suite.md`](../contracts/suite.md), [`specs/sdk.md`](specs/sdk.md) and [`specs/design-system.md`](specs/design-system.md).
Read the contract before building the part it governs.

> **"Plugin" is the old word.** The legacy platform composed plugins (a `manifest.json` and an `app/` folder, repositories named
> `sovereign-plugin-<name>`) into one Next.js shell. That model is retired. A new piece of the suite is an **app**: a program of its
> own, in its own repository, shipped as its own image. Tusk replaced the legacy `tasks` and `kanban` plugins this way. Do not start
> from a `sovereign-plugin-*` repository or its `manifest.json`.

---

## 1. The model

**Sovereign** is the platform: an identity server and hub that one person or household runs on their own machine. **An app** is a
product that people use (Fjord for documents, Tusk for tasks and boards). Each app:

- **exists on its own.** It runs self-hosted with no Sovereign at all, signing people in with accounts of its own.
- **can join a suite.** An instance can host it beside core. It then signs people in through core, appears in core's launcher, and
  can use core's bell, email and activity log. This is opt-in, through one file (`sovereign.manifest.json`) and environment variables.
- **shares the look and the libraries.** It is built with the published design system and packages, so every app looks and behaves
  as one suite without depending on the others.

What ties an app to an instance is **only** its manifest, the environment it is given, the packages it chooses to use, and sign-in
through core. No app imports another, and core names no app.

```text
                       ┌───────────────────────────── one machine, one domain ─────────────────────────────┐
                       │                                                                                    │
 operator ── ./sv ──►  │  proxy (Caddy, TLS) ──► core            sovereign.example.org    :3000             │
 (instance repo:       │        │                 identity · OIDC · launcher · bell · email · activity      │
  suite.yml,           │        ├──────────────► fjord           fjord.sovereign.example.org  :3001         │
  suite.lock,          │        ├──────────────► tusk            tusk.sovereign.example.org   :3002         │
  secrets.age.yml)     │        └──────────────► <your app>      <name>.sovereign.example.org :<port>       │
                       │                                                                                    │
                       │  PostgreSQL: one database and one role per app, plus core's                        │
                       └────────────────────────────────────────────────────────────────────────────────────┘

 apps ── OIDC + PKCE ──► core            apps ── @sovereignfs/sdk (server only) ──► Core API
 apps ── import ───────► @sovereignfs/ui, config, manifest, sdk  (npm)
```

## 2. The components

### Repositories

| Repository              | What it is                                                                                                               |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `sovereignfs/sovereign` | The platform: core (`apps/core`), the operator toolkit (`tools/cli`, `tools/create`), the shared packages, the contracts |
| `sovereignfs/fjord`     | Fjord: documents as Markdown in a Git repository. Fjord Web is `clients/web`; the Rust core and CLI are beside it        |
| `sovereignfs/tusk`      | Tusk: a private, offline-first Desk of lists and cards, and shared kanban boards                                         |
| an instance repository  | One per running instance (`openfs-suite` is the live one). Made by `npm create @sovereignfs`, driven by `./sv`           |

### What Sovereign publishes

| Published                                            | For                                                                                                                                 |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `ghcr.io/sovereignfs/sovereign`                      | Core's image. Its tag is the **platform version** (`0.83.0`), which is what a manifest's `core` range means                         |
| `@sovereignfs/ui`                                    | The design system: tokens and React components. Pre-1.0: apps pin it exactly                                                        |
| `@sovereignfs/sdk`                                   | An app's **server** calling core: sign-in, verifying core's notices, notifications, email, activity, directory. Throws in a browser |
| `@sovereignfs/config`                                | The environment convention of `contracts/env.md`: settings declared once, read with a prefix, refused at start-up                   |
| `@sovereignfs/manifest`                              | The manifest's schemas, a validator, and `sovereign-manifest` (`check`, `label`, `docker-args`)                                     |
| `@sovereignfs/cli` (`sv`), `ghcr.io/sovereignfs/cli` | The operator's toolkit, and the image the server runs it from                                                                       |
| `@sovereignfs/create`                                | `npm create @sovereignfs` (an instance repository) and `npm create @sovereignfs app <name>` (an app, §11)                           |

`@sovereignfs/database`, `crypto`, `mailer`, `bridge` and `api-client` are **private**: core uses them, apps cannot. Each app
carries its own database, encryption and mail code today ([research 0004](research/0004-a-kit-for-apps-of-their-own.md) plans to
publish them as a kit; §12).

### The two apps to learn from

Fjord Web came first and Tusk was built from it; **Tusk is the newer and the better model** where they differ. Both are Next.js apps
with their own database and sign-in, hosted on the live instance.

|                 | Fjord Web                                       | Tusk                                                     |
| --------------- | ----------------------------------------------- | -------------------------------------------------------- |
| Prefix, port    | `fjord`, `3001`                                 | `tusk`, `3002`                                           |
| Design document | `clients/web/DESIGN.md` (§6 auth, §14 database) | `DESIGN.md` (§6 auth, §23 database, §24 deployment)      |
| Conventions     | `CLAUDE.md`, `clients/web/CLAUDE.md`            | `AGENTS.md` ("Rules of an app" is the checklist to copy) |
| Releases        | tag `web-vX.Y.Z`, `scripts/release.sh web …`    | tag `vX.Y.Z`, `scripts/release.sh …`                     |

### Ports

Every app has its own port, in its manifest, its image, its Compose files and `pnpm dev`, so the suite runs side by side on one machine:

| Core | Fjord | Tusk | A new app                                                                                  |
| ---- | ----- | ---- | ------------------------------------------------------------------------------------------ |
| 3000 | 3001  | 3002 | The next free one (3003 onward). The app template's default is 3100; `--port N` changes it |

The port is written once, in `sovereign.manifest.json`; everything else reads it or is held to it by a test (Tusk's
`src/deploy.test.ts`). The hosted app is given it as `PORT`.

## 3. The manifest

`sovereign.manifest.json`, at the root of the app's source, is the one copy of what an instance reads. Tusk's:

```json
{
  "manifest": 2,
  "prefix": "tusk",
  "name": "Tusk",
  "description": "Your own tasks, private by default and working offline, and the kanban boards you share with others",
  "icon": "/icons/icon.svg",
  "port": 3002,
  "health": "/api/health",
  "launch": "/",
  "signIn": {
    "redirect": ["/api/auth/callback/sovereign"],
    "backChannel": "/api/sovereign/backchannel-logout",
    "accountDeleted": "/api/sovereign/account-deleted",
    "scopes": ["openid", "profile", "email"]
  },
  "database": true,
  "generate": ["TUSK_AUTH_SECRET", { "name": "TUSK_ENCRYPTION_KEY", "bytes": 32 }],
  "core": ">=0.57.0 <1.0.0"
}
```

- **`prefix`** is lower case, letters and digits, not `sv`. Its upper case is the variable prefix (`TUSK_`) and it is the default
  subdomain.
- **Paths, never hosts.** The instance joins every path to `https://<name>.<domain>`.
- **`signIn`** makes the app a client at core, with a launcher entry. Without it the app is hosted but core knows nothing of it (a
  public page, a kiosk), and `icon`/`launch` are refused.
- **`backChannel` and `accountDeleted`**: have both. Without the first, signing out of core leaves the app signed in; without the
  second, what the app holds of a person outlives their account.
- **`database`**: `true` gives a PostgreSQL database and role. `{ "pooling": "transaction" }` only if every statement is safe on any
  pooled connection (no advisory lock, `SET`, `LISTEN`, temporary table or named prepared statement).
- **`generate`**: secrets the server makes once and keeps. An app with sessions generates `<PREFIX>_AUTH_SECRET`; one that stores
  credentials generates a 32-byte encryption key.
- **`data`**: container paths kept across upgrades, for an app that writes files. Each must exist in the image and be writable by the
  app's user.
- **`core`**: a range of platform versions. Its floor is the first core release that shipped what the app needs.
- An unknown field is refused. `pnpm exec sovereign-manifest check` validates it; CI runs it.

The image carries the manifest as the label `io.github.sovereignfs.app-manifest`. Build with
`docker build $(pnpm exec sovereign-manifest docker-args) …`, which passes the label and `PORT`, so an image cannot carry a manifest the
toolkit would refuse.

### What a hosted app is given

Under its prefix ([`app-manifest.md`](../contracts/app-manifest.md) §3). A secret may arrive as `NAME` or as `NAME_FILE`, so the app
reads both:

`PORT` · `<P>_URL` · with `signIn`: `<P>_CORE_URL`, `<P>_CORE_CLIENT_ID`, `<P>_CORE_CLIENT_SECRET` · with `database`: `<P>_DB_DIALECT`
(`postgres`), `<P>_POSTGRES_URL`, `<P>_POSTGRES_DIRECT_URL`, `<P>_POSTGRES_POOL_MAX` · each name in `generate`.

Anything else is the operator's, in `suite.yml` (`apps.<name>.env`) or `secrets.age.yml`.

### What an app must do

From [`app-manifest.md`](../contracts/app-manifest.md) §4, the ones a plan has to account for:

- Run from **one image**, as a user that is not root, configured **only by its environment**.
- Listen on `PORT` on all interfaces; publish no port; expect TLS to end at the proxy; take its address from `<P>_URL`, never the request.
- **Apply its own migrations at start-up**, safely when run again. Need no admin credential and touch nothing outside its database.
- Accept sign-in through core **with PKCE**, never needing core's cookie. It may offer other ways in too.
- **Verify core's notices** (§6) and answer `200` to an account-deleted notice only after the person's data is gone.
- Keep what must survive an upgrade only in its database or under `data`.
- **Stop cleanly on `SIGTERM`.**
- When core is its only way in, give an account to anyone core signs in, without being told to (`<P>_AUTH_SIGNUP` defaults to `open`).

## 4. Configuration

[`contracts/env.md`](../contracts/env.md), implemented by `@sovereignfs/config`:

- **Every variable is `<PREFIX>_<NAME>`.** Platform variables (`PORT`, `NODE_ENV`, `TZ`, `HOSTNAME`) are not prefixed. An app never
  reads another prefix.
- **Shared names mean the same in every app**: `URL`, `AUTH_SECRET` (32+ characters), `CORE_URL`, `CORE_CLIENT_ID`,
  `CORE_CLIENT_SECRET`, `DB_DIALECT` (`sqld` | `sqlite` | `postgres`, never guessed from a URL), `SQLD_URL`, `SQLD_ADMIN_URL`,
  `SQLD_NAMESPACE`, `SQLITE_URL`, `POSTGRES_URL`, `POSTGRES_DIRECT_URL`, `POSTGRES_POOL_MAX`, `AUTH_LOCAL`, `AUTH_SIGNUP`,
  `AUTH_PASSWORD_MIN_LENGTH`, `DB_CONNECT_TIMEOUT_MS`, `SMTP_*`. Use them before inventing one.
- **Secrets** take the `_FILE` form; setting both forms is an error; no secret has a default.
- **Booleans are `true` or `false` exactly.** An empty value is "not set".
- **Validate everything once at start-up**, report every problem at once by name, never print a value, and refuse to start rather
  than run degraded.
- Declare the variables once with `defineConfig({ prefix, variables })`, read them nowhere else, and keep `.env.example` in step (a test
  can hold it). `NEXT_PUBLIC_*` is never used for a value that varies at run time.

## 5. Stack

What Tusk and Fjord Web use, and a new app should, unless its design says why not:

| Concern          | Choice                                                                                                                                           |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Framework        | **Next.js 16**, latest stable, App Router, `output: 'standalone'`. It is not the Next.js of anyone's memory: read `node_modules/next/dist/docs/` |
| Language         | TypeScript, strict. React 19                                                                                                                     |
| Runtime, manager | Node 24.15+, **pnpm 11**, with `minimumReleaseAge` (a release under a day old does not install) and `allowBuilds`                                |
| Sign-in          | **better-auth**: local accounts (password, passkey, TOTP) and core as a `genericOAuth` provider with PKCE                                        |
| Data             | **Drizzle**, one schema per dialect; `@libsql/client` (sqld and SQLite files), `pg` (PostgreSQL)                                                 |
| Core             | `@sovereignfs/sdk`: the notice verifiers, and app-scope calls (bell, email, activity)                                                            |
| UI               | `@sovereignfs/ui`, pinned exactly, with its peers `@dnd-kit/core` and `@dnd-kit/sortable`                                                        |
| Settings         | `@sovereignfs/config`                                                                                                                            |
| Tests            | Vitest (units, and the data layer on all three databases); Playwright (Chromium and WebKit)                                                      |
| Quality          | Prettier, ESLint (the suite's rules), `tsc --noEmit`, in CI                                                                                      |
| Licence          | **AGPL-3.0-or-later**. Bundling `@sovereignfs/ui` makes it so; every dependency's licence must be compatible                                     |

## 6. Signing people in

There are two shapes. Choose in the design, before anything is built.

**Core only.** The app has no accounts of its own; core is the only way in. The SDK does everything: `createSovereign({ prefix,
sessionStore, tokenStore })` and `nextAuth(sv).handlers` mounted at `app/auth/[action]/route.ts` (login, callback, logout, and the
back-channel route). This is what the app template makes ([using the SDK](using-the-sdk.md)). It cannot run without an instance.

**Local and/or core** (Tusk and Fjord: an app of its own). better-auth keeps the sessions and accounts; core is one provider, turned on
when `<P>_CORE_URL` is set; local accounts when `<P>_AUTH_LOCAL=1` (off by default, and then the sign-in pages answer 404); one
image does all three. The SDK is still used, for the notices:
`verifyLogoutToken` and `verifyAccountDeletedToken` do every check and return who the notice names, and the app ends or deletes. `seen`
records each notice's `jti` in a table, so a replay is refused after a restart.

Rules that hold for both:

- **A person is their `sub`**, opaque and stable. Never match an account by email at sign-in: link a core identity only from a signed-in
  session, and only to the account's own verified address. Core gives `sub`, `name`, `email`; **no `preferred_username` and no `groups`**.
- **One function deletes everything of a person** (Tusk: `People.deletePerson`), safe to run twice. A new table that holds something of
  a person is added to it in the same change, with a test.
- **Sign-up**: `open` by default when core is the only way in; `closed` (first account only) when local accounts are on.
- **Scopes**: ask for what the design uses: `openid` always, `profile` and `email` for a name and an address, `offline_access` only to
  call core as a person while they are away, `directory` to find people, `notifications` to clear the app's own notices.

## 7. Using core

With `@sovereignfs/sdk` on the server ([using the SDK](using-the-sdk.md) §4). The operator grants app scopes ("What the app may do on
its own") when hosting it:

| Call                                   | Needs                          | Does                                                                      |
| -------------------------------------- | ------------------------------ | ------------------------------------------------------------------------- |
| `sv.app.notifications.send`            | app scope `notifications:send` | A notice in the person's bell in core, with a link back to the app        |
| `sv.app.email.sendToUser`              | app scope `email:send`         | Mail from the instance, to a person named by `sub`, without their address |
| `sv.app.activity.log`                  | app scope `activity:write`     | A line on the person's own activity page                                  |
| `sv.as({ sub }).directory.searchUsers` | person scope `directory`       | Finding other people on the instance                                      |
| `sv.instance.getBranding()`            | nothing                        | The instance's name and look                                              |

- Each send takes a `key`, so sending again within a day is the same send. None reports delivery.
- A call to something an older core lacks raises `NotSupportedError` and sends nothing, so **an app works without an instance**, and
  degrades rather than fails when core is older or absent.
- Core never calls the app except for its two notices.

## 8. Data

- **Three forms, two dialects.** An app of its own runs on **sqld**, a **SQLite file** (`file:`), or **PostgreSQL**. Hosted, it is
  always PostgreSQL. One schema and one migration set per dialect, generated (`pnpm db:generate <name>`), never written by hand or pushed.
- **Two stores**: the app's own and better-auth's (`tusk` and `tusk_auth`, as sqld namespaces or PostgreSQL schemas), both migrated at
  start-up under a lock.
- **Portable SQL**: values bound, never interpolated; one representation per type; no `LISTEN/NOTIFY`, trigger, extension or foreign
  key; short transactions, nothing held across a call to core or another service.
- **The permission is in the statement** (`… WHERE id = ? AND owner_id = ?`), never checked first and then touched. A refusal reads as
  not found.
- **A released migration is never edited**; a fix is a new one, and a patch release has none.
- **Tests run on all three databases** and read `<P>_TEST_*`, never the app's own variables, so a test can never wipe a developer's data.
- Start-up waits for a database that is still starting (`<P>_DB_CONNECT_TIMEOUT_MS`), with retries.

## 9. Secrets and encryption

- A credential the app keeps (a token for another service) is stored only through envelope encryption under
  `<P>_ENCRYPTION_KEY` (a random data key wrapped under the instance key, bound to row and purpose), never as text. Rotation is
  `<P>_ENCRYPTION_KEY_PREVIOUS` beside the new key. Copy Tusk's `src/crypto/`, with its tests.
- Tokens and secrets never appear in an error, a log, a URL or the browser.
- A `Secret` from `@sovereignfs/config` prints as `[redacted]`; reveal it only where it is used.

## 10. Interface

From [`specs/design-system.md`](specs/design-system.md) and [the guide](design-system.md):

- **Import `@sovereignfs/ui` directly**, from Server Components too: the bundle is a `'use client'` module, so a Server Component passes
  its parts only data and children, never a function. No local barrel.
- **Style with the `--sv-*` tokens**, never a literal colour, so dark mode and theming keep working. The typeface is Hanken Grotesk,
  served by the app, never fetched from another site.
- **It has the parts most apps need**: layouts (`RootLayout`, `PageLayout`, `ThreeColumnLayout`, `SplitPane`), the `Header` (with an
  optional launcher, bell and avatar menu, for an app with no instance), `MobileHeader`, `MobileFooter`, the `Auth` components (every
  app's sign-in looks the same), forms, `Dialog`, `Sheet`, `Drawer`, `Toast`, `NotificationsPanel`, `DataTable`, `DatePicker`,
  `SwipeStack`, `Icon` (the names are in the package's types), and more.
- **Reusable UI goes into `@sovereignfs/ui`** in this repository, released, then used. It is not forked into an app.
- **No third-party loads or requests from the browser.** What people write is rendered as text, never HTML.
- Fork only what is rendered by viewport, never a navigation decision. A PWA is the mobile story.

## 11. Repository and image

**A new repository** takes Tusk's shape:

| Path                                               | Holds                                                                                          |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `AGENTS.md` (+ `CLAUDE.md` importing it)           | The one copy of the conventions, including the app's own "Rules of an app"                     |
| `DESIGN.md`                                        | What the app is and how it is built, in numbered sections that tasks cite                      |
| `ROADMAP.md`, `docs/epics/`                        | The tasks (one row each, permanent IDs) and each task's detail and "Accepts when"              |
| `docs/research`, `rfcs`, `adrs`, `workstreams`     | Created when needed, used as Sovereign uses them                                               |
| `CHANGELOG.md`                                     | Keep a Changelog; `[Unreleased]` as you go; it is the release notes                            |
| `RELEASING.md`, `scripts/release.sh`               | The release, copied from Tusk                                                                  |
| `sovereign.manifest.json`, `Dockerfile`, `deploy/` | What an instance reads; the image; Compose setups for running it alone (one per database form) |
| `.github/workflows/`                               | CI (only what a change affects), publish on a tag                                              |

**The image**: multi-stage, standalone Next server only; `USER node`; `ARG PORT` (required) and `EXPOSE ${PORT}`; migrations copied
beside the server; the licences in `/usr/share/licenses/`; `.dockerignore` keeps every `.env` out. **Debian, not Alpine**, if it uses
libSQL's native client (no build for musl). A `/api/health` that answers `200` once the database is ready. `scripts/deploy-check.sh`
boots every setup from nothing, and as an instance would host it.

**The app template.** `npm create @sovereignfs app <name> --port <N>` makes a hosted app that runs as it stands (manifest, Dockerfile,
publish workflow, health route, config, migrations, SDK sign-in). It is **core-only and PostgreSQL-only**, so it suits an app that
will only ever be hosted. An app that must also run alone is started from Tusk's structure instead.

## 12. Releasing and hosting

**Release**: changes collect under `[Unreleased]`; `scripts/release.sh check | prepare | propose | tag | verify X.Y.Z`. `prepare`
makes the release commit on a branch; it merges through a PR (rebase and merge); `tag` waits for CI on that exact commit, pushes
`vX.Y.Z`, and the publish workflow builds `linux/amd64` and `linux/arm64` on native runners, joins them, attests provenance, pulls
the published image and boots it, then writes the release page. The first time, make the package public in the organisation's
Packages settings. Semver for an app: a patch has no migration and no setting change; a minor may (forward-only); pre-1.0 a break is
a minor marked **breaking**.

**Host it** from an instance repository:

```bash
./sv app add <name> --image ghcr.io/sovereignfs/<app>:X.Y.Z   # registers it at core, makes its database and secrets
./sv app update <name> --image ghcr.io/sovereignfs/<app>:X.Y.Z
./sv push && ./sv deploy                                      # commit and put it on the server
./sv status | ./sv logs <name> | ./sv doctor
```

The name is its subdomain (`tusk.sovereign.openfs.io`). Images are pinned by tag and digest in `suite.lock`, never `latest`. Take
`./sv backup` before deploying a release with a migration: going back means restoring it.

## 13. Working conventions

The ones every repository of the suite shares (each repository's `AGENTS.md` is authoritative for itself):

- **One task, one branch, one draft PR**, from an up-to-date `main`; branches `feat/`, `fix/`, `docs/`, `chore/`. Nothing goes to `main`
  directly; merge with rebase and merge; never merge automatically. Never commit or push without being asked.
- **Commits**: `type(scope): summary` under 72 characters, a body that says why, wrapped at 100, a `Verified:` line naming what was run,
  one logical change each. An agent's commits end with `Co-Authored-By: Claude Code <noreply@anthropic.com>`.
- **Docs are part of the change**: a statement made false is fixed in the same PR, and a change of behaviour adds a changelog line.
- **Planning**: `DESIGN.md` says what, `ROADMAP.md` the order, the epic the detail; task IDs are permanent and never in branch names,
  commits or PR titles. A finished task is marked in its row and written up in its epic in the same change.
- **Verify before claiming done**: format, lint, types, tests, build, the manifest check; a regression test is trusted only once seen
  failing.
- **A gap in a contract is raised in `sovereign`**, not worked around in the app.

## 14. Planning a new app

What a plan has to decide, in this order. An agent planning one writes these answers into `DESIGN.md` before the first task.

1. **What it is**, for whom, and the user journeys. What it is not, and what of the legacy plugins it replaces.
2. **Name and prefix** (lower case, letters and digits, a DNS label of 2–32 characters, not reserved), and **its port** (the next free
   one after 3002; add it to §2's table).
3. **Alone, hosted, or both.** If both (the default for the suite): local and/or core sign-in, three database forms. If hosted only:
   the template is a start.
4. **Sign-in**: which ways in, the scopes, sign-up default, the delete-everything function and the tables it covers.
5. **Data**: entities, which dialects, `data` paths if it writes files, whether `pooling` is safe, what is a credential and is encrypted.
6. **Core**: which app scopes (bell, email, activity) and person scopes, and what happens with no instance or an older core. The `core`
   floor.
7. **Interface**: which screens, which `@sovereignfs/ui` parts, what is missing and goes into the design system first. Offline?
   Mobile?
8. **Deployment**: the image, the Compose setups, health, what the operator sets beyond the manifest (`suite.yml` `env`).
9. **Phases and the roadmap**, with each task's "Accepts when".

A first roadmap follows the order Tusk was built in: the repository's conventions (licence, contributing, CI, formatting, linting,
tests) → manifest, health and configuration → database (three forms, migrations at start-up) → sign-in (local, core, notices, account
deletion) → the shell with `@sovereignfs/ui` → the first feature → image, `deploy/` and the publish workflow → release `0.1.0` → host it on an
instance.

## 15. Not settled yet

- **Each app copies the infrastructure** (database boot, retry and sqld namespaces, start-up, notices routes, envelope encryption), and
  the copies have drifted. [Research 0004](research/0004-a-kit-for-apps-of-their-own.md) recommends publishing it as a kit, in steps:
  settings (done: `@sovereignfs/config`), the notice handlers in the SDK, two stores and the boot sequence in `database`, the envelope
  format in `crypto`, then a template for an app of its own. Until then, copy from Tusk, and say in the design which files were copied.
- **`env.md`'s `FIELD_ENCRYPTION_KEYS`** is not what the apps use (`<P>_ENCRYPTION_KEY` and `_PREVIOUS`); research 0004 step 4 reconciles them.
- **The template** makes a core-only PostgreSQL app; an app of its own does not start there yet.
- **`AUTH_LOCAL` takes `1`** (Tusk also accepts `true`), which `env.md` §4's booleans (exactly `true` or `false`) do not allow. Until
  the contract and the apps agree, accept both.

## Where to read more

| Topic                                   | Document                                                                                                                                                          |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The manifest, what an app gets and owes | [`contracts/app-manifest.md`](../contracts/app-manifest.md)                                                                                                       |
| Environment variables                   | [`contracts/env.md`](../contracts/env.md)                                                                                                                         |
| The instance repository, `suite.yml`    | [`contracts/suite.md`](../contracts/suite.md)                                                                                                                     |
| Core's API                              | [`contracts/core-api/`](../contracts/core-api)                                                                                                                    |
| The SDK                                 | [`using-the-sdk.md`](using-the-sdk.md), [`specs/sdk.md`](specs/sdk.md)                                                                                            |
| Sign-in through core (any language)     | [`connecting-an-app.md`](connecting-an-app.md)                                                                                                                    |
| The design system                       | [`design-system.md`](design-system.md), [`specs/design-system.md`](specs/design-system.md), the [Storybook](https://sovereignfs.github.io/storybook/)             |
| The operator's toolkit                  | [`specs/operator-cli.md`](specs/operator-cli.md), [`deploying.md`](deploying.md), [`operating.md`](operating.md)                                                  |
| Releasing Sovereign's packages          | [`releasing.md`](releasing.md)                                                                                                                                    |
| An app built this way                   | [`sovereignfs/tusk`](https://github.com/sovereignfs/tusk) (`AGENTS.md`, `DESIGN.md`), [`sovereignfs/fjord`](https://github.com/sovereignfs/fjord) (`clients/web`) |
