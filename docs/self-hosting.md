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

| Variable                     | Required | Default                                             | Description                                                                                                                                                                                                                                                                                                                                                                                                     |
| ---------------------------- | -------- | --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AUTH_SECRET`                | **yes**  | —                                                   | Signing secret for the auth server. The runtime also reads it to verify the session cookie locally (AUTH-05). Generate with `openssl rand -base64 32`. Never share or commit.                                                                                                                                                                                                                                   |
| `SOVEREIGN_ADMIN_KEY`        | **yes**  | —                                                   | Shared secret for runtime↔auth internal admin API calls (Console user/plugin management). Generate with `openssl rand -base64 32`.                                                                                                                                                                                                                                                                              |
| `NEXT_PUBLIC_RUNTIME_URL`    | no       | per env (dev :3000/prod :4000)                      | Browser-facing public URL of the runtime — the auth server redirects users here after login. The Compose files default it per environment (dev → `http://localhost:3000`, prod → `http://localhost:4000`); leave it unset locally. **Set it to your public domain (e.g. `https://example.com`) in a real deployment.** Read server-side at request time, so the container env is honoured (not baked at build). |
| `SOVEREIGN_AUTH_URL`         | no       | `http://localhost:3001`                             | Where the runtime reaches the auth server for server-side API calls. Docker Compose sets it to the internal service name (`http://auth:3001`) automatically — only set it for non-Docker/native runs.                                                                                                                                                                                                           |
| `SOVEREIGN_AUTH_PUBLIC_URL`  | no       | `SOVEREIGN_AUTH_URL`                                | Browser-facing base URL for auth redirects (login page). Needed when `SOVEREIGN_AUTH_URL` is an internal hostname the browser can't resolve (e.g. Docker's `http://auth:3001`). Set to the host-reachable URL such as `http://localhost:3001` or your public domain.                                                                                                                                            |
| `AUTH_BASE_URL`              | no       | `http://localhost:3001`                             | Public base URL of the auth server. Set to your public domain in production (e.g. `https://auth.example.com`). Used by better-auth for callback construction and CSRF origin validation.                                                                                                                                                                                                                        |
| `AUTH_TRUSTED_ORIGINS`       | no       | —                                                   | Comma-separated list of origins trusted for CSRF checks in addition to `AUTH_BASE_URL`. In Docker deployments, set to `http://auth:3001` so server-to-server calls from the runtime (avatar upload, password change) are accepted when `AUTH_BASE_URL` is your public domain.                                                                                                                                   |
| `AUTH_WEBAUTHN_RP_ID`        | no       | hostname of `AUTH_BASE_URL`                         | WebAuthn relying-party ID for passkey registration and sign-in (RFC 0012). Must be a registrable domain suffix shared by the auth server and the runtime origin. Keep as `localhost` for local dev. In production, set to your bare domain (e.g. `example.com`).                                                                                                                                                |
| `AUTH_WEBAUTHN_RP_NAME`      | no       | `Sovereign`                                         | Human-readable name shown in the browser's passkey prompt.                                                                                                                                                                                                                                                                                                                                                      |
| `AUTH_WEBAUTHN_ORIGIN`       | no       | `NEXT_PUBLIC_RUNTIME_URL,SOVEREIGN_AUTH_PUBLIC_URL` | Comma-separated list of WebAuthn origins allowed during credential verification. Must include **both** the runtime origin (passkey management goes through the runtime proxy) and the auth server's public origin (passkey sign-in happens on the login page). Defaults to `http://localhost:3000,http://localhost:3001` in dev. In production set to e.g. `https://example.com,https://auth.example.com`.      |
| `AUTH_INVITE_ONLY`           | no       | `false`                                             | When `true`, registration requires a valid invite token. The first user is exempt.                                                                                                                                                                                                                                                                                                                              |
| `AUTH_DATABASE_URL`          | no       | `file:./data/auth.db`                               | Auth server database. SQLite file path (relative paths resolve against the repo root) or a `postgres://` URL.                                                                                                                                                                                                                                                                                                   |
| `DATABASE_URL`               | no       | `file:./data/sovereign.db`                          | Runtime database. SQLite file path (relative paths resolve against the repo root) or a `postgres://` URL.                                                                                                                                                                                                                                                                                                       |
| `DB_DIALECT`                 | no       | `sqlite`                                            | Set to `postgres` when using PostgreSQL.                                                                                                                                                                                                                                                                                                                                                                        |
| `PGSSLROOTCERT`              | no       | —                                                   | Path to a CA PEM file for Postgres TLS certificate verification. Only meaningful when `DATABASE_URL` / `AUTH_DATABASE_URL` includes `sslmode=verify-full`. Follows the standard libpq convention (same env var accepted by `psql` and `pg_dump`).                                                                                                                                                               |
| `SMTP_HOST`                  | no       | —                                                   | SMTP server host. Leave unset to disable email (the app still runs).                                                                                                                                                                                                                                                                                                                                            |
| `SMTP_PORT`                  | no       | `587`                                               | SMTP port.                                                                                                                                                                                                                                                                                                                                                                                                      |
| `SMTP_USER`                  | no       | —                                                   | SMTP username.                                                                                                                                                                                                                                                                                                                                                                                                  |
| `SMTP_PASS`                  | no       | —                                                   | SMTP password.                                                                                                                                                                                                                                                                                                                                                                                                  |
| `SMTP_FROM`                  | no       | —                                                   | Sender address, e.g. `Sovereign <noreply@example.com>`.                                                                                                                                                                                                                                                                                                                                                         |
| `RUNTIME_PORT`               | no       | `3000` (dev) / `4000` (prod)                        | Host port the runtime container is mapped to.                                                                                                                                                                                                                                                                                                                                                                   |
| `AUTH_PORT`                  | no       | `3001` (dev) / `4001` (prod)                        | Host port the auth container is mapped to.                                                                                                                                                                                                                                                                                                                                                                      |
| `SOVEREIGN_AUTH_SECRET`      | no       | `AUTH_SECRET`                                       | Secret for local session verification (AUTH-05). Must equal the auth server's signing secret, so it defaults to `AUTH_SECRET` — set it only to run a deliberately distinct value.                                                                                                                                                                                                                               |
| `MAILPIT_SMTP_PORT`          | no       | `1025`                                              | Dev only — host port for the Mailpit SMTP listener in `docker-compose.yml`.                                                                                                                                                                                                                                                                                                                                     |
| `MAILPIT_UI_PORT`            | no       | `8025`                                              | Dev only — host port for the Mailpit web inbox in `docker-compose.yml`.                                                                                                                                                                                                                                                                                                                                         |
| `VAPID_PUBLIC_KEY`           | no       | —                                                   | VAPID public key (base64url) for Web Push (RFC 0016). Leave unset to disable push — the in-app bell is the fallback. Generate with `npx web-push generate-vapid-keys`.                                                                                                                                                                                                                                          |
| `VAPID_PRIVATE_KEY`          | no       | —                                                   | VAPID private key (base64url). Must pair with `VAPID_PUBLIC_KEY`. Keep secret — treat it like `AUTH_SECRET`.                                                                                                                                                                                                                                                                                                    |
| `VAPID_CONTACT`              | no       | `mailto:admin@localhost`                            | Contact URI sent in the VAPID `Authorization` header (required by spec). Use your admin email, e.g. `mailto:ops@example.com`.                                                                                                                                                                                                                                                                                   |
| `LOG_LEVEL`                  | no       | `warn`                                              | Structured log verbosity: `error` \| `warn` \| `info` \| `debug`. Logs go to stdout/stderr only — nothing egresses (see [Security](security.md#logging-and-telemetry)).                                                                                                                                                                                                                                         |
| `SOVEREIGN_DEV_MODE_ENABLED` | no       | —                                                   | Set to `true` to enable production dev-mode (RFC 0020). When unset the feature does not exist and the dev-mode secret header is ignored entirely.                                                                                                                                                                                                                                                               |
| `SOVEREIGN_DEV_MODE_SECRET`  | no       | `SOVEREIGN_ADMIN_KEY`                               | Secret callers supply in `X-Sovereign-Dev-Mode-Secret` to activate dev-mode on a request. Defaults to `SOVEREIGN_ADMIN_KEY` when unset. Set explicitly in production.                                                                                                                                                                                                                                           |
| `SOVEREIGN_DEV_DATABASE_URL` | no       | —                                                   | URL of the mock database populated by `sv seed`. Dev-mode requests resolve all platform DB reads/writes to this database. Must be a separate file/schema from `DATABASE_URL`. Example: `file:./data/sovereign-dev.db`.                                                                                                                                                                                          |
| `BRAND_NAME`                 | no       | `Sovereign`                                         | Display name of the instance. Appears in the runtime shell header, the auth server login page title and heading, and outbound email. Read server-side at request time (not baked at build). Overridable per tenant in Console → Settings → Branding.                                                                                                                                                            |
| `BRAND_PRIMARY_COLOR`        | no       | —                                                   | 6-digit hex accent colour (e.g. `#3b82f6`) injected as `--sv-color-accent`. Leave unset to use the default monochrome palette.                                                                                                                                                                                                                                                                                  |
| `BRAND_LOGO`                 | no       | —                                                   | URL of the light-theme brand logo. Use an absolute URL for an external logo, or `/api/brand/logo` after uploading via Console → Branding.                                                                                                                                                                                                                                                                       |
| `BRAND_LOGO_DARK`            | no       | `BRAND_LOGO`                                        | URL of the dark-theme brand logo. Falls back to `BRAND_LOGO` when unset.                                                                                                                                                                                                                                                                                                                                        |
| `BRAND_FAVICON`              | no       | —                                                   | URL of the branded favicon. Falls back to the built-in `favicon.ico` when unset.                                                                                                                                                                                                                                                                                                                                |
| `BRAND_EMAIL_FROM_NAME`      | no       | —                                                   | Sender display name used in outbound email (invite, password reset). Falls back to `BRAND_NAME` when unset.                                                                                                                                                                                                                                                                                                     |
| `BRAND_EMAIL_LOGO`           | no       | —                                                   | Publicly reachable URL for the logo included in HTML email bodies. Must be reachable by email client rendering engines — not a path-relative URL.                                                                                                                                                                                                                                                               |

---

## Branding and white-labeling

Sovereign supports full white-labeling via env vars (instance-wide defaults) and
the Console Branding UI (per-tenant overrides stored in the database). The two
layers stack: Console settings take precedence over env vars; env vars take
precedence over built-in defaults.

### What `BRAND_NAME` affects

`BRAND_NAME` is read server-side at request time by both apps, so changing it in
your deployment env takes effect on the next request without a rebuild.

| Surface          | App         | Detail                                                      |
| ---------------- | ----------- | ----------------------------------------------------------- |
| Shell header     | Runtime     | Shown as the instance name when no logo is configured       |
| Page `<title>`   | Auth server | `<BRAND_NAME>` — used for the browser tab and bookmark name |
| Login heading    | Auth server | "Sign in to `<BRAND_NAME>`"                                 |
| Page description | Auth server | "Sign in to your `<BRAND_NAME>` workspace."                 |
| Outbound email   | Both        | Subject lines and body copy use the brand name              |
| PWA manifest     | Runtime     | `name` and `short_name` in the web app manifest             |

### Env-var branding (instance-wide)

Set any of the `BRAND_*` vars in `.env` before starting the containers. All are
optional — unset vars fall back to the Sovereign defaults.

```env
BRAND_NAME=Acme Workspace
BRAND_PRIMARY_COLOR=#3b82f6      # hex accent colour
BRAND_LOGO=https://cdn.example.com/logo.png
BRAND_LOGO_DARK=https://cdn.example.com/logo-dark.png
BRAND_FAVICON=https://cdn.example.com/favicon.ico
BRAND_EMAIL_FROM_NAME=Acme      # email sender display name
BRAND_EMAIL_LOGO=https://cdn.example.com/logo-email.png
```

> **Logo and favicon URLs** must be publicly reachable absolute URLs. The auth
> server login page loads before any session exists, so relative or
> session-gated paths won't work. Use a CDN, object storage, or upload via the
> Console (which exposes `/api/brand/logo` and `/api/brand/favicon` as
> unauthenticated endpoints).

### Console branding (per-tenant override)

**Console → Settings → Branding** provides a live UI for the same fields. Values
saved there are stored in the `tenant_branding` table and take precedence over
env vars for every request — no restart needed. This is the recommended path for
operators who want to update branding without touching deployment config.

To reset a Console-set value back to the env-var default, clear the field in
Console and save.

---

## Data persistence

SQLite databases and uploaded files live under `/app/data` inside both the
runtime and auth containers:

```
data/
  sovereign.db        # Runtime platform database
  auth.db             # Auth server identity database
  avatars/            # User avatar uploads
  plugins/            # Isolated-database plugin stores (one file per plugin)
    <pluginId>.db     # e.g. io.example.tasks.db — only present for database: "isolated" plugins
```

The `plugins/` subdirectory is created automatically when the first isolated plugin
provisions its store. If no isolated plugins are installed it will not exist.
See [`docs/plugin-database.md`](plugin-database.md) for the full isolated-database reference.

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

## Non-Docker deployment

Docker Compose is the canonical and recommended production path. If you cannot
use Docker (shared hosting, some VPS environments, corporate policy), two
non-Docker options are supported: `sv serve` for simple single-server use, and
PM2 for production deployments that need process supervision and auto-restart.

**Both options require a production build first** (see [Build the standalone
output](#build-the-standalone-output) below).

### `sv serve` — simple foreground start

`sv serve` is the quickest way to run Sovereign without Docker. It starts both
servers in the foreground, gates the runtime startup on auth becoming healthy,
and tears both down on Ctrl+C or either process exiting.

**Use it for:** local production testing, single-server staging, or any
environment where a foreground process is acceptable.

**Do not use it for:** production deployments that must survive reboots or
server restarts — use PM2 (below) or Docker Compose instead.

```bash
# After pnpm build:
pnpm sv serve
```

`sv serve`:

1. Starts the auth server (`next start --port 3001`) in the background.
2. Polls `GET /api/health` on the auth server for up to 30 seconds.
3. Starts the runtime (`next start --port 3000`) once auth is healthy.
4. Forwards SIGINT / SIGTERM to both processes and exits when either exits.

> **Note:** `sv serve` runs `next start` from each package's `node_modules/.bin/`
> — `next` does not need to be on your system `PATH`.

> **Important:** `sv serve` serves the **built** output in
> `runtime/.next/standalone/` and `apps/auth/.next/standalone/`. Run
> `pnpm build` before every `sv serve` call. Source changes have no effect
> until you rebuild.

### PM2 — production process supervision

PM2 provides auto-restart on crash, startup hooks, and log management. Use it
for any deployment that must survive server reboots.

**Prerequisites:** Node.js ≥ 20, pnpm 11+, [PM2](https://pm2.keymetrics.io/)
(`npm install -g pm2`).

### Build the standalone output

```bash
git clone https://github.com/sovereignfs/sovereign.git /opt/sovereign
cd /opt/sovereign
cp .env.example .env
# Edit .env — set AUTH_SECRET and SOVEREIGN_ADMIN_KEY (required),
# plus NEXT_PUBLIC_RUNTIME_URL and AUTH_BASE_URL to your public domain.
pnpm install
pnpm build          # produces runtime/.next/standalone/ and apps/auth/.next/standalone/
```

The build emits two standalone servers:

| Server  | Standalone entry point                           |
| ------- | ------------------------------------------------ |
| Runtime | `runtime/.next/standalone/runtime/server.js`     |
| Auth    | `apps/auth/.next/standalone/apps/auth/server.js` |

You must copy the static assets and public directory alongside the standalone
output (Next.js does not include them automatically):

```bash
# Runtime static assets
cp -r runtime/.next/static runtime/.next/standalone/runtime/.next/static
cp -r runtime/public runtime/.next/standalone/runtime/public

# Auth static assets
cp -r apps/auth/.next/static apps/auth/.next/standalone/apps/auth/.next/static
```

### Generate and start the PM2 config

```bash
# Write ecosystem.config.js into /opt/sovereign/
pnpm sv setup pm2 --dir /opt/sovereign --env-file /opt/sovereign/.env

# Start both processes
pm2 start /opt/sovereign/ecosystem.config.js

# Persist across reboots
pm2 startup   # follow the printed instruction to install the startup hook
pm2 save
```

The generated config binds the **auth server to `127.0.0.1:3001`** (loopback
only — not publicly reachable) and the **runtime to `0.0.0.0:3000`**. Place
Caddy or nginx in front of port `3000` for TLS (see [Reverse proxy](#reverse-proxy) above).

PM2 starts both processes independently — PM2's auto-restart handles the startup
race: if the runtime starts before auth is ready, PM2 will restart it automatically.
This is different from `sv serve`, which gates the runtime on auth being healthy
before spawning it.

### Environment variable differences (Docker vs non-Docker)

| Variable                    | Docker Compose                                | PM2 / native                                  |
| --------------------------- | --------------------------------------------- | --------------------------------------------- |
| `SOVEREIGN_AUTH_URL`        | `http://auth:3001` (internal service name)    | `http://127.0.0.1:3001` (loopback)            |
| `SOVEREIGN_AUTH_PUBLIC_URL` | `http://localhost:4001` or your public domain | `http://localhost:3001` or your public domain |
| `NEXT_PUBLIC_RUNTIME_URL`   | `http://localhost:4000` or your public domain | `http://localhost:3000` or your public domain |
| `AUTH_BASE_URL`             | your public domain                            | your public domain                            |
| `AUTH_TRUSTED_ORIGINS`      | `http://auth:3001` (internal service name)    | not needed (same host)                        |

### Data directory

Create a writable data directory before starting:

```bash
mkdir -p /opt/sovereign/data
```

SQLite databases land in `data/` automatically (same behaviour as Docker). Set
`SOVEREIGN_DATA_DIR` in `.env` if you want them elsewhere. Avatars are stored at
`data/avatars/`.

### Upgrade procedure (non-Docker)

**`sv serve`:**

```bash
cd /opt/sovereign
git pull
pnpm install
pnpm build

# Copy updated static assets (same commands as initial build above)
cp -r runtime/.next/static runtime/.next/standalone/runtime/.next/static
cp -r runtime/public runtime/.next/standalone/runtime/public
cp -r apps/auth/.next/static apps/auth/.next/standalone/apps/auth/.next/static

# Restart (stop the running sv serve with Ctrl+C first, then):
pnpm sv serve
```

**PM2:**

```bash
cd /opt/sovereign
git pull
pnpm install
pnpm build

# Copy updated static assets (same commands as initial build above)
cp -r runtime/.next/static runtime/.next/standalone/runtime/.next/static
cp -r runtime/public runtime/.next/standalone/runtime/public
cp -r apps/auth/.next/static apps/auth/.next/standalone/apps/auth/.next/static

pm2 reload ecosystem.config.js   # zero-downtime reload where possible
```

Back up before upgrading (see [Backups and restore](#backups-and-restore) below):

```bash
pnpm sv backup
```

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

## Two-factor authentication (MFA)

Sovereign supports two opt-in second factors: **TOTP** (authenticator app) and
**passkeys** (WebAuthn). Both are per-user; admins cannot force-enable them.

### TOTP (authenticator app)

Users enroll from **Account → Security → Set up authenticator app**:

1. Enter the account password (server-side confirmation).
2. Scan the QR code with any TOTP app (Authy, 1Password, Google Authenticator, Bitwarden, etc.).
3. Click **Enable TOTP** — the app validates the first code.
4. Save the 10 backup codes shown once. Each code is single-use.

On subsequent sign-ins the user is redirected to `/login/2fa` after entering
their password. They can verify with:

- a live TOTP code from their authenticator app,
- a single-use backup code, or
- a registered passkey (if they have one).

Once enrolled, users can **disable TOTP** or **regenerate backup codes** from
the same Security tab (password-confirmed each time).

### Passkeys (WebAuthn)

Users add passkeys from **Account → Security → Add a passkey**. The browser
prompts for device biometrics (Face ID, Touch ID, Windows Hello) or a hardware
key. Multiple passkeys can be registered and named independently.

Passkeys can be used at the login page (the **Sign in with a passkey** button
appears if the browser supports WebAuthn) **and** as an alternative to a TOTP
code on the `/login/2fa` challenge page.

### Production configuration

The three `AUTH_WEBAUTHN_*` variables (in the env-var table above) default to
values that work for `localhost` development. Production deployments require
careful setting:

| Variable                | Production value                                                                                                                                                                                                                         |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AUTH_WEBAUTHN_RP_ID`   | Your bare **registrable domain** (e.g. `example.com`). Must be a suffix shared by **both** the auth server's origin and the runtime origin. Using a subdomain only (e.g. `auth.example.com`) blocks passkeys on the main runtime domain. |
| `AUTH_WEBAUTHN_RP_NAME` | Any human-readable name (shown in the browser passkey prompt).                                                                                                                                                                           |
| `AUTH_WEBAUTHN_ORIGIN`  | Comma-separated list of allowed origins. Set to your public runtime URL (e.g. `https://example.com`) — this is the `Origin` header the browser sends during WebAuthn ceremonies.                                                         |

```env
AUTH_WEBAUTHN_RP_ID=example.com
AUTH_WEBAUTHN_RP_NAME=My Sovereign
AUTH_WEBAUTHN_ORIGIN=https://example.com
```

> **Note:** passkey registrations are bound to the `rpID`. Changing
> `AUTH_WEBAUTHN_RP_ID` in production invalidates all existing passkeys — users
> must re-register. TOTP and backup codes are unaffected.

### Admin reset

If a user is locked out (lost authenticator, lost backup codes, no passkeys),
an admin can clear their MFA from **Console → Users → Reset MFA** (the button
appears in each user row). This removes all TOTP secrets, backup codes, and
passkeys for that user, letting them sign in with password alone and re-enroll.

### Break-glass CLI

For cases where the Console itself is inaccessible (e.g. the only admin is
locked out), the `sv` CLI provides a direct database reset:

```bash
pnpm sv user reset-mfa admin@example.com
```

This uses better-sqlite3 directly on the auth database and does not require a
running server. Only available for SQLite deployments; Postgres instances must
use the Console or a direct SQL query.

---

## Web Push notifications (RFC 0016)

Background push notifications let the platform deliver alerts to users' devices
even when the browser tab is closed, via the [Web Push Protocol][webpush] and
the browser's push service.

Push is entirely **opt-in** — both for operators (VAPID keys must be configured)
and for users (per-device subscription in Account → Notifications). The in-app
bell and polling continue to work with no VAPID configuration.

[webpush]: https://www.rfc-editor.org/rfc/rfc8030

### Generating VAPID keys

VAPID keys are generated **once per deployment** and must not change — changing
them invalidates all existing subscriptions and users must re-subscribe.

```bash
npx web-push generate-vapid-keys
```

This prints a pair of base64url-encoded keys. Add them to `.env`:

```env
VAPID_PUBLIC_KEY=<base64url public key>
VAPID_PRIVATE_KEY=<base64url private key>
VAPID_CONTACT=mailto:ops@example.com
```

`VAPID_CONTACT` is a contact URI sent in the VAPID Authorization header (required
by spec). Use a `mailto:` address you monitor — push services use it for
abuse reporting.

### How it works

1. The runtime serves `VAPID_PUBLIC_KEY` to the browser via
   `GET /api/account/push-subscription`.
2. The user clicks **Enable push notifications** in Account → Notifications.
   The browser asks for permission, then registers with the browser's push
   service and sends the resulting subscription (`endpoint` + `keys`) to
   `POST /api/account/push-subscription`.
3. When a notification is sent (via `sdk.notifications.send` or the admin
   broadcast), the runtime fan-outs a Web Push message to every active
   subscription for that user, respecting their muted-category preferences.
4. The service worker (`runtime/worker/index.ts`, bundled by next-pwa) receives
   the `push` event and shows an OS-level notification via
   `self.registration.showNotification`. Clicking the notification opens or
   focuses the app.

### Stale subscription pruning

When a push service returns `410 Gone` (device deregistered or browser data
cleared), the platform automatically deletes that subscription from the
`push_subscriptions` table. No manual cleanup is needed.

### HTTPS requirement

Web Push and the Service Worker API require a **secure context**: `https://` in
production. `localhost` is the only allowed exception for development. Users
on plain HTTP will see the opt-in button greyed out with an explanatory message.

### Disabling push

Remove (or comment out) `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` from `.env`
and restart. The push opt-in UI disappears from Account → Notifications and no
fan-out attempts are made. Existing subscriptions in the database are ignored
and can be left in place or deleted with:

```sql
DELETE FROM push_subscriptions;
```

---

## Invite-only registration

When `AUTH_INVITE_ONLY=true`, only users with a valid invite token can
register. The first user is always exempt — they register normally and become
the platform admin.

After the first user registers, invite new users via the Console:
`/console/users/invite` (Task 0.4.02).

---

## Diagnostics

### Structured logging

Sovereign emits newline-delimited JSON to the process's own stdout/stderr. Nothing is sent off-box (see [Security — logging](security.md#logging-and-telemetry)).

Set `LOG_LEVEL` in `.env` to control verbosity:

| Level   | Output                                                     |
| ------- | ---------------------------------------------------------- |
| `error` | Startup failures, unrecoverable errors only                |
| `warn`  | Default — configuration warnings, expected transient fails |
| `info`  | Request-level events, startup milestones                   |
| `debug` | Verbose: DB resolution, dev-mode activations, all paths    |

```bash
LOG_LEVEL=debug docker compose up
# or with Docker logs:
docker logs -f sovereign-runtime-1
```

Log lines look like:

```json
{
  "ts": "2026-06-21T14:00:00.000Z",
  "level": "info",
  "msg": "dev-mode activated",
  "userId": "usr_abc123",
  "path": "/console"
}
```

### Admin health endpoint

`GET /api/admin/health` (requires `Authorization: Bearer <SOVEREIGN_ADMIN_KEY>`) returns a structured JSON report:

```bash
curl -s -H "Authorization: Bearer $SOVEREIGN_ADMIN_KEY" \
  http://localhost:3000/api/admin/health | jq .
```

```json
{
  "platformVersion": "0.6.0",
  "database": {
    "dialect": "sqlite",
    "status": "ok",
    "sizeBytes": 204800,
    "migrationVersion": "0001"
  },
  "auth": { "status": "ok" },
  "incompatiblePlugins": [],
  "downgradeWarning": null,
  "plugins": { "installed": 5, "adminOnly": 1 },
  "diagnostics": {
    "logLevel": "warn",
    "devModeEnabled": false
  },
  "uptimeSeconds": 3600
}
```

Key fields:

- `database.migrationVersion` — the last applied migration; useful for verifying an upgrade landed.
- `downgradeWarning` — non-null when the running binary is older than the version that last wrote to the database. Restore a backup or upgrade before doing more writes.
- `diagnostics.devModeEnabled` — confirms whether `SOVEREIGN_DEV_MODE_ENABLED=true` is active in the environment.

---

## Production dev-mode (RFC 0020)

Production dev-mode lets you validate a feature on your **live instance** against
a **seeded mock database** without touching real user data. You use your real
account and session — only platform data (plugins, settings, notifications, etc.)
is read from and written to the isolated mock database.

> **When to use it:** you want to test a new plugin or configuration change on
> the actual production deployment (its real TLS setup, reverse proxy, Docker
> network) but must not disturb live users or data.

### How it works

1. Middleware checks each incoming request for the `X-Sovereign-Dev-Mode-Secret` header.
2. If the secret matches (`SOVEREIGN_DEV_MODE_SECRET` or `SOVEREIGN_ADMIN_KEY`) and `SOVEREIGN_DEV_MODE_ENABLED=true`, the request is marked as a dev-mode request.
3. All platform DB reads and writes for **that request only** go to the mock database (`SOVEREIGN_DEV_DATABASE_URL`). Concurrent requests from real users are unaffected.
4. The response carries `x-sovereign-dev-mode: active` so you can confirm it worked.

This is **never a global switch** — there is no way to put the entire process into dev-mode. The isolation is per-request.

### Setup

**Step 1 — Add env vars to `.env`:**

```env
SOVEREIGN_DEV_MODE_ENABLED=true

# A dedicated secret is recommended; falls back to SOVEREIGN_ADMIN_KEY if unset.
SOVEREIGN_DEV_MODE_SECRET=your-dev-mode-secret-here

# A separate SQLite file (or Postgres schema) for mock data.
SOVEREIGN_DEV_DATABASE_URL=file:./data/sovereign-dev.db
```

**Step 2 — Seed the mock database:**

```bash
# Seeds admin@dev.local / admin-dev-password and user@dev.local / user-dev-password
# into the database pointed at by SOVEREIGN_DEV_DATABASE_URL (or DATABASE_URL if not set).
DATABASE_URL=file:./data/sovereign-dev.db pnpm sv seed
```

Or, if using Docker Compose, run seed inside the runtime container:

```bash
DATABASE_URL=file:./data/sovereign-dev.db docker compose exec runtime pnpm sv seed
```

**Step 3 — Restart to pick up the new env vars.**

### Making a dev-mode request

Add `X-Sovereign-Dev-Mode-Secret` to any request that should use the mock database:

```bash
# Check the health endpoint — confirms devModeEnabled is true in the report.
curl -s \
  -H "Authorization: Bearer $SOVEREIGN_ADMIN_KEY" \
  http://localhost:3000/api/admin/health | jq .diagnostics

# Probe a page with dev-mode active. The -I flag shows response headers.
curl -sI \
  -H "Cookie: <your-session-cookie>" \
  -H "X-Sovereign-Dev-Mode-Secret: $SOVEREIGN_DEV_MODE_SECRET" \
  http://localhost:3000/console
# → x-sovereign-dev-mode: active  (confirms the mock DB is in use)
```

From the browser, add the header via a browser extension (e.g. ModHeader) or
a proxy. Any page or API call that carries the header will resolve against the
mock database. Remove the header to return to real data — no restart needed.

### What is and isn't mocked

| Layer                     | In dev-mode                                                  |
| ------------------------- | ------------------------------------------------------------ |
| Platform database         | **Mock DB** (`SOVEREIGN_DEV_DATABASE_URL`)                   |
| Plugin isolated databases | **Mock DB** (resolved through the same context-aware switch) |
| Auth sessions / identity  | **Real** — you sign in with a real account                   |
| Auth database (`auth.db`) | **Real** — user records, passwords, MFA are untouched        |
| Activity log              | **Real** — dev-mode activations are logged to the real DB    |

In v1 there is no way to mock the auth layer on prod (the "auth crux" per RFC 0020). Use the seeded test credentials (`admin@dev.local`, `user@dev.local`) on a local or staging instance for that level of isolation.

### Safety properties

- **Off unless explicitly enabled.** `SOVEREIGN_DEV_MODE_ENABLED` must be `true`; the header is silently ignored otherwise.
- **Secret-gated per request.** An unauthenticated header is ignored; the feature requires a valid session cookie AND the correct secret.
- **Per-request, never global.** Only the request carrying the header reads from the mock DB. Every other concurrent request uses the real DB.
- **Hard isolation.** The mock client is a separate `createClient()` instance pointing at `SOVEREIGN_DEV_DATABASE_URL`. There is no path from a dev-mode request to the real DB.
- **Audited.** Every activation is logged (JSON) to stdout, capturable via `docker logs`.

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

## Maintaining a fork

Most operators should never fork Sovereign's source — env vars, community plugins
(`sv plugin add`), and the RFC 0027 branding system cover the full customisation
surface without touching any source file. A fork is warranted only when you need
custom plugins compiled into the same image (e.g. for air-gapped environments or
proprietary code), or when you are building a commercial white-labeled derivative.

For the full model, zone taxonomy, AGPL compliance table, and `sv fork check`
follow-on, see [RFC 0028](rfcs/0028-operator-fork-model.md).

### Quick-start: Track 2 fork setup

```bash
# Fork sovereignfs/sovereign on GitHub, then:
git clone https://github.com/<org>/sovereign-fork && cd sovereign-fork
git remote add upstream https://github.com/sovereignfs/sovereign
git fetch upstream
```

Add an `operator/` directory to the repo root:

```
operator/
├── OPERATOR.md          # fork purpose, plugin list, AGPL posture
├── UPSTREAM             # plain text: upstream tag this fork is based on
└── docker-compose.override.yml   # deployment overrides (optional)
```

Add custom plugins under `plugins/<com.yourorg.pluginid>/` and unignore them in
`.gitignore`:

```gitignore
!/plugins/com.yourorg.myplugin/
```

**The isolation principle:** never modify files owned by upstream (`runtime/`,
`packages/`, `apps/`, `scripts/`, `plugins/account/`, `plugins/console/`,
`plugins/launcher/`, etc.). Operator additions go in `operator/` and
`plugins/<operator-id>/` only. Because the two file sets never overlap,
`git rebase upstream/main` applies every upstream release with zero conflicts.

### Upstream sync

```bash
git fetch upstream
git rebase upstream/main          # zero conflicts when the isolation principle is respected
echo "v1.3.0" > operator/UPSTREAM
git add operator/UPSTREAM && git commit -m "chore: sync with upstream v1.3.0"
git push --force-with-lease origin main

# Then deploy normally:
sv backup
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```

A conflict during rebase signals that a core-locked file was modified — fix by
reverting the change and expressing the intent as a community plugin or upstream
RFC instead.

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
