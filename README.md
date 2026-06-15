# Sovereign

Sovereign is a modular, self-hostable workspace runtime for running personal or
organisational software under one roof. It provides the shared platform pieces
applications need — authentication, data access, email, and UI — while allowing
installable plugins to run as first-class applications.

The plugin system is the core product. Sovereign acts as the host, giving each
plugin a place in the same workspace while sharing one login, one database, and
one design system. It is open source, privacy-first, and designed to be fully
owned by the person or organisation running it.

## Features

- **Plugin-first runtime** — plugins install into the platform as native
  applications with their own routes and a shared workspace shell.
- **One account, one workspace** — one account system, role-based administration,
  and a Console for managing users and installed plugins.
- **Self-hostable by default** — deploy on a single machine with Docker Compose,
  using SQLite by default or PostgreSQL when needed.
- **Privacy-first ownership** — run your own instance, control your own data,
  and keep the deployment scoped to the people who use it.
- **Developer-ready platform** — an installable PWA, typed SDK, and shared design
  system for building plugins that fit cleanly into the runtime.

## Quick start

Requirements: [Docker](https://docs.docker.com/get-docker/) with Compose, or
Node ≥20 + `pnpm` for local development.

### Run with Docker

```bash
git clone https://github.com/sovereignfs/sovereign.git
cd sovereign
cp .env.example .env          # set AUTH_SECRET, SOVEREIGN_ADMIN_KEY, NEXT_PUBLIC_RUNTIME_URL
docker compose up --build
```

Open http://localhost:3000 — the first user to register becomes the platform
admin. Full instructions, env vars, and production/Postgres setup are in
[docs/self-hosting.md](docs/self-hosting.md).

### Develop locally

```bash
pnpm install
cp .env.example .env          # fill in AUTH_SECRET + SOVEREIGN_ADMIN_KEY
pnpm dev                      # runtime on :3000, auth on :3001
```

The `sv` CLI wraps common tasks: `pnpm sv <command>` (`dev`, `build`, `generate`,
`plugin add/remove`, …).

## Monorepo layout

```
apps/auth/        better-auth identity server (the only separate Next.js app)
packages/
  sdk/            @sovereignfs/sdk — plugin↔platform contract (yet to be published)
  ui/             @sovereignfs/ui — design system (yet to be published)
  db/             Drizzle client factory + schema (SQLite/Postgres)
  manifest/       manifest schema + validation
  mailer/         SMTP abstraction
  tsconfig/       shared TypeScript configs
runtime/          the platform shell: middleware, plugin host, SDK bridge
plugins/          built-in platform plugins (console, launcher, account)
scripts/          install-plugins, generate-registry, dev orchestrator
bin/sv            the sv CLI
```

## Documentation

- [Self-hosting](docs/self-hosting.md) — deployment, configuration, operations,
  and production setup.
- [Plugin development](docs/plugin-development.md) — SDK usage, plugin structure,
  manifests, routing, and runtime integration.
- [Architecture](docs/architecture.md) — platform boundaries, package layout, and
  how the runtime, plugins, auth, and data layers connect.
- [Design system](docs/design-system.md) — shared UI tokens, components, and
  conventions for platform and plugin interfaces.
- [Upgrade guide](docs/upgrade.md) — versioned changes, migration notes, and
  compatibility guidance.
- [Contributing](CONTRIBUTING.md) — development workflow, project conventions,
  and contribution expectations.
- [Concept · Plan · SRS](docs/sovereign-proposal-plan-srs.md) and the
  [implementation task breakdown](docs/sovereign-implementation-tasks.md) —
  product specification, scope, and implementation roadmap.

## License

Sovereign is licensed under the GNU Affero General Public License v3.0 or later (AGPL-3.0-or-later).\
See [LICENSE](LICENSE) for the full text.
