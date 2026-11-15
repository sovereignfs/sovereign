# Changelog: @sovereignfs/cli and @sovereignfs/create

What changed in each version of the operator toolkit, `sv`, its image and `npm create @sovereignfs`, released together, newest first, in the form of [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versions follow [semver](https://semver.org/). A version's section is written in the change that sets the version, dated that day,
and becomes the release notes when the version is published. This file starts at 0.12.0; earlier versions are in the repository's
history and tags.

## [0.14.0] - 2026-11-15

### Added

- `npm create @sovereignfs app sync` writes an app's shared files from this version's template (its release workflows, repository
  settings, contributing and release guides, `CLAUDE.md`, and the shared section of `AGENTS.md`), and `app sync --check` fails when one has
  drifted; a file listed under `sovereign.unmanaged` is the app's own.
- `app release check` and `app release notes` for the one release model (a promotion titled `Release vX.Y.Z` publishes on merge), and
  `app commits check` for agent trailers: what the workflows every app shares (in sovereignfs/sovereign) run.
- `app settings apply` and `app settings check` keep a repository's settings and rulesets as code, in `.github/repository.json`.
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
