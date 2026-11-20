# Changelog: @sovereignfs/cli and @sovereignfs/create

What changed in each version of the operator toolkit, `sv`, its image and `npm create @sovereignfs`, released together, newest first, in the form of [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versions follow [semver](https://semver.org/). A version's section is written in the change that sets the version, dated that day,
and becomes the release notes when the version is published. This file starts at 0.12.0; earlier versions are in the repository's
history and tags.

## [0.27.0] - 2026-11-20

### Added

- An app made by `npm create @sovereignfs app` sends notifications (Web Push, RFC 0009), with and without `--encryption`: the key
  `<PREFIX>_VAPID_PRIVATE_KEY` in the manifest's `generate`, so an instance makes it; devices and waiting pushes in its database
  (`migrations/002_push.sql`, `lib/push.ts`, the keys sealed); the route a device turns them on with; the worker showing them;
  `PushControl` on the home page with "Send me a test notification"; the outbox started at start-up; the device turned off before
  signing out, and forgotten with the account. It depends on `@sovereignfs/push` 0.2, `@sovereignfs/pwa` 0.2 and `@sovereignfs/ui`
  0.104.

### Changed

- The core this toolkit was made for is 0.131.0, the one released with it: `sv setup` starts on it when the registry cannot be
  asked, where it named 0.111.0, a version never published.

### Fixed

- Reading an app's manifest from a pinned image takes the image's tag off by scanning it, where a pattern took time in proportion to
  the square of a reference made of many colons (CodeQL's polynomial regular expression).

## [0.26.0] - 2026-11-20

### Added

- `npm create @sovereignfs app --package-manager pnpm|npm|yarn` chooses the app's package manager, pnpm by default (Yarn 4, with
  `node_modules`). The app's `packageManager` field, lockfile, Dockerfile, pre-push hook, workflows, README and AGENTS.md use its
  commands. An app without the field is taken as npm, so an existing app is unchanged by `app sync`.
- `npm create @sovereignfs instance` writes `AGENTS.md` and `CLAUDE.md`, a guide for an AI agent an operator hands the instance to: what
  each file is, how a change is made, and what an agent may do alone, only when asked, and never. `sv push` commits both.

### Changed

- `npm create @sovereignfs app sync` keeps the `Dockerfile`, `.dockerignore` and `compose.yml` the same in every app; an app that needs
  its own lists the file under `sovereign.unmanaged`.
- The shared section of an app's `AGENTS.md` covers versions, one task per branch, naming, secrets, people's data, timeouts,
  migrations, configuration at run time and the design system.

## [0.25.0] - 2026-11-20

### Added

- `npm create @sovereignfs app` makes a manifest 5 app that answers core's export request: a person's notes and files go into the data
  they download from core. It depends on `@sovereignfs/sdk` 2.9, `@sovereignfs/manifest` 0.4 and `@sovereignfs/ui` 0.102, and asks for core 0.121 or later.

## [0.24.0] - 2026-11-20

### Added

- An app's manifest 5 `signIn.export`, and an external app's `export` in `suite.yml` (`--export` on `sv app add` and `sv app update`),
  register where core asks the app for a person's part of their export.

## [0.23.0] - 2026-11-20

### Added

- `sv key export` prints the line to paste into the Console's Data page (the public keys of `secrets.recipients`), so that the owner's
  export of core is encrypted to the keys that already open the instance's backups.
- `sv export open FILE [--key FILE] [--out DIR]` decrypts an export the Console gave, checks every file against its list, and unpacks it
  into a folder beside it; an export that fails the check leaves nothing behind.

### Fixed

- `sv restore` refuses an export, which begins with `export.json` and holds no database: it was read as a backup from before
  `backup.json` and would have been restored as the whole instance.

## [0.22.0] - 2026-11-20

### Changed

- An app made by `npm create @sovereignfs app` reads who is signed in from one typed user (`userOfSession` in `lib/session.ts`), the
  same for an account of its own and one from core.

## [0.21.0] - 2026-11-20

### Changed

- An app made by `npm create @sovereignfs app` signs people in with `@sovereignfs/auth`: with accounts of its own, through the instance's
  core, or both, chosen by `<PREFIX>_AUTH_LOCAL` and `<PREFIX>_CORE_URL`, so it runs with no instance at all. It has its own sign-in,
  sign-up and security pages; hosted by an instance, it sends people straight on to core, as before. Its sign-in routes move under
  `/api/auth` and core's notices under `/api/sovereign`, and its manifest says so. An app made with `--encryption` signs in through
  core with the SDK, as before.

## [0.20.0] - 2026-11-19

### Changed

- `sv apply` registers an external app so that signing out of it leaves the person's core session, on core 0.119.0 or later; on an
  older core the app is registered as before.

## [0.19.0] - 2026-11-19

### Added

- An external app in `suite.yml` may name where core tells it that a person who used it deleted their account (`accountDeleted`) and
  where core's key release returns a person with its key (`keyReturn`), as a hosted app does through its manifest. `sv app add --external`
  takes `--account-deleted` and `--key-return`, and `sv app update` changes them.

### Changed

- An app made by `npm create @sovereignfs app` checks each person's session against core every hour: the next page they open after
  that goes through core, which shows nothing while they are still signed in there, asks them to sign in when they are not, and brings
  their name and roles up to date. It needs `@sovereignfs/sdk` 2.8, so that release comes first.

## [0.18.0] - 2026-11-18

### Added

- An app made by `npm create @sovereignfs app` installs on a phone and a desktop: it depends on the new `@sovereignfs/pwa` and has a web
  app manifest (with what lets an installed core open the installed app), a service worker that keeps only files that are the same for
  everyone, icons drawn from the app's initial, the metadata an iPhone reads, and a notice when a new version is ready. Its
  `sovereign.manifest.json` names the icon for the launcher. This release was made for core 0.111.0.
- The app template sends every page with a content security policy: a nonce per request, nothing from another site, and core's origin
  allowed for the sign-out form. Both the plain and the `--encryption` app sign in, work, unlock and sign out under it.

## [0.17.1] - 2026-11-17

### Fixed

- `sv deploy` no longer stops on an upgrade of core with “Reading the image’s user failed: No such image”: the image whose user it reads
  (core's new one, or a new app's) is pulled first when the server does not have it yet. Until now, the way round was to pull it on the
  server by hand and deploy again.
- `sv upgrade` moves core to the newest published release the toolkit supports, as `sv setup` chooses one, never backward; it moved it only
  to the core the toolkit was made for, which in 0.17.0 was still 0.97.0, so an upgrade left core where it was. Offline, it moves it to that
  one, and says why. This release was made for core 0.108.0.

## [0.17.0] - 2026-11-17

### Added

- `npm create @sovereignfs app <dir> --encryption` makes an app whose notes are encrypted in the browser and shared between people of
  the instance (operator-cli §2), with an `ENCRYPTION.md` that says what it protects and that it is not yet audited.

## [0.16.0] - 2026-11-17

### Added

- `sv key escrow` makes the key that lets an instance's owner recover people's encrypted data, keeps its private half off the server,
  and prints the line to paste into the Console; `sv key escrow open` recovers one person offline with a new recovery kit (operator-cli
  §9.5).

## [0.15.0] - 2026-11-16

### Added

- Manifest 4: `sv app add` says when an app keeps its people's data encrypted (not yet reviewed or audited), and `sv apply` gives
  core the app's key return address, which lets it use encryption. Needs a core that knows `--key-return`.
- An app made by `npm create @sovereignfs app` depends on `@sovereignfs/manifest` 0.3, and on `@sovereignfs/ui` 0.97.

## [0.14.0] - 2026-11-15

### Added

- `npm create @sovereignfs app sync` writes an app's shared files from this version's template (its release workflows, repository
  settings, contributing and release guides, `CLAUDE.md`, and the shared section of `AGENTS.md`), and `app sync --check` fails when one has
  drifted; a file listed under `sovereign.unmanaged` is the app's own.
- `app release check` and `app release notes` for the one release model (a promotion titled `Release vX.Y.Z` publishes on merge), and
  `app commits check` for agent trailers: what the workflows every app shares (in sovereignfs/sovereign) run.
- `app settings apply` and `app settings check` keep a repository's settings and rulesets as code, in `.github/repository.json`;
  what a workflow's token cannot read (some merge settings, who may bypass a ruleset) is reported as not checked, never as a difference.
- A repository that releases several components (such as a Rust CLI and a web app) describes them in `sovereign.json` at its root: each
  one's version file (`package.json` or `Cargo.toml`), tag prefix, changelog and publish workflow. A promotion title names any of their
  versions, the release tags each and calls each one's publish workflow, and `app sync` generates that release workflow.
- A new app carries all of these, pins `@sovereignfs/create`, and has a `CHANGELOG.md`; its publish workflow is called on a merged
  `Release` promotion and makes the GitHub release.

### Changed

- `sync`, `release`, `commits` and `settings` cannot name a new app.

## [0.13.0] - 2026-11-15

0.12.1 was never released; its fixes are part of this version.

### Changed

- An app made by `npm create @sovereignfs app` is named `@sovereignfs/<name>` in its `package.json`, which stays `private`.

### Fixed

- Every word `sv` sends to the server over SSH is quoted for the server's shell, so a word with a space, a quote, `;`, `$` or a
  backtick reaches the server's program as one argument and nothing in it runs (security review, Phase 2).
- `sv logs` refuses a name that is not core, the proxy, the database, `deploy` or an app before asking the server.

## [0.12.0] - 2026-11-15

### Added

- An app made by `npm create @sovereignfs app` starts on `develop`, with its first commit on `main`, and a `CONTRIBUTING.md` that
  explains the branch workflow: work lands on `develop`, and `main` changes only by a promotion pull request merged with a merge commit.
- The app's checks run where a change is about to reach `main`: `.github/workflows/ci.yml` (typecheck, the manifest check, the build)
  on pull requests into `main` that are not drafts and before each release, and a versioned pre-push hook (`.githooks/pre-push`,
  turned on by `npm install`) for everything else.
- `.github/workflows/sync-develop.yml` fast-forwards the app's `develop` to the merge commit after each promotion.

### Changed

- The app's publish workflow refuses a tag whose commit is not on `main`, and runs the app's checks before it builds.
- The app depends on Next.js `^16.4.6`.

### Fixed

- The app's README is titled with the app's name; it read "**TITLE**".
