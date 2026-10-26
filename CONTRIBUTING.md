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

You need Node 24.15 or later (the exact version is in `.node-version`), pnpm 11,
and Docker (for the development sqld database).

The workspace, development server, test commands and seed data arrive with the
first tasks of the roadmap (0.1, 0.2 and 0.5); this section is filled in as they
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

CI runs automatically on every pull request targeting `main`. There is no
push-to-`main` trigger — `main` is validated pre-merge by the PR. The jobs (set
up by roadmap task 0.3) cover formatting, lint, typecheck, build, and tests on
each supported database.

**While a PR is a draft, all jobs are skipped** — marking it _Ready for review_
runs them. To skip CI on demand you have three options:

- keep the PR a **draft**;
- add the **`skip-ci` label** to the PR;
- put **`[skip ci]`** (or `[ci skip]`, `[no ci]`) in the head commit message.

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
