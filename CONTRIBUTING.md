# Contributing to Sovereign

Thank you for your interest in contributing. This document covers everything
you need to get started.

## Contents

- [Development setup](#development-setup)
- [Branching and commits](#branching-and-commits)
- [Pull requests](#pull-requests)
- [Proposing a feature (RFCs)](#proposing-a-feature-rfcs)
- [Contributor Licence Agreement](#contributor-licence-agreement)
- [Building a plugin](#building-a-plugin)

---

## Development setup

**Requirements:** Node.js ≥20, pnpm 11.5.2, Git. Docker is optional but
recommended for running the full stack locally.

```bash
git clone https://github.com/sovereignfs/sovereign.git
cd Sovereign
pnpm install
cp .env.example .env   # fill in required values
pnpm generate          # builds runtime/generated/ from plugin manifests
pnpm dev               # starts runtime + auth server
```

Open `http://localhost:3000`. The first user to register is automatically
assigned `platform:admin`.

**Environment variables:** `AUTH_SECRET`, `SOVEREIGN_ADMIN_KEY`, and
`SOVEREIGN_AUTH_SECRET` have no defaults — the server will not start without
them. See `.env.example` for all required variables.

**Code quality hooks:** The pre-commit hook runs Prettier and ESLint on staged
files automatically. Run `pnpm format` and `pnpm lint` at any time to check
your working tree manually.

### Email in development

The mailer speaks plain SMTP, so to actually see the emails the app sends in
dev you point `SMTP_HOST` at a local catch-all server. With email **off**
(`SMTP_HOST` unset, the default) `send()` is a no-op and the app still runs.

We use [Mailpit](https://github.com/axllent/mailpit) — a tiny SMTP server with
a web inbox. Two ways to run it, both with SMTP on `1025` and the inbox on
`8025`:

- **Docker:** `docker compose up mailpit` (the service is in
  `docker-compose.yml`). In `.env` set `SMTP_HOST=mailpit` if the app also runs
  in Compose, or `SMTP_HOST=localhost` if you run it with `pnpm dev`.
- **Native (no Docker):** install the binary and run it —

  ```bash
  brew install mailpit   # or: go install github.com/axllent/mailpit@latest
  mailpit
  ```

  then set `SMTP_HOST=localhost` in `.env`.

Either way, open the inbox at **http://localhost:8025** and trigger a flow that
sends mail. For a zero-install option, nodemailer's
[Ethereal](https://ethereal.email/) test accounts print a preview URL per
message instead of using a local inbox.

### Running the tests

`pnpm test` runs the whole suite on **SQLite** with no external services — this
is what CI runs by default and what you should run before a PR.

**Test layout (RFC 0010):** Tests live in `__tests__/` subdirectories directly
inside the directory that contains the source they cover (e.g.
`packages/db/src/__tests__/client.test.ts` tests `packages/db/src/client.ts`).
The root `__tests__/integration/`, `__tests__/e2e/`, and `__tests__/visual/`
directories are reserved for future cross-service, browser-driven, and visual
tests respectively — they are empty scaffolds today.

Granular script variants:

```bash
pnpm test              # run the full suite (SQLite, no external services)
pnpm test:unit         # same with verbose per-test output
pnpm test:integration  # cross-service integration tests (root __tests__/integration/)
pnpm test:e2e          # end-to-end tests (root __tests__/e2e/)
```

The platform is dialect-agnostic (SQLite or Postgres, NFR-03), so there are also
**Postgres parity tests** (files named `*.pg.test.ts`). They are **skipped
unless** `TEST_DATABASE_URL` points at a Postgres instance, so the default run
stays Docker-free. To run them against a throwaway Postgres:

```bash
docker run -d --name sov-test-pg -e POSTGRES_PASSWORD=pw -e POSTGRES_DB=sov \
  -p 5432:5432 postgres:16-alpine
TEST_DATABASE_URL=postgres://postgres:pw@127.0.0.1:5432/sov pnpm test
docker rm -f sov-test-pg
```

These tests drop and recreate their own tables, so point them only at a
disposable database. CI runs them too — its `test` job starts a Postgres service
and sets `TEST_DATABASE_URL`, so the parity suites execute on every PR.

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

**Commit messages** should explain _why_, not just _what_. Keep the subject
line under 72 characters. Body lines wrap at 100 characters.

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
- If your change touches architecture or requirements, cite the relevant SRS
  section in the PR description (e.g. `SRS §3.6`, `PLT-02`).
- Bump the relevant `package.json` version(s) in the same PR where required
  — see the version bump conventions in `CLAUDE.md`.
- PRs are merged with **rebase and merge** — no squash, no merge commits.
- Fix commit messages before the PR is merged; correcting them after means
  rewriting `main`.

### Continuous integration

CI runs automatically on every pull request targeting `main`
(`.github/workflows/ci.yml`). There is no push-to-`main` trigger — `main` is
validated pre-merge by the PR. Six jobs run in parallel:

| Job                 | Checks                                                             |
| ------------------- | ------------------------------------------------------------------ |
| `format`            | `prettier --check`                                                 |
| `lint`              | ESLint (incl. the SDK import-boundary rule)                        |
| `typecheck`         | `tsc --noEmit` across the workspace                                |
| `generate-validate` | `pnpm generate` (manifest validation) + the generated registry TS  |
| `build`             | `turbo build` (production)                                         |
| `test`              | `vitest run` with a Postgres service (runs the `*.pg.test.ts` too) |

**While a PR is a draft, all jobs are skipped** — marking it _Ready for review_
runs them. To skip CI on demand you have three options:

- keep the PR a **draft**;
- add the **`skip-ci` label** to the PR (takes effect on the next push, since a
  label change alone does not re-trigger the workflow);
- put **`[skip ci]`** (or `[ci skip]`, `[no ci]`) in the head commit message.

---

## Proposing a feature (RFCs)

Have a feature request or an idea to improve Sovereign? Two paths, depending on how
fleshed-out it is:

- **Just an idea or a request?** Open a GitHub **issue / feature request**. That's
  the right place to float something, gather interest, and discuss whether it fits.
- **Want to spell it out properly?** Write an **RFC** and open a pull request adding
  it to [`docs/rfcs/`](docs/rfcs/). This path is for proposals that need a detailed
  plan — a design, motivation, alternatives, and tradeoffs worth reviewing as a
  document. An accepted RFC becomes the reference the implementation follows.

The two aren't exclusive: many RFCs start life as an issue and graduate to a written
proposal once the idea is worth detailing.

**Writing an RFC:**

1. Copy [`docs/rfcs/TEMPLATE.md`](docs/rfcs/TEMPLATE.md) to
   `docs/rfcs/NNNN-short-slug.md`, where `NNNN` is the next unused four-digit number
   (check the highest in the index — withdrawn numbers are not reused).
2. **Follow the same structure as the existing RFCs** — keep the template's section
   skeleton and frontmatter; [RFC 0008](docs/rfcs/0008-security-encryption-architecture.md)
   and [RFC 0013](docs/rfcs/0013-mobile-responsiveness-pwa.md) are good examples of
   the house style.
3. **Update the index** — add a row to [`docs/rfcs/README.md`](docs/rfcs/README.md)
   so your RFC shows up in the status-at-a-glance table.
4. Open the PR as a `docs/` change (`pnpm format` first — Prettier governs the
   markdown). New RFCs land as **Draft**; status changes as discussion concludes.

---

## Contributor Licence Agreement

Before your first PR can be merged, you must agree to the Sovereign
Contributor Licence Agreement (CLA). The CLA covers both code and
documentation contributions and grants the project the right to distribute
your work under its current and future licences (including commercial use).

**How to sign:** Read this document in full, then tick the CLA checkbox in
the PR template when you open your pull request. That checkbox is your
agreement — no separate form or signature is required at this stage.

---

## Building a plugin

Sovereign's plugin system is the core of the platform. If you want to build
a plugin rather than contribute to the runtime itself:

- See `docs/plugin-development.md` for the full plugin developer guide
  (available from v0.5).
- For the manifest reference and SDK surface, see
  `docs/sovereign-proposal-plan-srs.md` — Section 5 (manifest) and
  Section 3.6 (SDK).
- For design system usage (tokens and components), see
  `docs/design-system.md` (available from v0.3.07).

Third-party plugins may use any licence. They do not require a CLA unless
submitted to the official registry.

### Installing external plugins

The platform plugins (`console`, `launcher`, `account`) ship in this repo.
Sovereign/community plugins live in their own repositories and are pulled in
with `pnpm install:plugins`, which reads `sovereign.plugins.json` at the repo
root:

```json
{
  "plugins": [
    {
      "id": "fs.example.tasks",
      "repository": "https://github.com/your-org/sovereign-plugin-tasks"
    }
  ]
}
```

Each entry is shallow-cloned into `plugins/<id>/` (skipped if already present),
then `pnpm generate` composes it into the runtime. Cloned plugins are
gitignored — they are not committed to this repo. The shipped config has an
empty `plugins` list; add entries to install. An unreachable repository URL
fails the script with a clear error.

### Developing a plugin against a local Sovereign

You can develop a plugin that lives in **its own repository** while using a
local Sovereign checkout for hot-reload and the full dev experience. The
plugin directory under `plugins/` is gitignored by this repo (the allowlist
only keeps the platform plugins `console`/`launcher`/`account`), so it can be
its own independent Git repository with its own remote — Sovereign will never
try to commit or track it.

1. **Clone Sovereign and create your plugin directory.** Use your plugin's
   manifest `id` as the directory name:

   ```bash
   git clone https://github.com/sovereignfs/sovereign.git
   cd Sovereign
   mkdir -p plugins/fs.example.splitify
   ```

2. **Make it its own repository.** Initialise Git inside the plugin directory
   and point it at your remote (this repo is separate from Sovereign):

   ```bash
   cd plugins/fs.example.splitify
   git init && git remote add origin https://github.com/your-org/sovereign-plugin-splitify
   cd ../..
   ```

3. **Add the plugin's `manifest.json` and `package.json`.** Mirror an existing
   plugin (e.g. `plugins/launcher/`). A non-platform plugin's manifest
   **requires a `repository` field** (your plugin's GitHub URL) — `pnpm generate`
   validates the manifest at startup and fails loudly otherwise. Depend on
   `@sovereignfs/sdk` and `@sovereignfs/ui` only (the ESLint boundary rule
   enforces this); use `"workspace:*"` for them and `catalog:` for
   `next`/`react`.

4. **Link the workspace, then start dev.** `plugins/*` is a pnpm workspace
   glob, so a `pnpm install` links your plugin's workspace dependencies:

   ```bash
   pnpm install   # after adding package.json (re-run when deps change)
   pnpm dev
   ```

   `pnpm dev` runs the generate watcher, which composes `plugins/<id>/app/`
   into the runtime and **re-copies on every edit → Next hot-reloads**. Editing
   `@sovereignfs/sdk` or `@sovereignfs/ui` hot-reloads too (they compile from
   source via `transpilePackages`). If you add the plugin while `pnpm dev` is
   already running, restart it once so the newly-linked workspace deps resolve;
   after that, edits under `app/` reload without a restart.

You do **not** add a locally-developed plugin to `sovereign.plugins.json` —
that file is only for _cloning_ plugins you don't already have. Add an entry
there later so others can `pnpm install:plugins` your published repo.
