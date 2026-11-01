# Sovereign

Sovereign is a self-hostable identity and foundation service, and the tools to run it. Anyone can
deploy **core**, its sign-in server, point any OpenID Connect application at it for sign-in, and keep
the accounts, the sign-in policy and the data on infrastructure they own. The operator toolkit, `sv`,
deploys core and the apps that sign in through it to one machine, and keeps them up to date, backed up
and restorable: see [Running an instance](docs/operating.md).

Core is deliberately **generic**: it knows about OAuth clients and, optionally,
a launcher entry for each one — never about a particular application. Apps live
in their own repositories and can run on their own, with their own database, or
alongside core as one suite.

> **Status: early development. Nothing is released yet.** Core, the operator toolkit, the SDK and the
> design system are built and tested, milestone by milestone, from the [roadmap](ROADMAP.md); the first
> release is next.

## What core does

Phase 1 of the MVP, specified in [`docs/specs/core-app.md`](docs/specs/core-app.md):

- **Accounts and sign-in** — email and password, passkeys and TOTP, email
  verification and password reset, with registration open or invite-only.
- **Roles you control** — `platform:owner`, `platform:admin` and `platform:user`,
  with a capability matrix the owner can edit.
- **A sign-in server for apps** — an OpenID Connect provider with consent,
  trusted clients, refresh-token rotation, sign-out and back-channel logout.
- **App registration and a launcher** — operators register apps in the Console;
  signed-in people see them on a launcher page.
- **A Directory API** — apps can find accounts to share with, without exposing
  the list of users.
- **Self-hostable** — runs on sqld, PostgreSQL or a SQLite file, configured with
  environment variables, with secrets that never have defaults.

Later phases add mail, notifications and activity services for apps, backups,
and more. The spec lists what is in and out of each phase.

## Repository layout

| Path                  | What                                                            | State                                       |
| --------------------- | --------------------------------------------------------------- | ------------------------------------------- |
| `apps/core`           | Core: the sign-in server, Console and launcher                  | Built, with Phase 1 acceptance (`apps/e2e`) |
| `tools/cli`           | The operator toolkit, `sv`, and the image the server runs it in | Built, not published yet                    |
| `tools/create`        | `npm create @sovereignfs`: an instance, or an app               | Built, not published yet                    |
| `packages/tsconfig`   | Shared TypeScript configuration                                 | In the workspace                            |
| `packages/ui`         | The design system, `@sovereignfs/ui`                            | Published                                   |
| `packages/bridge`     | The device bridge, `@sovereignfs/bridge`                        | In the workspace                            |
| `packages/mailer`     | Mail delivery                                                   | In the workspace                            |
| `packages/config`     | The environment convention and start-up validation              | In the workspace                            |
| `packages/database`   | One interface over sqld, PostgreSQL and a SQLite file           | In the workspace                            |
| `packages/crypto`     | Field encryption with a key ring (end-to-end later)             | In the workspace                            |
| `packages/api-client` | The typed Core API client, generated from the contract          | In the workspace                            |
| `packages/sdk`        | The SDK: sign-in, tokens, failure and version support for apps  | In the workspace, not published yet         |
| `packages/*` (later)  | `auth`, …                                                       | Planned                                     |
| `contracts/`          | The Core API, the file formats and the environment convention   | Written                                     |
| `docs/`               | The spec, epics, research, RFCs and decisions                   | [Index below](#documentation)               |
| `scripts/`            | Repository tooling and the tests that guard the repo's rules    | In use                                      |

## Getting started

You need Node 24.15 or later (`.node-version` pins the exact version), pnpm 11,
and Docker (for the development database and the image).

```bash
git clone git@github.com:sovereignfs/sovereign.git
cd sovereign
pnpm install --frozen-lockfile   # also installs the pre-commit and pre-push hooks
pnpm verify:push                 # format, lint, typecheck, design tokens, doc links and tests
```

To run core from a published image on sqld, PostgreSQL or a SQLite file, see
[`docs/deploying.md`](docs/deploying.md). To work on it, `pnpm dev` starts the server (and sqld, when the
environment chooses it) and `pnpm seed` makes local accounts.

[`CONTRIBUTING.md`](CONTRIBUTING.md) has the branching, commit and pull request
rules; [`AGENTS.md`](AGENTS.md) has the same conventions written for AI agents.

## Documentation

- [`docs/specs/core-app.md`](docs/specs/core-app.md) — what the core app must
  do, phase by phase. The source of truth: where code, epics and issues
  disagree with it, it wins until it is changed.
- [`ROADMAP.md`](ROADMAP.md) and [`docs/epics/`](docs/epics/) — the ordered
  task list and the detail of each task.
- [`docs/operating.md`](docs/operating.md) — running an instance with the toolkit: from an
  empty folder to two apps, updating, backing up, and putting a failed deployment right.
- [`docs/specs/operator-cli.md`](docs/specs/operator-cli.md) — what the toolkit does.
- [`docs/deploying.md`](docs/deploying.md) — running core alone: the image, the three
  databases, the address it must reach, backing up and upgrading.
- [`docs/releasing.md`](docs/releasing.md) — what is published, and how a release is made.
- [`docs/connecting-an-app.md`](docs/connecting-an-app.md) and
  [`docs/using-the-sdk.md`](docs/using-the-sdk.md) — connecting any app to core,
  and a JavaScript app's way to sign people in and call it.
- [`docs/development-workflow.md`](docs/development-workflow.md) — how a task
  is started, built and finished.
- [`docs/architecture-rules.md`](docs/architecture-rules.md) — the hard rules,
  with the reason behind each.
- [`docs/design-system.md`](docs/design-system.md) — the `@sovereignfs/ui` model.
- [`docs/research/`](docs/research/), [`docs/rfcs/`](docs/rfcs/) and
  [`docs/adrs/`](docs/adrs/) — explorations, proposals and settled decisions.
- [`MANIFESTO`](MANIFESTO) — why the project exists.

## Licence

| Path                        | Licence                                         |
| --------------------------- | ----------------------------------------------- |
| `apps/core`                 | [AGPL-3.0-or-later](LICENSE)                    |
| `tools/cli`, `tools/create` | [AGPL-3.0-or-later](LICENSE)                    |
| `packages/*`                | MPL-2.0, so apps under any licence can use them |

Each package declares MPL-2.0 in its `package.json` and carries the licence text in its own
`LICENSE`; a test keeps them in agreement. The `LICENSE` at the root is the AGPL text. The design
system also keeps a `NOTICE` for the icons derived from Lucide (ISC). Publishing to npm is in
[`docs/releasing.md`](docs/releasing.md).

## Security

Please report vulnerabilities privately; see [`SECURITY.md`](SECURITY.md).
