# AGENTS.md

Guidance for every AI agent working on **TITLE** (Claude Code reads it through `CLAUDE.md`). The sections above and below the shared one are
this app's own; the shared one is written by `npm create @sovereignfs app sync` and is the same in every app of the suite.

## What this is

**TITLE** is an app for a [Sovereign](https://github.com/sovereignfs/sovereign) instance. Say here what it does and for whom.

## Source of truth

- `README.md`: what is here, how to build, host and run it.
- `sovereign.manifest.json`: what an instance needs to know to host it.
- `CONTRIBUTING.md` and `RELEASING.md`: how work lands and how a version is released.

<!-- sovereign:shared:begin -->

## Working conventions (shared by every app of the suite)

- **Two branches.** Work lands on `develop`, committed directly or through a feature branch (`feat/`, `fix/`, `docs/`, `chore/` and a
  slug) cut from an up-to-date `develop` and merged into it by draft pull request with rebase and merge. `main` is what is released: it
  is protected and changes only by a promotion pull request from `develop`, merged with a merge commit (`CONTRIBUTING.md`).
- **Never commit or push without being asked.** Prepare changes in the working tree and stop. **Never merge a pull request
  automatically.**
- **Commits explain why, not just what:** `type(scope): summary` (`feat`, `fix`, `docs`, `chore`) under 72 characters, a body wrapped at
  100, a `Verified:` line naming what was run, one logical change each. An agent's commits end with its own model-agnostic trailer:
  `Co-Authored-By: Claude Code <noreply@anthropic.com>` or `Co-Authored-By: Codex <noreply@openai.com>`, never one naming a model (the
  promotion check refuses it).
- **Pull requests into `develop` are drafts,** marked ready only on instruction; the body says what changed and why and ends with the
  agent's footer.
- **A version is set with its changelog section,** in the same change: `version` in `package.json` (or, in a repository of several
  components, the file `sovereign.json` names for it) and `## [X.Y.Z] - date` in its changelog, in plain words for someone upgrading. A
  promotion titled `Release` with that version's tag publishes it on merge (`RELEASING.md`).
- **The version follows the change, by semver:** a `fix/` is a patch, a `feat/` a minor, a breaking change a major with a note for whoever
  upgrades; `chore/` and `docs/` change no version unless they change what the app offers. Its tag is `vX.Y.Z`, with the `tagPrefix`
  `package.json` names in front, made on the promotion's merge commit, never by hand.
- **One task, one branch, one pull request,** reviewed before the next begins. `develop` and `main` are never rewritten: fix a commit
  message before it reaches `develop`.
- **CI runs only for `main`:** on pull requests into it that are not drafts, before a release and by hand; never for `develop` or a
  feature branch, which the pre-push hook (`__RUN__ verify`) checks locally.
- **Verify before claiming done,** and show the output. A regression test is trusted only after it has been seen to fail against the code
  it guards.
- **Docs are part of the change:** a statement a change makes false is fixed in the same change.
- **Flag Docker-config impact immediately:** a new or renamed environment variable, port, on-disk path or native dependency may need the
  `Dockerfile`, `.dockerignore` or `compose.yml` changed. Those are shared files, the same in every app: change them in the template, or
  list the one this app must keep as its own under `sovereign.unmanaged` and change it here, in the same change.
- **Shared files are written, not edited:** the files `npm create @sovereignfs app sync` writes (this section among them) are changed
  in the template, in sovereignfs/sovereign, and taken with the next sync; a file this app keeps as its own is listed in `package.json`
  under `sovereign.unmanaged`.
- **Commands are this app's package manager's:** `__INSTALL__`, `__RUN__ dev`, `__RUN__ build`, `__RUN__ verify`. Never add a second
  lockfile.

## Rules every app of the suite keeps

- **Naming:** user-facing text says "app"; "client" is the protocol term, for code and the settings that register one. Every environment
  variable carries the app's prefix (`__PREFIX___`), and every one the code reads is declared in `.env.example`, a secret also as
  `NAME_FILE`.
- **No secret has a default:** a required setting the app cannot start without stops it at start-up, saying which; it is never filled in.
- **Every server action and route decides for itself:** it asks who is calling (the session) before it reads or changes anything, and
  one that changes something checks the request came from the app's own origin. A page's guard protects nothing, since a `'use server'`
  function is a public endpoint.
- **A person's data is theirs alone:** every statement that reads, changes or deletes it names the owner, from the session, never from
  the request; their data and files are deleted with the notice that they deleted their account.
- **People's files go only through `@sovereignfs/storage`,** in the app's own folder; a type is judged by the bytes, and only an image is
  shown inline.
- **Tokens and keys are compared in constant time,** never logged, and the refresh token is the SDK's to send; nothing from a request is
  put into a shell command.
- **Every outbound `fetch` has a timeout,** and a server render never waits on another service without one.
- **The data layer is async and migrations only move forward:** a migration in `migrations/` is applied once, in name order, at start;
  one that has been released is never edited, and a change is a new file.
- **Configuration is read at run time:** never `NEXT_PUBLIC_*` for a value that differs between instances, since it is fixed at build;
  the image bakes in no environment and no `.env` file.
- **The interface is `@sovereignfs/ui`'s:** its components, and its semantic `--sv-*` tokens for colour; no hard-coded colour, no
  Tailwind, no CSS-in-JS. The content security policy is a nonce, never `'unsafe-inline'` for scripts.
- **Read the Next.js docs that come with the installed version** (`node_modules/next/dist/docs/`) before writing Next.js code; it
  changes faster than anything remembered.

<!-- sovereign:shared:end -->

## Rules of this app

Say here what is particular to this app: its data, its pages, what it must never do.
