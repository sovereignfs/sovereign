# Contributing to Sovereign Core

Thank you for helping. This guide covers how work gets into `main`. Agents
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
git clone git@github.com:sovereignfs/sovereign-core.git
cd sovereign-core
pnpm install --frozen-lockfile   # also installs the pre-commit and pre-push hooks
pnpm verify:push                 # everything CI will check
```

The hooks run Prettier and ESLint on the files you commit and the full
`pnpm verify:push` before a push.

To run core, give it the two variables it cannot start without (`SV_URL` and
`SV_AUTH_SECRET`; the rules are in [`spec/env.md`](spec/env.md)):

```bash
cp apps/core/.env.example apps/core/.env.local
# set SV_AUTH_SECRET to the output of: openssl rand -base64 48
pnpm dev                         # http://localhost:3000, and /api/health
```

Without them core exits at start-up and says which are missing. The database
scripts and seed data arrive with tasks 0.5 and 1.2; this section grows as they
land.

---

## Branching and commits

Always branch from an up-to-date `main`:

```bash
git switch main && git pull
git switch -c feat/your-feature-name
```

**Branch prefixes:**

| Prefix   | Use for                                         |
| -------- | ----------------------------------------------- |
| `feat/`  | New features or capabilities                    |
| `fix/`   | Bug fixes                                       |
| `docs/`  | Documentation only                              |
| `chore/` | Tooling, scaffolding, dependencies, maintenance |

_(After v1.0.0, `main` becomes production and `dev` the integration branch.)_

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
- Bump the relevant `package.json` version(s) in the same PR where required —
  version-bump commit subjects use the same identifier as the release tag
  (`vX.Y.Z` for root, `<slug>-vX.Y.Z` for packages and apps). See the version
  bump conventions in [AGENTS.md](AGENTS.md).
- PRs are merged with **rebase and merge** — no squash, no merge commits.
- Fix commit messages before the PR is merged; correcting them after means
  rewriting `main`.

### Continuous integration

CI (`.github/workflows/ci.yml`) runs on every pull request targeting `main`, and
on demand: **Actions → CI → Run workflow** checks any branch, `main` included.
There is no push-to-`main` trigger — `main` is meant to be gated by the pull
request.

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

CodeQL (`codeql.yml`) also runs on pushes to `main`, on pull requests, and weekly;
`dependency-audit.yml` repeats the audit against `main` weekly. Dependabot opens
weekly pull requests for dependencies and for the pinned workflow actions.

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

---

## Proposing a feature (RFCs)

Have a feature request or an idea to improve Sovereign Core? Three paths,
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
