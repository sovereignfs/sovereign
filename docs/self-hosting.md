# Self-hosting Sovereign

Sovereign is designed to run on a single machine. Docker Compose is the
canonical deployment path — two containers (runtime + auth) on a shared
internal network, with the runtime exposed as the single public entry point.

---

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) with the Compose plugin (v2.20+)
- A domain name (or `localhost` for local-only use)
- An SMTP provider for email (optional — email is off by default)

---

## Quick start (local machine)

```bash
# 1. Clone
git clone https://github.com/sovereignfs/sovereign.git
cd Sovereign

# 2. Configure environment
cp .env.example .env
```

Open `.env` and set at minimum:

```env
# Required — generate a secret with: openssl rand -base64 32
AUTH_SECRET=your-secret-here

# The public URL users hit in their browser (no trailing slash)
NEXT_PUBLIC_RUNTIME_URL=http://localhost:3000
```

```bash
# 3. Start
docker compose up --build
```

The runtime is now at **http://localhost:3000**.

Open it in your browser — the first user to register automatically becomes the
platform admin. If `AUTH_INVITE_ONLY=true`, skip ahead to the
[invite-only](#invite-only-registration) section.

---

## Service topology

```
Browser → localhost:3000 (runtime)
                │
                └─ internal network ──► auth:3001  (auth server)
                                   ──► mailpit:1025 (dev email, SMTP)
```

The **auth server is not mapped to a host port** — it is only reachable on the
internal Docker network. The runtime is the single public entry point. In
production, place a reverse proxy (nginx, Caddy, Traefik) in front of the
runtime container.

---

## Environment variables

All variables live in a single `.env` at the repo root. Copy `.env.example`
to get started — every variable is documented there.

| Variable                    | Required | Default                      | Description                                                                                                                                                                                                                                                          |
| --------------------------- | -------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AUTH_SECRET`               | **yes**  | —                            | Signing secret for the auth server. The runtime also reads it to verify the session cookie locally (AUTH-05). Generate with `openssl rand -base64 32`. Never share or commit.                                                                                        |
| `SOVEREIGN_ADMIN_KEY`       | **yes**  | —                            | Shared secret for runtime↔auth internal admin API calls (Console user/plugin management). Generate with `openssl rand -base64 32`.                                                                                                                                   |
| `NEXT_PUBLIC_RUNTIME_URL`   | **yes**  | `http://localhost:3000`      | Public URL of the runtime — used by the auth server to redirect users after login.                                                                                                                                                                                   |
| `SOVEREIGN_AUTH_URL`        | no       | `http://localhost:3001`      | Where the runtime reaches the auth server for server-side API calls. Docker Compose sets it to the internal service name (`http://auth:3001`) automatically — only set it for non-Docker/native runs.                                                                |
| `SOVEREIGN_AUTH_PUBLIC_URL` | no       | `SOVEREIGN_AUTH_URL`         | Browser-facing base URL for auth redirects (login page). Needed when `SOVEREIGN_AUTH_URL` is an internal hostname the browser can't resolve (e.g. Docker's `http://auth:3001`). Set to the host-reachable URL such as `http://localhost:3001` or your public domain. |
| `AUTH_INVITE_ONLY`          | no       | `false`                      | When `true`, registration requires a valid invite token. The first user is exempt.                                                                                                                                                                                   |
| `AUTH_DATABASE_URL`         | no       | `file:./data/auth.db`        | Auth server database. SQLite file path (relative paths resolve against the repo root) or a `postgres://` URL.                                                                                                                                                        |
| `DATABASE_URL`              | no       | `file:./data/sovereign.db`   | Runtime database. SQLite file path (relative paths resolve against the repo root) or a `postgres://` URL.                                                                                                                                                            |
| `DB_DIALECT`                | no       | `sqlite`                     | Set to `postgres` when using PostgreSQL.                                                                                                                                                                                                                             |
| `SMTP_HOST`                 | no       | —                            | SMTP server host. Leave unset to disable email (the app still runs).                                                                                                                                                                                                 |
| `SMTP_PORT`                 | no       | `587`                        | SMTP port.                                                                                                                                                                                                                                                           |
| `SMTP_USER`                 | no       | —                            | SMTP username.                                                                                                                                                                                                                                                       |
| `SMTP_PASS`                 | no       | —                            | SMTP password.                                                                                                                                                                                                                                                       |
| `SMTP_FROM`                 | no       | —                            | Sender address, e.g. `Sovereign <noreply@example.com>`.                                                                                                                                                                                                              |
| `RUNTIME_PORT`              | no       | `3000` (dev) / `4000` (prod) | Host port the runtime container is mapped to.                                                                                                                                                                                                                        |
| `SOVEREIGN_AUTH_SECRET`     | no       | `AUTH_SECRET`                | Secret for local session verification (AUTH-05). Must equal the auth server's signing secret, so it defaults to `AUTH_SECRET` — set it only to run a deliberately distinct value.                                                                                    |
| `MAILPIT_SMTP_PORT`         | no       | `1025`                       | Dev only — host port for the Mailpit SMTP listener in `docker-compose.yml`.                                                                                                                                                                                          |
| `MAILPIT_UI_PORT`           | no       | `8025`                       | Dev only — host port for the Mailpit web inbox in `docker-compose.yml`.                                                                                                                                                                                              |

---

## Data persistence

SQLite databases and uploaded files live under `/app/data` inside both the
runtime and auth containers:

```
data/
  sovereign.db   # Runtime platform database
  auth.db        # Auth server identity database
  avatars/       # User avatar uploads (Task 0.4.06)
```

How that directory is persisted depends on the compose file:

- **Dev (`docker-compose.yml`)** — bind-mounted to the repo's `./data/`
  directory (the containers run as root, so host ownership is a non-issue).
  Back up by copying `./data/`.
- **Prod (`docker-compose.prod.yml`)** — a named Docker volume
  (`sovereign_data`). The production images run as a **non-root** user, and a
  named volume inherits the image's `/app/data` ownership, so writes work with
  zero host-side `chown`. Back up the volume with:

  ```bash
  docker run --rm -v sovereign_data:/data -v "$PWD":/backup alpine \
    tar czf /backup/sovereign-data.tgz -C /data .
  ```

---

## Production deployment

Use `docker-compose.prod.yml` for production. It differs from the dev file in
three ways: the runtime host port defaults to `4000`, both services restart
automatically on failure, and Mailpit is absent (configure real SMTP instead).

```bash
cp .env.example .env
# Edit .env — set AUTH_SECRET, NEXT_PUBLIC_RUNTIME_URL, SMTP_*, etc.

docker compose -f docker-compose.prod.yml up --build -d
```

### Reverse proxy

The auth server is internal-only. To make the login flow work end-to-end from
a browser, you need a reverse proxy that puts the runtime on your domain.
A minimal **Caddy** example:

```
your-domain.com {
    reverse_proxy localhost:4000
}
```

With Caddy in front, the runtime handles all public traffic (including
redirecting to the auth server's login page internally). TLS is handled by
Caddy automatically.

**TLS is required in production.** Sovereign sets `Strict-Transport-Security`
(HSTS) and other security headers on every response in production, and serves
session cookies with the `Secure` attribute — both assume HTTPS. Terminate TLS
at the reverse proxy and redirect HTTP → HTTPS. See
[security.md](security.md) for the full threat model and hardening checklist.

---

## PostgreSQL

SQLite is the zero-config default and is fine for personal and small-group use.
For larger or higher-concurrency deployments, run the whole stack on PostgreSQL
instead — the only change is the database connection (NFR-03), no application
code differs.

### Postgres over TLS

For any non-local Postgres, encrypt the connection by adding an `sslmode` query
parameter to `DATABASE_URL` / `AUTH_DATABASE_URL`:

- `?sslmode=require` — encrypt without verifying the server certificate.
- `?sslmode=verify-full` — encrypt **and** verify the certificate. Point the
  standard libpq `PGSSLROOTCERT` environment variable at a CA PEM file so the
  certificate can be validated.

Example: `postgres://user:pass@db.example.com:5432/sovereign?sslmode=verify-full`.
Without an `sslmode` (or with `sslmode=disable`) the connection is unencrypted —
only acceptable when the database is reached over a trusted local network.

### With Docker (recommended)

Layer the `docker-compose.postgres.yml` overlay on top of the production file. It
provisions a `postgres` service and points both the runtime and the auth server
at it:

```bash
cp .env.example .env
# Set AUTH_SECRET, SOVEREIGN_ADMIN_KEY, NEXT_PUBLIC_RUNTIME_URL, and at minimum
# POSTGRES_PASSWORD. POSTGRES_USER / POSTGRES_DB default to "sovereign".

docker compose -f docker-compose.prod.yml -f docker-compose.postgres.yml up --build -d
```

The runtime and auth server wait for Postgres to be healthy, then create their
tables on first start (better-auth's identity tables and the platform tables).
Postgres data lives in the `sovereign_pgdata` named volume; back it up with
`pg_dump`:

```bash
docker exec sovereign-postgres pg_dump -U sovereign sovereign > backup.sql
```

### Without Docker

Point all three database variables at your Postgres instance in `.env`:

```bash
DB_DIALECT=postgres
DATABASE_URL=postgres://user:pass@host:5432/sovereign
AUTH_DATABASE_URL=postgres://user:pass@host:5432/sovereign
```

The runtime and auth server can share one database (their table names don't
collide) or use separate ones.

### Switching SQLite → PostgreSQL

There is no automatic data migration. To move an existing instance:

1. Stop the stack (`docker compose ... down`, keeping volumes).
2. Stand up PostgreSQL and start the stack with the Postgres overlay once so the
   schema is created on the new database.
3. Copy your data across with a tool such as
   [pgloader](https://pgloader.io/) (pointed at the SQLite files under the
   `sovereign_data` volume), or re-enter it. Timestamps are stored as integers
   and booleans/`active` flags map directly, so a straight table copy works.
4. Verify login, Console access, and your plugins, then retire the SQLite files.

Uploaded files (avatars under `/app/data`) are independent of the database and
stay on the `sovereign_data` volume regardless of dialect.

---

## Email in development

The dev Compose file includes [Mailpit](https://mailpit.axllent.org/) — a
local SMTP server with a web inbox. It runs automatically alongside the other
services. No configuration needed:

- **SMTP:** `mailpit:1025` (internal) — already wired in the Compose file
- **Web inbox:** http://localhost:8025

To capture email when using `pnpm dev` (native, outside Docker):

```env
SMTP_HOST=localhost
SMTP_PORT=1025
```

Then start Mailpit separately:

```bash
# Docker (standalone)
docker run -p 1025:1025 -p 8025:8025 axllent/mailpit

# Or native binary — see https://mailpit.axllent.org/docs/install/
```

---

## Invite-only registration

When `AUTH_INVITE_ONLY=true`, only users with a valid invite token can
register. The first user is always exempt — they register normally and become
the platform admin.

After the first user registers, invite new users via the Console:
`/console/users/invite` (Task 0.4.02).

---

## Plugin compatibility

On every startup the runtime checks each installed plugin's
`compatibility.minPlatformVersion` against the running platform. If a plugin
requires a newer platform it is **automatically disabled** — the same as if you
had pressed Disable in Console — and a reason appears:

- **Console → Plugins** — the plugin row shows an "Incompatible" badge and the
  specific reason (e.g. "requires platform ≥ 0.8.0, running 0.7.0"). The Enable
  toggle is locked until the platform is upgraded.
- **Admin health endpoint** (`/api/admin/health` with your `SOVEREIGN_ADMIN_KEY`)
  — the `incompatiblePlugins` array lists every auto-disabled plugin and its
  reason.

An advisory warning (non-blocking) appears when the platform version exceeds the
plugin's optional `maxPlatformVersion`. The plugin keeps running; the warning is
a signal to test the plugin against the newer platform and publish an update.

---

## Upgrading

See the [upgrade guide](upgrade.md) for version-specific migration notes,
including platform-release notes and any required configuration changes.

The general upgrade process:

```bash
git pull
docker compose up --build -d   # or docker-compose.prod.yml for production
```

Migrations run automatically on startup.
