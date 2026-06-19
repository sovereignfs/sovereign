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

## Which Compose file to use

There are two Compose files — make sure you're using the right one:

| File                      | Command                                                   | Runtime port | Auth port | Use for                  |
| ------------------------- | --------------------------------------------------------- | ------------ | --------- | ------------------------ |
| `docker-compose.yml`      | `docker compose up --build`                               | **3000**     | **3001**  | Local development and QA |
| `docker-compose.prod.yml` | `docker compose -f docker-compose.prod.yml up --build -d` | **4000**     | **4001**  | Production deployments   |

Running `docker compose up --build` without `-f` always uses `docker-compose.yml`
(the dev file, ports 3000/3001). If you see 3000/3001 when you expected 4000/4001,
you are running the dev file.

---

## Quick start (local machine)

```bash
# 1. Clone
git clone https://github.com/sovereignfs/sovereign.git
cd Sovereign

# 2. Configure environment
cp .env.example .env
```

Open `.env` and set at minimum the two required secrets (both have no default —
the apps refuse to start without them):

```env
# Generate each with: openssl rand -base64 32
AUTH_SECRET=your-secret-here
SOVEREIGN_ADMIN_KEY=your-admin-key-here
```

Leave `NEXT_PUBLIC_RUNTIME_URL` and `SOVEREIGN_AUTH_URL` unset for local use — the
Compose files fill in the right host-reachable values per environment (dev →
:3000/:3001, prod → :4000/:4001). You only set `NEXT_PUBLIC_RUNTIME_URL` (and
`AUTH_BASE_URL`) for a real deployment, to your public domain.

```bash
# 3. Start (dev — ports 3000 / 3001)
docker compose up --build
```

The runtime is now at **http://localhost:3000**.

Open it in your browser — the first user to register automatically becomes the
platform admin. If `AUTH_INVITE_ONLY=true`, skip ahead to the
[invite-only](#invite-only-registration) section.

---

## Service topology

**Dev** (`docker-compose.yml`):

```
Browser → localhost:3000 (runtime)   localhost:3001 (auth — dev only)
                │                              │
                └─────── internal network ─────┘
                                   ──► mailpit:1025 (dev email, SMTP)
```

**Prod** (`docker-compose.prod.yml`):

```
Browser → localhost:4000 (runtime)   localhost:4001 (auth — for local QA)
                │                              │
                └─────── internal network ─────┘
```

Both the runtime and the auth server are mapped to host ports in both Compose
files. In production, place a reverse proxy (nginx, Caddy, Traefik) in front
of the runtime port only — auth should not be directly reachable from the
internet. Override `AUTH_PORT` and `RUNTIME_PORT` to use different host ports.

---

## Environment variables

All variables live in a single `.env` at the repo root. Copy `.env.example`
to get started — every variable is documented there.

| Variable                    | Required | Default                        | Description                                                                                                                                                                                                                                                                                                                                                                                                     |
| --------------------------- | -------- | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AUTH_SECRET`               | **yes**  | —                              | Signing secret for the auth server. The runtime also reads it to verify the session cookie locally (AUTH-05). Generate with `openssl rand -base64 32`. Never share or commit.                                                                                                                                                                                                                                   |
| `SOVEREIGN_ADMIN_KEY`       | **yes**  | —                              | Shared secret for runtime↔auth internal admin API calls (Console user/plugin management). Generate with `openssl rand -base64 32`.                                                                                                                                                                                                                                                                              |
| `NEXT_PUBLIC_RUNTIME_URL`   | no       | per env (dev :3000/prod :4000) | Browser-facing public URL of the runtime — the auth server redirects users here after login. The Compose files default it per environment (dev → `http://localhost:3000`, prod → `http://localhost:4000`); leave it unset locally. **Set it to your public domain (e.g. `https://example.com`) in a real deployment.** Read server-side at request time, so the container env is honoured (not baked at build). |
| `SOVEREIGN_AUTH_URL`        | no       | `http://localhost:3001`        | Where the runtime reaches the auth server for server-side API calls. Docker Compose sets it to the internal service name (`http://auth:3001`) automatically — only set it for non-Docker/native runs.                                                                                                                                                                                                           |
| `SOVEREIGN_AUTH_PUBLIC_URL` | no       | `SOVEREIGN_AUTH_URL`           | Browser-facing base URL for auth redirects (login page). Needed when `SOVEREIGN_AUTH_URL` is an internal hostname the browser can't resolve (e.g. Docker's `http://auth:3001`). Set to the host-reachable URL such as `http://localhost:3001` or your public domain.                                                                                                                                            |
| `AUTH_BASE_URL`             | no       | `http://localhost:3001`        | Public base URL of the auth server. Set to your public domain in production (e.g. `https://auth.example.com`). Used by better-auth for callback construction and CSRF origin validation.                                                                                                                                                                                                                        |
| `AUTH_TRUSTED_ORIGINS`      | no       | —                              | Comma-separated list of origins trusted for CSRF checks in addition to `AUTH_BASE_URL`. In Docker deployments, set to `http://auth:3001` so server-to-server calls from the runtime (avatar upload, password change) are accepted when `AUTH_BASE_URL` is your public domain.                                                                                                                                   |
| `AUTH_INVITE_ONLY`          | no       | `false`                        | When `true`, registration requires a valid invite token. The first user is exempt.                                                                                                                                                                                                                                                                                                                              |
| `AUTH_DATABASE_URL`         | no       | `file:./data/auth.db`          | Auth server database. SQLite file path (relative paths resolve against the repo root) or a `postgres://` URL.                                                                                                                                                                                                                                                                                                   |
| `DATABASE_URL`              | no       | `file:./data/sovereign.db`     | Runtime database. SQLite file path (relative paths resolve against the repo root) or a `postgres://` URL.                                                                                                                                                                                                                                                                                                       |
| `DB_DIALECT`                | no       | `sqlite`                       | Set to `postgres` when using PostgreSQL.                                                                                                                                                                                                                                                                                                                                                                        |
| `SMTP_HOST`                 | no       | —                              | SMTP server host. Leave unset to disable email (the app still runs).                                                                                                                                                                                                                                                                                                                                            |
| `SMTP_PORT`                 | no       | `587`                          | SMTP port.                                                                                                                                                                                                                                                                                                                                                                                                      |
| `SMTP_USER`                 | no       | —                              | SMTP username.                                                                                                                                                                                                                                                                                                                                                                                                  |
| `SMTP_PASS`                 | no       | —                              | SMTP password.                                                                                                                                                                                                                                                                                                                                                                                                  |
| `SMTP_FROM`                 | no       | —                              | Sender address, e.g. `Sovereign <noreply@example.com>`.                                                                                                                                                                                                                                                                                                                                                         |
| `RUNTIME_PORT`              | no       | `3000` (dev) / `4000` (prod)   | Host port the runtime container is mapped to.                                                                                                                                                                                                                                                                                                                                                                   |
| `AUTH_PORT`                 | no       | `3001` (dev) / `4001` (prod)   | Host port the auth container is mapped to.                                                                                                                                                                                                                                                                                                                                                                      |
| `SOVEREIGN_AUTH_SECRET`     | no       | `AUTH_SECRET`                  | Secret for local session verification (AUTH-05). Must equal the auth server's signing secret, so it defaults to `AUTH_SECRET` — set it only to run a deliberately distinct value.                                                                                                                                                                                                                               |
| `MAILPIT_SMTP_PORT`         | no       | `1025`                         | Dev only — host port for the Mailpit SMTP listener in `docker-compose.yml`.                                                                                                                                                                                                                                                                                                                                     |
| `MAILPIT_UI_PORT`           | no       | `8025`                         | Dev only — host port for the Mailpit web inbox in `docker-compose.yml`.                                                                                                                                                                                                                                                                                                                                         |

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

> **Important:** always pass `-f docker-compose.prod.yml` explicitly. Omitting
> it runs the dev file (`docker-compose.yml`) on ports 3000/3001.

`docker-compose.prod.yml` differs from the dev file in three ways: host ports
default to `4000` (runtime) and `4001` (auth), both services restart
automatically on failure, and Mailpit is absent (configure real SMTP instead).

```bash
cp .env.example .env
# Edit .env — set AUTH_SECRET and SOVEREIGN_ADMIN_KEY (required), plus SMTP_* and,
# for a real deployment, NEXT_PUBLIC_RUNTIME_URL + AUTH_BASE_URL (your domain).

# Prod — ports 4000 / 4001
docker compose -f docker-compose.prod.yml up --build -d
```

### Testing the production stack locally (no reverse proxy)

To smoke-test `docker-compose.prod.yml` on your own machine, just set the two
required secrets (`AUTH_SECRET`, `SOVEREIGN_ADMIN_KEY`) and leave the URL
variables unset. The prod Compose file defaults all the browser-facing URLs to
the mapped host ports, so the flow works end to end without a domain or proxy:

- `AUTH_BASE_URL` / `SOVEREIGN_AUTH_PUBLIC_URL` → `http://localhost:4001`
- `NEXT_PUBLIC_RUNTIME_URL` → `http://localhost:4000`

> **Important:** do not leave a hardcoded `NEXT_PUBLIC_RUNTIME_URL` or
> `SOVEREIGN_AUTH_URL` in `.env` (the dev `:3000`/`:3001` values from older
> setups). `.env` is shared by both Compose files, and a value set there
> overrides the per-environment defaults — so the prod stack would redirect to
> the dev port. `.env.example` leaves them commented for exactly this reason.

Then open <http://localhost:4000>. The runtime redirects you to
`http://localhost:4001/login` (reachable, **not** the internal `http://auth:3001`),
and after you sign in or register the auth server sends you back to
`http://localhost:4000`. In a real deployment behind a reverse proxy, set
`AUTH_BASE_URL` and `NEXT_PUBLIC_RUNTIME_URL` to your public domain(s).

### Reverse proxy

Place a reverse proxy in front of the runtime port (`4000`) only — the auth
port (`4001`) should not be directly reachable from the internet (it is
firewalled at the host or load balancer level). A minimal **Caddy** example:

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
# Set AUTH_SECRET and SOVEREIGN_ADMIN_KEY (required), and at minimum
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
