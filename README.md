# Sovereign

Sovereign is a modular, self-hostable workspace runtime: a shared platform
foundation — authentication, data access, email, and shared UI — on top of which
installable plugins run as first-class applications. It is open source,
privacy-first, and designed to be owned entirely by the person or organisation
running it.

The plugin system _is_ the product: the platform is a host, and apps
(task managers, expense splitters, writing tools, …) install into it as plugins
that share one login, one database, and one design system.

## Features

- **Plugin-first** — native Next.js plugins compose into the runtime at build
  time and serve under their own URL prefix, inside the platform shell.
- **One account, one workspace** — shared auth (better-auth), role-based admin,
  and a Console for managing users and plugins.
- **Self-hostable** — single-machine Docker Compose deployment; SQLite by
  default, PostgreSQL via env.
- **Privacy-first & single-tenant** — your instance, your data; `tenant_id` is
  carried from day one for a future multi-tenant path.
- **Installable PWA** and a typed SDK (`@sovereignfs/sdk`) + design system
  (`@sovereignfs/ui`) published for plugin developers.

## Quick start

Requirements: [Docker](https://docs.docker.com/get-docker/) with Compose, or
Node ≥20 + pnpm for local development.

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
  sdk/            @sovereignfs/sdk — plugin↔platform contract (published)
  ui/             @sovereignfs/ui — design system (published)
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

- [Self-hosting](docs/self-hosting.md) — deploy and operate an instance.
- [Plugin development](docs/plugin-development.md) — build a plugin on the SDK.
- [Architecture](docs/architecture.md) — how the platform fits together.
- [Design system](docs/design-system.md) — `@sovereignfs/ui` tokens and
  components.
- [Upgrade guide](docs/upgrade.md) — versioned migration notes.
- [Contributing](CONTRIBUTING.md) — workflow and conventions.
- [Concept · Plan · SRS](docs/sovereign-proposal-plan-srs.md) and the
  [implementation task breakdown](docs/sovereign-implementation-tasks.md) — the
  authoritative specification and build plan.

## License

Sovereign is licensed under the GNU Affero General Public License v3.0 or later
(AGPL-3.0-or-later). See [LICENSE](LICENSE) for the full text.
