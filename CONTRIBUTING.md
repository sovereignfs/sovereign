# Contributing to Sovereign

Thank you for helping. This guide covers how work gets into `develop`, and from there into `main`. Agents
follow the same rules, written for them in [AGENTS.md](AGENTS.md).

## Contents

- [Development setup](#development-setup)
- [Branching and commits](#branching-and-commits)
- [Pull requests](#pull-requests)
- [Proposing a feature (RFCs)](#proposing-a-feature-rfcs)
- [Contributor Licence Agreement](#contributor-licence-agreement)

---

## Development setup

You need Node 24.15 or later (the exact version is in `.node-version`), pnpm 11
(`packageManager` in `package.json` pins the version; pnpm fetches it for you),
and Docker (for the development sqld database, from task 0.5).

```bash
git clone git@github.com:sovereignfs/sovereign.git
cd sovereign
pnpm install --frozen-lockfile   # also installs the pre-commit and pre-push hooks
pnpm verify:push                 # everything CI will check
```

The hooks run Prettier and ESLint on the files you commit and the full
`pnpm verify:push` before a push.

To run core, give it the two variables it cannot start without (`SV_URL` and
`SV_AUTH_SECRET`; the rules are in [`contracts/env.md`](contracts/env.md)):

```bash
cp apps/core/.env.example apps/core/.env.local
# set SV_AUTH_SECRET to the output of: openssl rand -base64 48
pnpm dev                         # http://localhost:3000, and /api/health
```

Without them core exits at start-up and says which are missing. Core runs without a
database for now; set `SV_DB_DIALECT` and its address (see `.env.example`) to give it one,
and `/api/health` reports it up or down.

Core's tables are written twice, once per dialect (`apps/core/src/db/schema/sqlite.ts` and
`postgres.ts`), and a test fails if the two stop being a pair. After changing both, generate
the migrations and commit them with the change:

```bash
pnpm --filter core db:generate   # both dialects; random file names
pnpm --filter core db:generate:sqlite -- --name add_thing   # or one dialect, with a name
```

Core applies its migrations when it starts, and every instance may do so at once.

The tests that need a real database (`*.db.test.ts`, run with `pnpm test:db`) use the
dialect named by `SV_DB_DIALECT`, once per dialect in CI. To run a leg locally, start the
server CI starts and set the variables it sets:

````bash
# sqld (it needs the --enable-namespaces flag, which has no environment equivalent)
docker run -d --name sqld-ci -p 8080:8080 -p 8081:8081 \
  -e SQLD_NODE=primary -e SQLD_HTTP_LISTEN_ADDR=0.0.0.0:8080 -e SQLD_ADMIN_LISTEN_ADDR=0.0.0.0:8081 \
  ghcr.io/tursodatabase/libsql-server:v0.24.33 /bin/sqld --enable-namespaces
SV_DB_DIALECT=sqld SV_SQLD_URL=http://localhost:8080 SV_SQLD_ADMIN_URL=http://localhost:8081 pnpm test:db

# PostgreSQL
docker run -d --name postgres-ci -p 5432:5432 \
  -e POSTGRES_USER=sovereign -e POSTGRES_PASSWORD=sovereign -e POSTGRES_DB=sovereign_test postgres:18
SV_DB_DIALECT=postgres SV_POSTGRES_URL=postgres://sovereign:sovereign@localhost:5432/sovereign_test pnpm test:db

# a SQLite file needs no server
SV_DB_DIALECT=sqlite SV_SQLITE_URL=file:/tmp/sovereign-test.db pnpm test:db
``` The database
scripts and seed data arrive with tasks 0.5 and 1.2; this section grows as they
land.

---

## Branching and commits

### Branches

| Branch    | What it is                                                                                                                                                                                       |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `develop` | The working branch. Every change lands here first. It can never be deleted or force-pushed, not even by an administrator, so merging a promotion (which would otherwise delete its head branch) leaves it in place. |
| `main`    | What is released. It is **protected**: a change reaches it only through a promotion pull request from `develop`, never by a push (an administrator may bypass this in an emergency, and says so). |

There are two ways to get a change into `develop`; pick per change:

1. **Directly on `develop`.** Commit on an up-to-date `develop` and push it. The pre-push hook
   (`pnpm verify:push`) checks it on your machine; CI does not run for `develop`. Suits small, low-risk changes by a maintainer.

   ```bash
   git switch develop && git pull
   # edit, commit
   git push origin develop
   ```

2. **A feature branch.** Branch from an up-to-date `develop`, open a draft pull request **into `develop`**, and
   merge it with **rebase and merge** once it is reviewed. Suits anything that wants review, and every outside
   contribution.

   ```bash
   git switch develop && git pull
   git switch -c feat/your-feature-name
   ```

The commit, version-bump and pull request rules below are the same either way.

### Promoting `develop` into `main`

`main` changes only through a pull request from `develop`, merged with **a merge commit**, the one place a merge
commit is used. `develop` is never rewritten, so it stays an ancestor of `main` and the next promotion shows only
what is new. Not every promotion publishes something.

1. On an up-to-date `develop`, run `pnpm promotion:draft`. It compares `origin/main` with `develop` and prints the
   pull request's title and body:
   - **The title names the versions it carries**, by the identifiers tags and version commits use: the platform's
     `vX.Y.Z` first, then `<slug>-vX.Y.Z` for each published package or the toolkit whose version changed
     (`v0.98.0, ui-v0.97.0`; a promotion of the SDK alone is `sdk-v2.2.0`). When no version changed, it is the
     platform's current `vX.Y.Z`.
   - **It starts with `Release`** only when every version it names will be tagged and published once it is merged:
     say which with `--release v0.98.0,ui-v0.97.0`, or `--release all`. `Release` is for versions this promotion
     will tag, never one already tagged: the command refuses those. A version promoted earlier without `Release`, and so
     never tagged, can be named too: it is released by this promotion.
   - **The body** lists every version that changed, core's and the private packages' included, says whether merging
     publishes each, and lists the commits by the part of the repository they touch (core, the toolkit, each
     package, contracts, documentation, the repository).
2. Open the pull request from `develop` into `main` with that title and body. Once it is ready for review, the
   **Promotion title** check holds the title to the code (`pnpm release:check`): each version must be the one in its
   `package.json`, and a `Release` title may name only published things not tagged yet. Editing the title runs it again.
3. Merge it with a merge commit, which takes the title (`Release v0.98.0, ui-v0.97.0`). **Merging a `Release` promotion
   publishes it**: the Release workflow checks the title once more, tags the merge commit with each version it names, and
   runs the publish workflows, which publish the image, the toolkit or the package and make each version's GitHub release
   from its changelog section ([releasing](docs/releasing.md)). A title without `Release` publishes nothing; a version
   promoted that way can be published later by pushing its tag on the merge commit that brought it, which the publish
   workflows accept as before (a tag is not a branch, so `main`'s protection does not stop it).

Once the promotion is merged, `.github/workflows/sync-develop.yml` moves `develop` forward to the merge commit. It is a
fast-forward, never a rewrite (`develop` is already in the merge commit's history), so `develop` is not shown as behind
`main` and the release tags are in its history. If a commit reached `develop` after the merge, the run leaves `develop`
as it is and says so; pull before you start new work either way.

**Branch prefixes:**

| Prefix   | Use for                                         |
| -------- | ----------------------------------------------- |
| `feat/`  | New features or capabilities                    |
| `fix/`   | Bug fixes                                       |
| `docs/`  | Documentation only                              |
| `chore/` | Tooling, scaffolding, dependencies, maintenance |

**Commit messages** should explain _why_, not just _what_. Write the subject as
`type(scope): summary` — for example `feat(ui): add a currency's own fraction
digits` or `fix: end sessions after a password reset` — and keep it under 72
characters. Body lines wrap at 100 characters. Say what you verified.

If you used an AI assistant to help write the code, include the co-author
trailer in your commit:

```
Co-Authored-By: Claude Code <noreply@anthropic.com>
```

---

## Pull requests

- **One logical change per PR.** Keep scope tight.
- All checks must pass before review: `pnpm format:check`, `pnpm lint`,
  `pnpm typecheck`.
- If your change touches behaviour, cite the relevant spec section in the PR
  description (e.g. `core-app §3.6.4`), and update the spec in the same PR.
- Bump the relevant `package.json` version(s) in the same PR where required, with the version's section in that
  component's `CHANGELOG.md` when it is published (a test fails without it) —
  version-bump commit subjects use the same identifier as the release tag
  (`vX.Y.Z` for root, `<slug>-vX.Y.Z` for packages and apps). See the version
  bump conventions in [AGENTS.md](AGENTS.md).
- PRs into `develop` are merged with **rebase and merge** — no squash, no merge commits. The pull
  request that promotes `develop` into `main` is the one exception: it is merged with a merge commit (above).
- Fix commit messages before they reach `develop` (before the PR is merged, or before you push); correcting
  them after means rewriting `develop`, which is never done.

### Continuous integration

CI (`.github/workflows/ci.yml`) runs only for `main`: on pull requests targeting it that are not drafts (the
promotion from `develop`) and on every release tag. Not on a push to `main`, which changes only by merging a
promotion whose run already checked that merge result; after an emergency push that bypassed `main`'s protection,
run CI on `main` by hand. It does not run for `develop`, for feature
branches or for pull requests into `develop`, Dependabot's included, so runner time is not spent on every commit;
the pre-push hook checks your work locally, and **Actions → CI → Run workflow** checks any branch by hand when you
want the jobs the hook cannot run (the build, the database legs, the image, the acceptance suite) before the
promotion.

A first job, **Classify changes**, runs `scripts/ci-changes.ts` over the files the
pull request touches and decides which of the others run. A change to
documentation only (Markdown, `docs/`, `LICENSE`, `MANIFESTO`, the issue and pull
request templates) runs nothing else. A path the script does not recognise runs
the jobs rather than skip them, and a change to the CI definition itself runs
everything.

| Job               | Runs                                                                 |
| ----------------- | -------------------------------------------------------------------- |
| Format            | `pnpm format:check`                                                  |
| Lint              | `pnpm lint`                                                          |
| Typecheck         | `pnpm typecheck`                                                     |
| Test              | `pnpm test`                                                          |
| Build             | `pnpm build`                                                         |
| Database (3 legs) | `pnpm test:db` against sqld, a SQLite file and PostgreSQL            |
| Dependency audit  | `pnpm audit --audit-level=high`, when a manifest or lockfile changes |

CodeQL (`codeql.yml`) runs the same way (pushes to `main`, pull requests into `main` that are not drafts) and
weekly;
`dependency-audit.yml` repeats the audit against `main` weekly. Dependabot opens
weekly pull requests into `develop` for dependencies and for the pinned workflow actions.

**While a PR is a draft, all jobs are skipped** — marking it _Ready for review_
runs them. To skip CI on demand you have three options:

- keep the PR a **draft**;
- add the **`skip-ci` label** to the PR;
- put **`[skip ci]`** (or `[ci skip]`, `[no ci]`) in the head commit message.

Run the database legs locally with the same services: start sqld
(`ghcr.io/tursodatabase/libsql-server`, with `--enable-namespaces`) and/or
PostgreSQL, set `SV_DB_DIALECT` to `sqld`, `sqlite` or `postgres` and the matching
`SV_SQLD_URL` and `SV_SQLD_ADMIN_URL`, `SV_SQLITE_URL` or `SV_POSTGRES_URL`, then
run `pnpm test:db`. `ci.yml` shows the exact commands.

### Labels

The labels are in [`.github/labels.json`](.github/labels.json), and the **Labels** workflow
(`.github/workflows/labels.yml`) makes the repository match that file when it changes, and on demand
(**Actions → Labels → Run workflow**). It makes and changes labels and never deletes one. To add or change a
label, edit the file in a pull request. To check or apply it from your own machine:

```bash
GITHUB_TOKEN=$(gh auth token) node scripts/sync-labels.ts --repo OWNER/NAME --dry-run   # drop --dry-run to apply
```

The same file gives any other repository of the organisation the same labels.

| Label                                             | Use                                                                                |
| ------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `bug`, `enhancement`, `question`, `documentation` | What an issue or pull request is about. The issue forms add `bug` or `enhancement` |
| `needs-triage`                                    | New, and not yet looked at. The issue forms add it; take it off when someone has   |
| `discussion`                                      | No solution decided yet: open for design input before anything is built            |
| `deferred`                                        | Not for the current focus; to be revisited when higher-priority work is done       |
| `chore`, `ci`, `dx`                               | Maintenance, CI and workflow changes, and developer experience                     |
| `dependencies`                                    | Dependency updates. Dependabot adds it (and `ci` for workflow actions)             |
| `skip-ci`                                         | Skips CI on the pull request (above)                                               |
| `good first issue`, `help wanted`                 | For newcomers, and where help is wanted                                            |
| `duplicate`, `invalid`, `wontfix`                 | Why an issue or pull request was closed                                            |

---

## Proposing a feature (RFCs)

Have a feature request or an idea to improve Sovereign? Three paths,
depending on how fleshed-out it is:

- **Just an idea or a request?** Open a GitHub **issue / feature request**.
  That's the right place to float something, gather interest, and discuss
  whether it fits.
- **An open-ended question with no concrete proposal yet?** Write a **research
  doc** in [`docs/research/`](docs/research/) — findings, options, and a
  recommendation, without committing to a design. Not every research doc
  graduates to an RFC — a documented "not now" is a fine outcome.
- **Want to spell it out properly?** Write an **RFC** and open a pull request
  adding it to [`docs/rfcs/`](docs/rfcs/). This path is for proposals that need
  a detailed plan — a design, motivation, alternatives, and tradeoffs worth
  reviewing as a document. An accepted RFC becomes the reference the
  implementation follows, and its outcome is reflected in the spec.

A settled decision worth keeping on record — what was decided, why, and what
was rejected — is written as an ADR in [`docs/adrs/`](docs/adrs/).

---

## Contributor Licence Agreement

Before your first PR can be merged, you must agree to the Sovereign Contributor
Licence Agreement (CLA). The CLA covers both code and documentation
contributions and grants the project the right to distribute your work under
its current and future licences (including commercial use).

**How to sign:** Read this document in full, then tick the CLA checkbox in the
PR template when you open your pull request. That checkbox is your agreement —
no separate form or signature is required at this stage.
````
