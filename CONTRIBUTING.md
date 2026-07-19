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

**Requirements:** Node.js 24.x, pnpm 11.5.2, Git. Docker is optional but
recommended for running the full stack locally.

```bash
git clone https://github.com/sovereignfs/sovereign.git
cd Sovereign
pnpm install
cp .env.example .env   # fill in required values
pnpm generate          # builds runtime/generated/ from plugin manifests (gitignored — regenerate anytime, never commit)
pnpm dev               # starts runtime + auth server
```

Open `http://localhost:3000`. The first user to register is automatically
assigned `platform:owner`.

**After the first `pnpm install`, prefer `pnpm install --frozen-lockfile`**
for routine installs (e.g. after `git pull`) — it installs exactly what
`pnpm-lock.yaml` already specifies instead of re-resolving the whole
dependency graph. A bare `pnpm install` can pick up a newer version of some
unpinned transitive dependency and rewrite large parts of the lockfile,
producing a diff unrelated to whatever you were actually working on. Only
run a bare `pnpm install` when you're intentionally adding, removing, or
bumping a dependency — the resulting lockfile diff should be scoped to
that change and included in the same commit.

**Exception — `.local` plugins:** after cloning one (via `pnpm install:plugins`,
`./setup.sh`, or a manual clone into `plugins/<name>.local`), `--frozen-lockfile`
will always fail: the plugin becomes a new workspace project with dependencies
the committed lockfile has never resolved, and since `.local` plugins are
gitignored by design they never enter the committed lockfile. This is expected,
not drift. Run a bare `pnpm install` once to pick up its deps locally, and don't
commit the resulting `pnpm-lock.yaml` diff for the `.local` plugin's entries —
check `git diff pnpm-lock.yaml` before committing anything else.

**Environment variables:** `AUTH_SECRET`, `SOVEREIGN_ADMIN_KEY`, and
`SOVEREIGN_AUTH_SECRET` have no defaults — the server will not start without
them. See `.env.example` for all required variables.

**Full Docker stack:** To run the containerised stack for local QA (not for
active code development — use `pnpm dev` for that):

```bash
docker compose up --build
```

The runtime is exposed on `:3000` and the auth server on `:3001`. In Compose,
the runtime reaches auth internally via `http://auth:3001`, but browser
redirects (login page) use `SOVEREIGN_AUTH_PUBLIC_URL` (defaults to
`http://localhost:3001`), which is the host-reachable address. If you change
the auth host port with `AUTH_PORT=`, set `SOVEREIGN_AUTH_PUBLIC_URL`
accordingly in your `.env`.

**Code quality hooks:** The pre-commit hook runs Prettier and ESLint on staged
files automatically. The pre-push hook runs `pnpm verify:push`, which checks
formatting, lint, typecheck, and the Vitest suite before pushing. Run
`pnpm format`, `pnpm lint`, `pnpm typecheck`, or `pnpm test` at any time to
check your working tree manually.

`pnpm test:e2e` remains manual. Run it before pushing when a change touches
browser-facing flows, auth, middleware, platform plugins, or the Playwright
harness.

For a small docs-only or work-in-progress push where you intentionally want to
skip the pre-push hook, use Git's standard bypass flag:

```bash
git push --no-verify origin <branch>
```

### Dev database seed

`sv seed` inserts two known-password test users into the auth database so you
can sign in immediately without registering manually:

| Email                   | Password             | Role             |
| ----------------------- | -------------------- | ---------------- |
| `admin@sovereign.local` | `admin-dev-password` | `platform:owner` |
| `user@sovereign.local`  | `user-dev-password`  | `platform:user`  |

```bash
pnpm sv seed
```

The seed is **idempotent** — running it twice is safe (existing rows are left
untouched). It is hard-blocked in production (`NODE_ENV=production`) unless
`SOVEREIGN_SEED_ALLOW_PROD=true` is set on a throwaway test database.

The seed also ensures the platform database is bootstrapped (tenant row, plugin
status table, etc.), so it works on a fresh checkout before `pnpm dev` has ever
run.

### Email in development

We use [Mailpit](https://github.com/axllent/mailpit) — a tiny SMTP server with
a web inbox — to capture outbound email locally.

**In `pnpm dev` (native), no configuration is needed.** When `SMTP_HOST` is
unset, the mailer automatically falls back to `localhost:1025` in non-production
environments. Start Mailpit and emails appear in its inbox immediately:

```bash
# Docker (standalone)
docker run -p 1025:1025 -p 8025:8025 axllent/mailpit

# Native binary
brew install mailpit   # or: go install github.com/axllent/mailpit@latest
mailpit
```

Then open **http://localhost:8025** and trigger any email flow (invite, forgot
password, etc.) — the mail will appear without any `.env` changes.

**In Docker Compose**, Mailpit runs automatically as part of the stack. Add
`SMTP_HOST=mailpit` to `.env` to route the app (running inside Compose) to it:

```env
SMTP_HOST=mailpit   # the Docker service name; omit for pnpm dev
```

In production, with `SMTP_HOST` unset, the mailer is a graceful no-op — the
app still starts and runs; email features (invites, password reset) are simply
skipped.

### Running the tests

`pnpm test` runs the Vitest suite. In a default local checkout this uses SQLite
and no external services; in CI the same command also receives
`TEST_DATABASE_URL`, so the Postgres parity tests run instead of being skipped.
Run it before a PR.

**Test layout (RFC 0010):** Tests live in `__tests__/` subdirectories directly
inside the directory that contains the source they cover (e.g.
`packages/db/src/__tests__/client.test.ts` tests `packages/db/src/client.ts`).

| Scope                              | Location / pattern                                | Command                               | Notes                                                                                                                                                                                                    |
| ---------------------------------- | ------------------------------------------------- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vitest unit/component tests        | Package/app/source `__tests__/**/*.test.{ts,tsx}` | `pnpm test`                           | Default environment is Node. Component tests opt into jsdom with `// @vitest-environment jsdom`.                                                                                                         |
| Root fixture and integration tests | `__tests__/**/*.test.{ts,tsx}`                    | `pnpm test` / `pnpm test:integration` | `pnpm test:integration` currently targets `__tests__/integration` and passes when no cross-service integration specs exist.                                                                              |
| Playwright E2E tests               | `__tests__/e2e/**/*.spec.ts`                      | `pnpm test:e2e`                       | Starts auth and runtime via Playwright unless local dev servers are already running; global setup runs `pnpm sv seed` and writes `.auth/` storage state.                                                 |
| Postgres parity tests              | Package-local `*.pg.test.ts` files                | `TEST_DATABASE_URL=... pnpm test`     | Skipped unless `TEST_DATABASE_URL` points at a disposable Postgres database. These tests may drop/recreate their own tables.                                                                             |
| Generated plugin route copies      | `runtime/app/**` generated by `pnpm generate`     | Not directly discovered               | Vitest includes source-owned paths such as `runtime/src/**` and `plugins/**`, so generated copies under `runtime/app` are not double-run. The source of truth remains each plugin's own `plugins/*/app`. |

Granular script variants:

```bash
pnpm test              # run Vitest tests; local default is SQLite, no external services
pnpm test:unit         # same Vitest suite with verbose per-test output
pnpm test:integration  # cross-service integration tests (root __tests__/integration/)
pnpm test:e2e          # Playwright end-to-end tests (root __tests__/e2e/)
pnpm test:all          # Vitest, root integration target, then Playwright
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

### Real-device PWA testing before deploy

Browser mobile emulation is useful for layout checks, but it is not equivalent
to an installed PWA on iPhone or Android. For PWA-sensitive changes, test a
production build over HTTPS on a real device before deploying.

Use [`docs/pwa-real-device-testing.md`](docs/pwa-real-device-testing.md) for the
agent-assisted workflow, local network vs HTTPS tunnel tradeoffs, auth URL
checks, device checklist, and iPhone cache reset steps.

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
  — version-bump commit subjects use the same identifier as the release tag
  (`vX.Y.Z` for root, `<slug>-vX.Y.Z` for packages/apps/plugins). See the
  version bump conventions in `CLAUDE.md`.
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
- add the **`skip-ci` label** to the PR;
- put **`[skip ci]`** (or `[ci skip]`, `[no ci]`) in the head commit message.

---

## Publishing a package

Three packages are published to npm from this monorepo. Each has an
independent release cycle triggered by a version-specific Git tag. Use the same
identifier as the version-bump commit subject:

| Package                      | Tag pattern            | Trigger command example        |
| ---------------------------- | ---------------------- | ------------------------------ |
| `@sovereignfs/sdk`           | `sdk-vX.Y.Z`           | `git tag sdk-v1.3.1`           |
| `@sovereignfs/ui`            | `ui-vX.Y.Z`            | `git tag ui-v0.5.1`            |
| `@sovereignfs/create-plugin` | `create-plugin-vX.Y.Z` | `git tag create-plugin-v0.1.0` |

**Steps:**

1. Bump the version in the package's `package.json` and update its
   `CHANGELOG.md` in a PR (the version bump is part of the feature/fix PR,
   not a separate one).
2. Once the PR is merged, tag the resulting commit on `main` and push the tag:
   ```bash
   git tag <tag>
   git push origin <tag>
   ```
3. `.github/workflows/publish.yml` picks up the tag, re-runs the full CI suite
   (via `workflow_call`), then builds and publishes the package using the
   `NPM_TOKEN` repository secret. The publish step uses `pnpm publish
--no-git-checks --access public`, so it rejects the tag if the version
   is already on npm (protection against accidental re-publishes).

Root platform releases use plain `vX.Y.Z`. Other package/app/plugin tags use
the same `<slug>-vX.Y.Z` pattern. Packages marked `"private": true` are not
published to npm unless a future workflow explicitly makes them publishable.

## Deploying hosted sites

Two sites are deployed via tag push rather than on every merge to `main`, to
avoid burning CI minutes on incremental changes:

| Site                                  | Tag pattern | Workflow                | Trigger command example                            |
| ------------------------------------- | ----------- | ----------------------- | -------------------------------------------------- |
| [sovereignfs.github.io][docs-site]    | `docs-v*`   | `docs.yml` (deploy job) | `git tag docs-v1.0 && git push origin docs-v1.0`   |
| [sovereignfs.github.io/storybook][sb] | `sb-v*`     | `storybook-deploy.yml`  | `git tag sb-v0.11.0 && git push origin sb-v0.11.0` |

[docs-site]: https://sovereignfs.github.io/
[sb]: https://sovereignfs.github.io/storybook/

Both workflows also support **manual re-deploys** via **Actions → [workflow name] →
Run workflow** without needing to push a tag.

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

### Cloning your own plugins with `setup.sh`

`sovereign.plugins.json` is committed and shared. If instead you want to clone
plugin repositories **you** are developing against this checkout — without
declaring them anywhere in the codebase — use `./setup.sh`. It reads a personal,
**git-ignored** list at the repo root, `sovereign.plugins.local`, and clones
each entry into `plugins/<name>.local` (the project's `.local` convention;
see `docs/plugin-development.md`).

Create `sovereign.plugins.local` (it does not exist by default) with one git URL
per line:

```text
# Plugins I'm actively developing
git@github.com:me/sovereign-tasks.git      # → plugins/sovereign-tasks.local
notes git@github.com:me/plugin-notes.git   # explicit name → plugins/notes.local
```

- Blank lines and `#` comments (whole-line or trailing) are ignored.
- `<git-url>` clones to `plugins/<repo-name>.local`; prefix `<name> <git-url>`
  to choose the directory name explicitly.

Then:

```bash
./setup.sh     # clones each entry into plugins/<name>.local (skips existing)
pnpm install   # links the newly cloned workspace deps
pnpm dev       # composes them into the runtime
```

If `sovereign.plugins.local` is absent, `setup.sh` skips this step with a
one-line note. Unlike `sovereign.plugins.json`, this file is yours alone: it is
never committed and no code references it, so the specific plugins you clone stay
private to your machine.

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
