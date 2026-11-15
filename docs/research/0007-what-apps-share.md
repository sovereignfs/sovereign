# Research 0007 — What every app's repository shares, kept once

|                   |                                                                                                                                                                                                                                                     |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Status**        | Recommended; the first slice settled (below)                                                                                                                                                                                                        |
| **Date**          | November 2026                                                                                                                                                                                                                                       |
| **Author**        | Claude Code                                                                                                                                                                                                                                         |
| **Scope**         | The app repositories of the suite; [`tools/create`](../../tools/create) and its template; this repository's workflows, [CONTRIBUTING](../../CONTRIBUTING.md) and [AGENTS.md](../../AGENTS.md); [research 0004](0004-a-kit-for-apps-of-their-own.md) |
| **Versions read** | Platform 0.97.1, toolkit 0.13.0, and the `develop` branch of tusk, ledger, tally, wallet, waymark, shopper, fjord and flynn on 15 November 2026                                                                                                     |

---

## Question

Every app of the suite carries the same repository around its code: a release script and its tests, CI and publish workflows, a
Dockerfile and Compose setups, the agent instructions (`AGENTS.md`, `CLAUDE.md`), the contributing guide, the git workflow and the commit
conventions. Each repository has its own copy, and the copies drift from each other, from the app template, and from this repository,
whose workflow changed under them (`develop` and `main`, promotions, release on merge). How should the suite keep these once, so that a new
app starts with them and an existing app stays current, without making every app wait on this repository for every change?

[Research 0004](0004-a-kit-for-apps-of-their-own.md) asked the same of the apps' **runtime code** (settings, core's notices, stores, stored
secrets) and recommended packages. This asks it of everything around the code. The two meet in the template.

## Method

Each app repository's files were fetched from its `develop` branch, the app's own name replaced by a placeholder in every copy, and each
file compared across the apps (how many distinct versions, and how much of the least alike pair matches tusk's), then against fjord, this
repository and the template. Prose was also compared word by word, since one rule wrapped differently is a different line.

**Not done:** no app's CI or release was run with a shared piece in place; GitHub's reusable workflows were read, not tried across these
repositories.

## Findings

1. **Six apps are one shape.** tusk, ledger, tally, wallet, waymark and shopper each hold the same 29 files around their code. fjord
   (Rust and WebAssembly, several things released) shares its release library and its docs; flynn (iOS) shares only the `develop` sync.
2. **Much is identical**, the app's name aside:

   | File                                                                                                                   | Lines | Versions | Also                             |
   | ---------------------------------------------------------------------------------------------------------------------- | ----- | -------- | -------------------------------- |
   | `scripts/lib/release.sh`                                                                                               | 709   | 1        | fjord's is 96% the same          |
   | `scripts/test-release.sh`                                                                                              | 456   | 2        |                                  |
   | `.github/workflows/publish.yml`                                                                                        | 278   | 2        |                                  |
   | `RELEASING.md`, `scripts/release.sh`                                                                                   | 167   | 1        |                                  |
   | `.github/workflows/sync-develop.yml`                                                                                   | 51    | 1        | here, the template, fjord, flynn |
   | `.github/dependabot.yml`, `tsconfig.json`, `deploy/compose.postgres.yaml`, `.editorconfig`, `.node-version`, `LICENSE` |       | 1        |                                  |
   | `prettier.config.ts`                                                                                                   | 12    | 2        | this repository's, exactly       |

3. **Much more is nearly identical, and drifting:** `ci.yml` (344 lines, six versions, the least alike pair 80% the same),
   `scripts/deploy-check.sh` (226, 93%), the `Dockerfile` (74, six versions, 82%), `deploy/compose.yaml` and `compose.file.yaml` (90–92%),
   `CONTRIBUTING.md` (94%), `ci-changes.sh` and its test, `.dockerignore`, `.prettierignore`, the pull request template.
4. **The agent instructions share whole sections.** In `AGENTS.md`, "Working conventions" is about two thirds the same across the apps word
   for word, "Source of truth" and "Planning workflow" a little less, "pnpm" under half, and "Rules of an app" a fifth to a third; the rest
   is the app's own. `CLAUDE.md` is 56% the same. The apps' conventions and this repository's are separate copies of similar rules (16%
   the same words).
5. **There are three sources, none of them the others'.** This repository; the app template, a lighter, core-only, PostgreSQL-only app whose
   CI is 8% like the apps'; and the tusk family's copies, the fullest app repository (a release library, three Compose setups, a deployment
   check), copied from one repository to the next.
6. **The apps' copies describe a workflow their repositories no longer allow.** Their conventions, `RELEASING.md` and release library
   branch from `main`, merge a release pull request into it with rebase and merge, keep an `[Unreleased]` changelog and run CI on every push
   to `main`. Their `main` now takes merge commits only, from `develop` (the rulesets of 15 November), so the next release through
   `release.sh` would be refused at its merge. This repository already releases the new way: a promotion whose title names the versions,
   a required check of that title, and `release.yml`, which tags and publishes on merge.
7. **Some of this can be a package and some cannot.** Code and configuration that a tool reads (ESLint, Prettier, TypeScript, a release
   tool) can be a versioned dependency that Dependabot keeps current. A `Dockerfile`, a Compose file, a workflow's triggers and the documents
   an agent reads must be files in the repository, written in it.

## Options

- **A. The template only.** `npm create @sovereignfs app` makes a complete repository; nothing reaches it afterwards. This is today, and
  finding 3 is what it leads to.
- **B. Shared npm packages,** for what a tool can read from a dependency: `@sovereignfs/tsconfig` (private here today), a new
  `@sovereignfs/eslint-config` and `@sovereignfs/prettier-config` (this repository's own, extracted), and the release logic as a tool. Each
  is versioned and arrives in an app as a Dependabot pull request.
- **C. Reusable GitHub workflows,** kept in this repository and called by each app at a pinned commit: the checks, publishing the image,
  the promotion title check, the release on merge, the `develop` sync. An app's workflow file shrinks to its triggers, its own few values
  and one `uses:` line; Dependabot moves the pin. A workflow's triggers stay in the app, which is where the CI strategy has to live.
- **D. Managed files, written by a command.** For what cannot be a dependency (finding 7): `create` gains a `sync` that writes the shared
  files into an existing app (the `Dockerfile`, `.dockerignore`, the Compose setups, the deployment check, `CONTRIBUTING.md`, `CLAUDE.md`,
  the pull request template, `dependabot.yml`, `.editorconfig`, `.node-version`, `LICENSE`) and the shared sections of `AGENTS.md` between
  marked lines, from the app's manifest and a few settings, showing what it changes; `sync --check` in an app's CI says when it has drifted.
- **E. One release model.** Retire the apps' release library for this repository's model (finding 6), with the single-package form: a
  promotion titled `vX.Y.Z`, `Release vX.Y.Z` when it is to be published; the title checked; a merge that tags it and calls the publish
  workflow; the changelog's section read for the GitHub release. It removes about 1,300 lines (the library, its script, its tests and
  `RELEASING.md`) from each of the six one-package apps, and makes their releases work again under the rulesets; fjord, which releases
  several things, can follow once the release pieces take several, as this repository's already do.
- **F. Git submodules or a subtree** for the shared files. They pin a whole directory, confuse contributors and agents, and need a step
  in every clone; rejected.

## Recommendation: E first, then C, B and D together, with the template as their one source

1. **E now:** it is what makes the apps' releases work again. This repository's release pieces (`release:check`, `promotion:draft`,
   `release.yml`, the changelog rule) gain a single-package form, and each app moves to it with its next change, its `RELEASING.md` and
   `AGENTS.md` conventions rewritten to the `develop` and `main` workflow.
2. **C, for every workflow:** `app-ci.yml`, `app-publish.yml`, `app-promotion.yml`, `app-release.yml` and the `develop` sync live here,
   called at a pinned commit; this repository's own workflows stay its own. A test holds the template's callers to the CI strategy, as
   today.
3. **B, for configuration:** publish `@sovereignfs/tsconfig`, `@sovereignfs/eslint-config` and `@sovereignfs/prettier-config`; this
   repository uses the same packages, so the configuration it is checked by is the one apps get.
4. **D, for the files that must be files:** `create sync` and `sync --check`, writing from the template, so the template is the one source
   of every shared file. `AGENTS.md`'s shared sections (the working conventions, the CI strategy, the commit rules, pnpm) become one text in
   the template, which this repository's own `AGENTS.md` also carries, held to it by a test.
5. **The template becomes the full app**, as research 0004's last step says: the tusk family's repository (the deployment check, the three
   Compose setups) made from the kit, so that a new app and a synced one are the same.
6. **fjord and flynn** take what fits (the sync, the promotion and release workflows where their releases allow); their own build stays
   theirs.

What this does not do: make an app's release wait on this repository's (an app moves its pin when it chooses), or put an app's own
documents (`DESIGN.md`, `ROADMAP.md`, its changelog, its manifest) anywhere but in the app.

## Not now

- A separate repository for the shared workflows: this one is public, already versioned and released, and a reusable workflow is fetched by
  its file alone.
- Generating `DESIGN.md`, `ROADMAP.md` or an app's own sections of `AGENTS.md`.
- Converting the apps' Next.js code; that is research 0004.

## Settled in review (15 November 2026)

For the first slice, the one release model (E) with its workflows shared (C):

- **All six one-package apps move in one pass,** since none can release until it does.
- **The release workflows are shared from this repository** (`app-promotion.yml`, `app-release.yml`, `app-publish.yml`), called by each
  app at a **pinned commit** that Dependabot moves.
- **Apps use this repository's changelog rule:** a version's section is written in the change that sets it, a test fails without it,
  and it becomes the GitHub release's notes.
- **The old release machinery is removed in the same change** (the library, its script and tests, the app's component file), and
  `RELEASING.md` is rewritten for the new model.
- **Each app's change is a draft pull request into its `develop`,** for review.
- **fjord stays one repository; its web app (`clients/web`) takes the shared model,** without changing how fjord's other components build
  and release. So the shared workflows take the directory an app is in and the prefix of its tag (`web-vX.Y.Z`), not only the
  repository's root and `vX.Y.Z`.

## Still to settle

- Whether `sync` is a command of `@sovereignfs/create` or a tool of its own (`@sovereignfs/app`), and whether `sync --check` fails an app's
  CI or only warns.

## Changelog

| Date       | Change                                                                                                                          |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------- |
| 2026-11-15 | First version.                                                                                                                  |
| 2026-11-15 | The first slice settled in review: all six apps in one pass, shared workflows pinned by commit, fjord's `clients/web` included. |
