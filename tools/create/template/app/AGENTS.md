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
- **CI runs only for `main`:** on pull requests into it that are not drafts, before a release and by hand; never for `develop` or a
  feature branch, which the pre-push hook (`npm run verify`) checks locally.
- **Verify before claiming done,** and show the output. A regression test is trusted only after it has been seen to fail against the code
  it guards.
- **Docs are part of the change:** a statement a change makes false is fixed in the same change.
- **Flag Docker-config impact immediately:** a new or renamed environment variable, port, on-disk path or native dependency updates the
  `Dockerfile`, `.dockerignore` and Compose files in the same change.
- **Shared files are written, not edited:** the files `npm create @sovereignfs app sync` writes (this section among them) are changed
  in the template, in sovereignfs/sovereign, and taken with the next sync; a file this app keeps as its own is listed in `package.json`
  under `sovereign.unmanaged`.

<!-- sovereign:shared:end -->

## Rules of this app

Say here what is particular to this app: its data, its pages, what it must never do.
