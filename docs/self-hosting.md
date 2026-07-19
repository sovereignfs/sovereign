---
docSection: operators
docType: guide
audiences:
  - operator
---

# Self-hosting Sovereign

Sovereign is designed to run on a single machine. Docker Compose is the
canonical deployment path — two containers (runtime + auth) on a shared
internal network. For production, put a reverse proxy in front of the public
runtime origin and the browser-facing auth origin; server-to-server runtime →
auth traffic still uses the internal Docker hostname.

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

```bash
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

The runtime is now at **`http://localhost:3000`**.

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
of the runtime and browser-facing auth ports, normally as separate domains such
as `example.com` and `auth.example.com`. Override `AUTH_PORT` and
`RUNTIME_PORT` to use different host ports.

---

## Bundled example plugins

The platform ships a set of reference **example plugins** (basic, API provider,
minimal/overlay shells, monetization demo). They do not live in the platform
repository — they are maintained in
[`sovereignfs/sovereign-plugins-examples`](https://github.com/sovereignfs/sovereign-plugins-examples)
and declared in `sovereign.plugins.json`, each pinned to a commit. The Docker
build (and `pnpm install:plugins` locally) clones them into `plugins/<slug>/`
before composing routes, so a default install ships with them.

Because they are cloned during the build, **the build needs network access to
GitHub.** The pinned commit refs keep the result reproducible.

### Showing/hiding the examples

The examples are **hidden by default**: even though they are baked into the
image, their routes return 404 and they never appear in the launcher or sidebar
until you opt in. The easiest way to show them is the **Console → Settings →
Example plugins** toggle — no env editing, no restart. Prefer this in day-to-day use.

For provisioning (e.g. a demo image), the `SOVEREIGN_EXAMPLES_ENABLED` runtime
env var sets the initial default. It is a plain runtime variable — set it in
`.env` or the container's `environment:`.

| Variable                     | Required | Default | Description                                                                                                                                                                     |
| ---------------------------- | -------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SOVEREIGN_EXAMPLES_ENABLED` | no       | off     | Seeds whether the bundled example plugins are shown (`1`/`true`/`yes`/`on` = shown). The Console → Settings toggle, once used, is persisted and overrides this. Unset = hidden. |

Precedence, highest first: (1) an explicit per-plugin enable/disable on
**Console → Plugins** (persisted per plugin); (2) the **Console → Settings →
Example plugins** instance toggle (persisted in `platform_settings`); (3) the
`SOVEREIGN_EXAMPLES_ENABLED` env default; (4) off.

To drop the examples from the image entirely (rather than just hiding them),
remove their entries from `sovereign.plugins.json` before building — nothing will
be cloned or composed.

### Hiding in-development plugins

A plugin can flag itself `development: true` in its manifest to mark it as
not yet production-ready. By default this plugin is still shown everywhere,
just sorted last in the sidebar and Launcher with an "in development" badge —
no routes are blocked. Set `SOVEREIGN_HIDE_DEVELOPMENT_PLUGINS` to hide such
plugins completely instead: their routes 404 and they never appear in the
sidebar or Launcher.

| Variable                             | Required | Default | Description                                                                                                  |
| ------------------------------------ | -------- | ------- | ------------------------------------------------------------------------------------------------------------ |
| `SOVEREIGN_HIDE_DEVELOPMENT_PLUGINS` | no       | off     | Hides every `development: true` plugin (`1`/`true`/`yes`/`on` = hidden). Unset = shown, badged, sorted last. |

Unlike `SOVEREIGN_EXAMPLES_ENABLED`, this variable has **no per-plugin
override and no Console setting** — an explicit enable on Console → Plugins
does not undo it. It's a hard, deploy-time gate: pin a production instance to
production-ready plugins only, without needing to remove the plugin from
`sovereign.plugins.json` (which would drop it from the image entirely).

## Bundled default plugins

**Sovereign Tasks** ships with every default install the same way the example
plugins do — declared in `sovereign.plugins.json`, pinned to a commit, cloned
into `plugins/sovereign-tasks/` during the Docker build (or `pnpm
install:plugins` locally). Unlike the examples, Tasks is a real feature and is
**visible and enabled from first boot** — there's no hidden-by-default toggle
for it.

Tasks is maintained in its own repository
([`sovereignfs/sovereign-tasks`](https://github.com/sovereignfs/sovereign-tasks))
and released independently of the platform, but bundling it here means
operators get it out of the box without a manual `sv plugin add`. If you don't
want it, disable or uninstall it from **Console → Plugins** like any other
plugin — the same lifecycle covers every plugin regardless of how its code got
onto disk. To drop it from the image entirely, remove its entry from
`sovereign.plugins.json` before building, same as the examples above.

See [Sovereign repositories](repositories.md) for the full map of platform,
plugin, documentation, and deployment-support repositories.

---

## Environment variables

All variables live in a single `.env` at the repo root. Copy `.env.example`
to get started — every variable is documented there.

| Variable                             | Required | Default                                             | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------------------ | -------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `AUTH_SECRET`                        | **yes**  | —                                                   | Signing secret for the auth server. The runtime also reads it to verify the session cookie locally (AUTH-05). Generate with `openssl rand -base64 32`. Never share or commit.                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `SOVEREIGN_ADMIN_KEY`                | **yes**  | —                                                   | Shared secret for runtime↔auth internal admin API calls (Console user/plugin management). Generate with `openssl rand -base64 32`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `SOVEREIGN_VAULT_KEY`                | no\*     | —                                                   | 32-byte key for the plugin secret vault (`sdk.secrets`). No default; generate with `openssl rand -base64 32`. Losing or rotating it without re-encrypting vault rows makes existing vault values unreadable. **\*Required in practice**: the bundled Plainwrite plugin stores GitHub PATs through this vault, so connecting a site fails with `SOVEREIGN_VAULT_KEY is required before sdk.secrets can store or read secret values.` until this is set. The platform boots fine without it — the error only surfaces the first time a plugin actually calls `sdk.secrets`, not at startup, which makes it easy to miss until a user hits it live. |
| `NEXT_PUBLIC_RUNTIME_URL`            | no       | per env (dev :3000/prod :4000)                      | Browser-facing public URL of the runtime. Auth emails and auth compatibility pages use it when sending users back to the runtime-hosted auth UI. The Compose files default it per environment (dev → `http://localhost:3000`, prod → `http://localhost:4000`); leave it unset locally. **Set it to your public domain (e.g. `https://example.com`) in a real deployment.** Read server-side at request time, so the container env is honoured (not baked at build).                                                                                                                                                                              |
| `SOVEREIGN_AUTH_URL`                 | no       | `http://localhost:3001`                             | Where the runtime reaches the auth server for server-side API calls. Docker Compose sets it to the internal service name (`http://auth:3001`) automatically — only set it for non-Docker/native runs.                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `SOVEREIGN_AUTH_PUBLIC_URL`          | no       | `SOVEREIGN_AUTH_URL`                                | Browser-facing base URL for the auth server compatibility routes. Needed when `SOVEREIGN_AUTH_URL` is an internal hostname the browser can't resolve (e.g. Docker's `http://auth:3001`). Set to the host-reachable URL such as `http://localhost:3001` or your public domain.                                                                                                                                                                                                                                                                                                                                                                    |
| `SOVEREIGN_RUNTIME_URL`              | no       | `http://localhost:3000`                             | Where the auth server reaches the runtime for server-to-server calls (e.g. recording email-delivery-failure activity log entries). The reverse of `SOVEREIGN_AUTH_URL`. Docker Compose sets it to the internal service name (`http://runtime:3000`) automatically — only set it for non-Docker/native runs. Never browser-reachable; do not confuse with `NEXT_PUBLIC_RUNTIME_URL`.                                                                                                                                                                                                                                                              |
| `AUTH_BASE_URL`                      | no       | `http://localhost:3001`                             | Public base URL of the auth server. Set to your public domain in production (e.g. `https://auth.example.com`). Used by better-auth for callback construction and CSRF origin validation.                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `AUTH_TRUSTED_ORIGINS`               | no       | —                                                   | Comma-separated list of origins trusted for CSRF checks in addition to `AUTH_BASE_URL`. In Docker deployments, set to `http://auth:3001` so server-to-server calls from the runtime (avatar upload, password change) are accepted when `AUTH_BASE_URL` is your public domain.                                                                                                                                                                                                                                                                                                                                                                    |
| `AUTH_COOKIE_DOMAIN`                 | no       | —                                                   | Cookie domain for cross-subdomain session sharing. Required when auth and runtime are on different subdomains (e.g. `auth.example.com` and `example.com`). Set to the shared parent domain with a leading dot: `.example.com`. Without this, session cookies are scoped to the auth subdomain only and the runtime never receives them — every login silently redirects back to the login page. Leave unset for local dev (both on `localhost`).                                                                                                                                                                                                 |
| `AUTH_WEBAUTHN_RP_ID`                | no       | hostname of `AUTH_BASE_URL`                         | WebAuthn relying-party ID for passkey registration and sign-in (RFC 0012). Must be a registrable domain suffix shared by the auth server and the runtime origin. Keep as `localhost` for local dev. In production, set to your bare domain (e.g. `example.com`).                                                                                                                                                                                                                                                                                                                                                                                 |
| `AUTH_WEBAUTHN_RP_NAME`              | no       | `Sovereign`                                         | Human-readable name shown in the browser's passkey prompt.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `AUTH_WEBAUTHN_ORIGIN`               | no       | `NEXT_PUBLIC_RUNTIME_URL,SOVEREIGN_AUTH_PUBLIC_URL` | Comma-separated list of WebAuthn origins allowed during credential verification. Must include the runtime origin because passkey sign-in and management go through the runtime proxy. Keep the auth server's public origin included while its compatibility routes remain exposed. Defaults to `http://localhost:3000,http://localhost:3001` in dev. In production set to e.g. `https://example.com,https://auth.example.com`.                                                                                                                                                                                                                   |
| `AUTH_INVITE_ONLY`                   | no       | `false`                                             | When `true`, registration requires a valid invite token. The first user is exempt.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `AUTH_REQUIRE_EMAIL_VERIFICATION`    | no       | `true`                                              | When `true` (default), a new account must click an emailed verification link before signing in — registration does not create a session, and sign-in is blocked until the link is clicked. Set to `false` for air-gapped/internal deployments where the invite mechanism itself is sufficient proof of identity. Requires SMTP to be configured (see `SMTP_HOST` below); the auth server logs a startup warning if it isn't. Accounts that existed before this was enabled are grandfathered automatically on first boot after upgrading — only new registrations go through the email flow.                                                     |
| `AUTH_DATABASE_URL`                  | no       | `file:./data/auth.db`                               | Auth server database. SQLite file path (relative paths resolve against the repo root) or a `postgres://` URL.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `DATABASE_URL`                       | no       | `file:./data/sovereign.db`                          | Runtime database. SQLite file path (relative paths resolve against the repo root) or a `postgres://` URL.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `DB_DIALECT`                         | no       | `sqlite`                                            | Set to `postgres` when using PostgreSQL.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `PGSSLROOTCERT`                      | no       | —                                                   | Path to a CA PEM file for Postgres TLS certificate verification. Only meaningful when `DATABASE_URL` / `AUTH_DATABASE_URL` includes `sslmode=verify-full`. Follows the standard libpq convention (same env var accepted by `psql` and `pg_dump`).                                                                                                                                                                                                                                                                                                                                                                                                |
| `SOVEREIGN_STORAGE_MAX_OBJECT_BYTES` | no       | `26214400` (25 MiB)                                 | Max size in bytes for a single `sdk.storage.put()` object (RFC 0044). `sdk.storage.put()` throws `StorageQuotaExceededError` above this.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `SOVEREIGN_STORAGE_MAX_PLUGIN_BYTES` | no       | `524288000` (500 MiB)                               | Max total bytes stored across all of one plugin's `sdk.storage` objects (RFC 0044). `sdk.storage.put()` throws `StorageQuotaExceededError` once a plugin's total would exceed this.                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `SMTP_HOST`                          | no       | `localhost` (dev) / — (prod)                        | SMTP server host. In non-production builds, defaults to `localhost` so Mailpit works out of the box with no config. In production, leave unset to disable email (the app still runs) or set to your SMTP relay. Password reset and email verification (`AUTH_REQUIRE_EMAIL_VERIFICATION`, on by default) cannot complete when SMTP is disabled — set `AUTH_REQUIRE_EMAIL_VERIFICATION=false` if you don't plan to configure SMTP.                                                                                                                                                                                                                |
| `SMTP_PORT`                          | no       | `587`                                               | SMTP port.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `SMTP_USER`                          | no       | —                                                   | SMTP username.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `SMTP_PASS`                          | no       | —                                                   | SMTP password.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `SMTP_FROM`                          | no       | —                                                   | Sender address, e.g. `Sovereign <noreply@example.com>`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `RUNTIME_PORT`                       | no       | `3000` (dev) / `4000` (prod)                        | Host port the runtime container is mapped to.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `AUTH_PORT`                          | no       | `3001` (dev) / `4001` (prod)                        | Host port the auth container is mapped to.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `SOVEREIGN_AUTH_SECRET`              | no       | `AUTH_SECRET`                                       | Secret for local session verification (AUTH-05). Must equal the auth server's signing secret, so it defaults to `AUTH_SECRET` — set it only to run a deliberately distinct value.                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `MAILPIT_SMTP_PORT`                  | no       | `1025`                                              | Dev only — host port for the Mailpit SMTP listener in `docker-compose.yml`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `MAILPIT_UI_PORT`                    | no       | `8025`                                              | Dev only — host port for the Mailpit web inbox in `docker-compose.yml`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `VAPID_PUBLIC_KEY`                   | no       | —                                                   | VAPID public key (base64url) for Web Push (RFC 0016). Leave unset to disable push — the in-app bell is the fallback. Generate with `npx web-push generate-vapid-keys`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `VAPID_PRIVATE_KEY`                  | no       | —                                                   | VAPID private key (base64url). Must pair with `VAPID_PUBLIC_KEY`. Keep secret — treat it like `AUTH_SECRET`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `VAPID_CONTACT`                      | no       | `mailto:admin@localhost`                            | Contact URI sent in the VAPID `Authorization` header (required by spec). Use your admin email, e.g. `mailto:ops@example.com`. **Effectively required for iOS/Safari push:** Apple's push service rejects the localhost default with 403, so iOS devices never receive pushes until this is a real address — the runtime logs a warning when it is unset. Android/desktop Chrome are lenient about the subject.                                                                                                                                                                                                                                   |
| `NOTIFICATION_TRANSPORT`             | no       | `polling`                                           | Notification foreground delivery mode: `polling` (client polls the DB endpoint), `sse` (in-process EventEmitter push, single-process only), or `redis` (Redis Pub/Sub push, cross-process). See [Notification transport](#notification-transport-rfc-0034) below.                                                                                                                                                                                                                                                                                                                                                                                |
| `REDIS_URL`                          | no       | —                                                   | Redis connection URL (e.g. `redis://localhost:6379`). Required when `NOTIFICATION_TRANSPORT=redis`. Ignored otherwise.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `NOTIFICATION_HEARTBEAT_INTERVAL`    | no       | `25000`                                             | Interval in milliseconds between SSE heartbeat comments sent on the `/api/account/notifications/stream` connection. Lower this if your reverse proxy has a shorter idle timeout than 30 s.                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `SOVEREIGN_SCHEDULER_DISABLED`       | no       | —                                                   | Set to `1` (or `true`) to stop the runtime from invoking plugin-declared background schedules (manifest `schedules`, RFC 0046 Phase 1) — a kill-switch for debugging a misbehaving plugin job. Unset = the scheduler runs.                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `LOG_LEVEL`                          | no       | `warn`                                              | Structured log verbosity: `error` \| `warn` \| `info` \| `debug`. Logs go to stdout/stderr only — nothing egresses (see [Security](security.md#logging-and-telemetry)).                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `SOVEREIGN_DEV_MODE_ENABLED`         | no       | —                                                   | Set to `true` to enable production dev-mode (RFC 0020). When unset the feature does not exist and the dev-mode secret header is ignored entirely.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `SOVEREIGN_DEV_MODE_SECRET`          | no       | `SOVEREIGN_ADMIN_KEY`                               | Secret callers supply in `X-Sovereign-Dev-Mode-Secret` to activate dev-mode on a request. Defaults to `SOVEREIGN_ADMIN_KEY` when unset. Set explicitly in production.                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `SOVEREIGN_DEV_DATABASE_URL`         | no       | —                                                   | URL of the mock database populated by `sv seed`. Dev-mode requests resolve all platform DB reads/writes to this database. Must be a separate file/schema from `DATABASE_URL`. Example: `file:./data/sovereign-dev.db`.                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `INSTANCE_NAME`                      | no       | `Sovereign`                                         | Display name of the instance shown in the shell, login page, and email. Overridable in Console → Settings → Instance identity.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `INSTANCE_PRIMARY_COLOR`             | no       | —                                                   | 6-digit hex accent colour (e.g. `#3b82f6`) injected as `--sv-color-accent`. Leave unset to use the default monochrome palette.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `INSTANCE_LOGO`                      | no       | —                                                   | URL of the light-theme instance logo. Use an absolute URL for an external logo, or `/api/instance/logo` after uploading via Console → Instance identity.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `INSTANCE_LOGO_DARK`                 | no       | `INSTANCE_LOGO`                                     | URL of the dark-theme instance logo. Falls back to `INSTANCE_LOGO` when unset.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `INSTANCE_FAVICON`                   | no       | —                                                   | URL of the instance favicon. Falls back to the built-in `favicon.ico` when unset.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `INSTANCE_EMAIL_FROM_NAME`           | no       | —                                                   | Sender display name used in outbound email (invite, password reset). Falls back to `INSTANCE_NAME` when unset.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `INSTANCE_EMAIL_LOGO`                | no       | —                                                   | Publicly reachable URL for the logo included in HTML email bodies. Must be reachable by email client rendering engines — not a path-relative URL.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |

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

Then open `http://localhost:4000`. The runtime redirects you to
`http://localhost:4001/login` (reachable, **not** the internal `http://auth:3001`),
and after you sign in or register the auth server sends you back to
`http://localhost:4000`. In a real deployment behind a reverse proxy, set
`AUTH_BASE_URL` and `NEXT_PUBLIC_RUNTIME_URL` to your public domain(s).

### Deploying to a real VPS or server

> **Recommended path:** use the **[sovereign-infra](https://github.com/sovereignfs/sovereign-infra)**
> GitHub template. It is an operator-owned infra repository for an Ubuntu VPS:
> Caddy (auto-TLS), age-encrypted `.env` files, daily encrypted backups, and a
> GitHub Actions CI/CD pipeline. The platform repo publishes Docker images on a
> `v*` release tag; your infra repo deploys those images when you push the same
> tag there. Fork it, run `./configure.sh`, and follow the README. The manual
> instructions below still apply — `sovereign-infra` automates them.

> **The most common mistake:** leaving `AUTH_BASE_URL` and
> `NEXT_PUBLIC_RUNTIME_URL` at their defaults. They default to `localhost:*`
> which is only reachable from within the server itself. A remote browser
> that hits these URLs gets sent nowhere — login silently loops back to the
> login page.

When deploying to a real machine (any VPS, cloud VM, or bare-metal server),
you **must** add these three variables to `.env` before starting:

```bash
# Replace with your VPS IP or domain. Use https:// if you have TLS.
AUTH_BASE_URL=http://203.0.113.10:4001           # public URL of the auth container
NEXT_PUBLIC_RUNTIME_URL=http://203.0.113.10:4000 # public URL of the runtime container
AUTH_TRUSTED_ORIGINS=http://auth:3001            # allows server-to-server calls through Docker
```

With a domain and TLS (recommended — see [Reverse proxy](#reverse-proxy) below):

```bash
AUTH_BASE_URL=https://auth.example.com
NEXT_PUBLIC_RUNTIME_URL=https://example.com
AUTH_TRUSTED_ORIGINS=http://auth:3001
```

`SOVEREIGN_AUTH_PUBLIC_URL` is derived from `AUTH_BASE_URL` by the Compose file
automatically — you only need to set `AUTH_BASE_URL`.

**Why `AUTH_TRUSTED_ORIGINS=http://auth:3001`?** When `AUTH_BASE_URL` is your
public domain, better-auth's CSRF check requires the internal Docker address
(`http://auth:3001`) to be in the trusted-origins list, because that is the
`Origin` header the runtime sends on server-to-server calls (avatar uploads,
password changes, session verification). Without it those calls return 403.

### Reverse proxy

Place a reverse proxy in front of the runtime port (`4000`) and the
browser-facing auth port (`4001`). The auth server still talks to the runtime
through shared cookies and public callback origins, while server-to-server calls
from runtime to auth use the internal Docker hostname (`http://auth:3001`).

The `sovereign-infra` template uses two domains:

```
example.com {
    reverse_proxy localhost:4000
}

auth.example.com {
    reverse_proxy localhost:4001
}
```

With Caddy in front, both browser origins get TLS automatically. Do not expose
Postgres or the internal Docker network publicly.

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

**Prerequisites:** Node.js 24.x, pnpm 11+, [PM2](https://pm2.keymetrics.io/)
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
| `SOVEREIGN_RUNTIME_URL`     | `http://runtime:3000` (internal service name) | `http://127.0.0.1:3000` (loopback)            |
| `SOVEREIGN_AUTH_PUBLIC_URL` | `http://localhost:4001` or your public domain | `http://localhost:3001` or your public domain |
| `NEXT_PUBLIC_RUNTIME_URL`   | `http://localhost:4000` or your public domain | `http://localhost:3000` or your public domain |
| `AUTH_BASE_URL`             | your public domain                            | your public domain                            |
| `AUTH_TRUSTED_ORIGINS`      | `http://auth:3001` (internal service name)    | not needed (same host)                        |

### Data directory

Create a writable data directory before starting:

```bash
mkdir -p /opt/sovereign/data
```

SQLite databases land in `data/` automatically (same behaviour as Docker) —
resolved as `<workspace-root>/data`, with no env var to relocate it. Avatars
are stored at `data/avatars/`.

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

Back up before upgrading. Once RFC 0064 lands, use the platform-owned CLI flow:

```bash
pnpm sv backup
```

Until then, the current `sovereign-infra` template ships GitHub-specific backup
helper scripts for VPS operators. Those scripts age-encrypt Postgres, user avatars, the plugin
manifest, and isolated plugin SQLite databases before pushing them to a private GitHub backup
repository. RFC 0064 tracks the platform-owned future `sv backup`/`sv restore` flow, which
generalizes Git-backed encrypted backups beyond the infra template.

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

Sovereign uses [Mailpit](https://mailpit.axllent.org/) to capture outbound
email locally — a tiny SMTP server with a web inbox.

### `pnpm dev` (native)

No `.env` changes needed. When `SMTP_HOST` is unset, the mailer automatically
falls back to `localhost:1025` in non-production environments. Just start
Mailpit and emails appear immediately:

```bash
# Docker (standalone)
docker run -p 1025:1025 -p 8025:8025 axllent/mailpit

# Or native binary
brew install mailpit   # macOS
# see https://mailpit.axllent.org/docs/install/ for Linux/Windows
mailpit
```

Open **`http://localhost:8025`** and trigger any email flow (invite, forgot
password) — no additional configuration required.

### Docker Compose

Mailpit is included in `docker-compose.yml` and starts automatically alongside
the runtime and auth services. Set `SMTP_HOST=mailpit` in `.env` to route
the containerised app to it:

```bash
SMTP_HOST=mailpit   # the Docker service name; omit when running pnpm dev natively
```

- **SMTP (internal):** `mailpit:1025`
- **Web inbox:** `http://localhost:8025`

## Production email behavior

Sovereign classifies outbound email by delivery class:

- Authentication email, such as password reset and required email verification
  (`AUTH_REQUIRE_EMAIL_VERIFICATION`), is required to complete the flow. In production without
  `SMTP_HOST`, those flows fail closed with a generic delivery error rather than exposing SMTP
  details to the user.
- Security email, such as account-created, password-changed, MFA/passkey changes, and account
  deletion, is best-effort after the state change. Failures are logged but do not roll back the
  completed security action.
- Administrative email, such as invites, role changes, deactivation, reactivation, and admin MFA
  reset, is best-effort but surfaces a warning to the admin where the UI has a copy-link fallback.

Console → Health reports sanitized email diagnostics: whether SMTP is configured, the last delivery
status and timestamp, the last failure code, and the number of failures in the last 24 hours. The
delivery log stores non-secret metadata only. It does not store message bodies, reset tokens, invite
tokens, or raw recipient email addresses.

---

## Password reset

Users who have forgotten their password can request a reset link from the login
page via the **Forgot password?** link. The flow:

1. User enters their email address at `/forgot-password` on the runtime origin.
2. The auth server sends a time-limited reset link to that address.
3. User clicks the link (`/reset-password?token=…` on the runtime origin) and
   chooses a new password (minimum 8 characters, confirmed twice).
4. On success the session is not automatically created — the user is directed to
   sign in with the new password.

**Security properties:**

- The response is always _"If that email address is registered, you'll receive a
  reset link shortly"_ regardless of whether the address exists — no user
  enumeration.
- Reset tokens expire after **1 hour**.
- The endpoint is rate-limited to **3 requests per 60 seconds per IP** to prevent
  abuse.

**Requirement:** password reset sends an email, so SMTP must be reachable. In
development Mailpit handles this automatically (see [Email in
development](#email-in-development)). In production configure `SMTP_HOST` and
the related vars in the env table above; without them the reset email is silently
skipped and the user will not receive a link.

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

```bash
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

```bash
VAPID_PUBLIC_KEY=<base64url public key>
VAPID_PRIVATE_KEY=<base64url private key>
VAPID_CONTACT=mailto:ops@example.com
```

`VAPID_CONTACT` is a contact URI sent in the VAPID Authorization header (required
by spec). Use a `mailto:` address you monitor — push services use it for
abuse reporting. **Do not skip this on an instance with iOS users**: Apple's
push service validates the subject and rejects the `mailto:admin@localhost`
fallback with 403, so pushes to iPhones/iPads silently fail while Android and
desktop Chrome keep working. The runtime logs a `push: VAPID_CONTACT…` warning
at first send when the subject is unset or points at localhost, and failed
sends are logged as `push: send failed` with the push service's status code.

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

## Notification transport (RFC 0034)

The notification bell can receive updates in three modes, selected by
`NOTIFICATION_TRANSPORT`:

| Mode      | How it works                                                    | When to use                                                                                      |
| --------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `polling` | Browser polls `/api/account/notifications` every 30 s (default) | Zero extra infra. Works everywhere.                                                              |
| `sse`     | Server-Sent Events backed by an in-process `EventEmitter`       | Single-process deployments wanting instant delivery. No extra infra.                             |
| `redis`   | SSE backed by Redis Pub/Sub                                     | Multi-process or clustered deployments (PM2 cluster, multiple containers). Requires `REDIS_URL`. |

### Enabling SSE mode (single process)

```bash
NOTIFICATION_TRANSPORT=sse
```

Restart the runtime. The bell switches to an `EventSource` connection on next
page load. No additional dependencies or infrastructure required.

### Enabling Redis mode (multi-process / clustered)

1. Run Redis (add the commented block in `docker-compose.prod.yml`, or point at
   an existing instance):

   ```yaml
   # docker-compose.prod.yml — uncomment:
   # redis:
   #   image: redis:7-alpine
   #   container_name: sovereign-redis
   #   restart: unless-stopped
   #   networks:
   #     - sovereign_net
   ```

2. Add the env vars to the runtime service:

   ```bash
   NOTIFICATION_TRANSPORT=redis
   REDIS_URL=redis://redis:6379
   ```

3. Restart all runtime containers. Cross-process delivery is active — a
   notification sent in process A reaches clients connected to process B.

### Reverse-proxy configuration for SSE

SSE requires the proxy to forward long-lived HTTP responses without buffering.
The runtime sends `X-Accel-Buffering: no` automatically, but some proxies
require explicit configuration:

| Proxy   | Required config                                                              |
| ------- | ---------------------------------------------------------------------------- |
| nginx   | `proxy_buffering off;` and `proxy_read_timeout 3600s;` in the upstream block |
| Caddy   | `flush_interval -1` in the `reverse_proxy` directive                         |
| Traefik | No action required — unbuffered by default                                   |
| AWS ALB | Increase idle timeout from the default 60 s to ≥ 3600 s on the load balancer |

The SSE stream sends a heartbeat comment every 25 s (configurable via
`NOTIFICATION_HEARTBEAT_INTERVAL`) to keep connections alive through proxies
with shorter idle timeouts.

### Polling mode fallback

Clients automatically fall back to polling if the SSE connection produces
three consecutive errors. No configuration is required — this is handled
client-side.

### Checking transport status

```bash
curl -H "x-sovereign-admin-key: $SOVEREIGN_ADMIN_KEY" \
     http://localhost:3000/api/admin/health | jq .notifications
# → { "transport": "sse", "brokerConnected": true }
```

`brokerConnected: false` in Redis mode means the Redis connection is down —
notifications are still written to the database (polling clients are unaffected)
but SSE push is silently skipped until Redis recovers.

---

## Invite-only registration

When `AUTH_INVITE_ONLY=true`, only users with a valid invite token can
register. The first user is always exempt — they register normally and become
the platform admin.

After the first user registers, invite new users via the Console:
`/console/users/invite` (Task 0.4.2).

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
docker logs -f sovereign-runtime
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

```bash
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
(`sv plugin add`), and the RFC 0027 instance identity system cover the full customisation
surface without touching any source file. A fork is warranted only when you need
custom plugins compiled into the same image (e.g. for air-gapped environments or
proprietary code), or when you are building a commercial white-labeled derivative.

For the full model, zone taxonomy, AGPL compliance table, and `sv fork check`
follow-on, see [RFC 0028](rfcs/0028-operator-fork-model.md).

### Choose a track

| Track                        | Use when                                                                                                                                                                | Upgrade path                                                         |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| **Track 1 — config-only**    | You can use published Sovereign images, env vars, Console settings, branding, and `sv plugin add` / `sovereign.plugins.json`. This is the default and recommended path. | Pull the next image and follow [upgrade.md](upgrade.md).             |
| **Track 2 — fork-and-track** | You need custom private plugins committed into the same source tree, an air-gapped build, or a commercial OEM derivative.                                               | Rebase your fork on upstream, then deploy with the normal procedure. |

Start with Track 1. Move to Track 2 only when a plugin cannot be installed from
an external repository at deploy/build time, or when you are distributing a
derivative product.

### Track 1: config-only

Track 1 operators keep upstream source untouched. Typical customisation lives in:

- `.env` or deployment secrets for database, auth, SMTP, VAPID, and branding
  values.
- Console settings for installed apps, root app selection, instance identity,
  and user/admin configuration.
- `sovereign.plugins.json` entries or `pnpm sv plugin add <repo>` for community
  plugins.
- Uploaded brand assets once the RFC 0027 branding phases are available.

This track has no fork-specific git workflow. Upgrade by pulling the next image
or upstream checkout, taking a backup, and following [upgrade.md](upgrade.md).

### Private plugins on a hosted instance

A private-repo plugin does **not** require forking (Track 2) — it stays on Track 1 as long
as you're building from an upstream source checkout (`docker compose -f docker-compose.prod.yml
up --build -d`, no `SOVEREIGN_VERSION` pin). Plugin loading is build-time-only in v1 (there is
no hot-swap or install-without-rebuild — see [Plugin compatibility](#plugin-compatibility) and
SRS §3.9), so "installing" a plugin always means: declare it → clone it → rebuild → redeploy.
What follows makes the private-repo-auth part of that seamless.

1. **Declare it** in `sovereign.plugins.json` with `tokenEnv` naming an environment variable —
   never the token itself:

   ```json
   {
     "plugins": [
       {
         "id": "com.acme.crm",
         "repository": "https://github.com/acme/sovereign-crm",
         "tokenEnv": "ACME_CRM_PLUGIN_TOKEN"
       }
     ]
   }
   ```

2. **Pass the token as a BuildKit build secret — not a running container's `.env`, not a plain
   `ARG`.** A Docker `RUN` step never inherits the host or Compose `environment:` block (that only
   applies to the _running container_, not the build), so `ACME_CRM_PLUGIN_TOKEN` has to be
   injected explicitly at build time. The secret is a **file** of plain `VAR=value` lines — one
   per private plugin repo (or fewer if several share a `tokenEnv`) — not a single named
   variable, so any number of private plugins works without ever touching the Dockerfile:
   ```bash
   printf 'ACME_CRM_PLUGIN_TOKEN=ghp_xxx\n' > /tmp/plugin-tokens.env
   docker buildx build \
     --secret id=plugin_tokens,src=/tmp/plugin-tokens.env \
     -f Dockerfile -t sovereign-runtime .
   rm /tmp/plugin-tokens.env
   ```
   `docker compose -f docker-compose.prod.yml up --build -d` alone does **not** pass this
   through — Compose only forwards build secrets declared in the compose file's own
   `build.secrets:`/top-level `secrets:` blocks, which `docker-compose.prod.yml` doesn't
   currently define. Build with `docker buildx build` directly (as above), then run
   `docker compose -f docker-compose.prod.yml up -d` against the image you just built (no
   `SOVEREIGN_VERSION` pin, so Compose uses the locally-built `sovereign-runtime` image rather
   than pulling from GHCR). Requires an `https://` repository URL — an SSH URL authenticates via
   your shell's own SSH key/agent and needs no `tokenEnv`.
3. **`scripts/install-plugins.ts` clones the repo using the token**, authenticated via a
   short-lived git credential file — never logged, never embedded in a URL passed as a process
   argument. The `--secret` itself is never written to any image layer or the build-cache
   metadata (unlike an `ARG`, which is).

**The one requirement this depends on — a persistent checkout, not a fresh clone.** Cloned plugin
source lands in `plugins/<id>/`, which is gitignored (it has its own repository). The standard
upgrade procedure ([upgrade.md](upgrade.md)) is `git pull` **in the same checkout directory** —
git pull never touches untracked/ignored paths, so `plugins/<id>/` survives every subsequent
upgrade automatically, and `scripts/install-plugins.ts` skips re-cloning anything already present
on disk. **The token is only needed the first time a private plugin is cloned** — not on every
later rebuild.

This breaks if your deployment does a **fresh `git clone` per deploy**, `git clean -fdx`, or runs
on an ephemeral CI runner with no persistent filesystem between runs: `plugins/<id>/` would be
lost and need re-cloning (token required again) on every deploy. If that's your setup, persist
`plugins/<id>/` yourself between runs (e.g. a CI cache/artifact step or a build-host volume) the
same way you'd cache any other build dependency.

Use Track 2 (fork-and-track, below) instead if you'd rather vendor the plugin's source directly
into your own fork's git history alongside upstream, rather than pulling it from a separate
private repository at build time.

### Track 2: fork-and-track setup

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

`operator/UPSTREAM` is a single line containing the upstream tag or commit SHA
your fork last synced to, for example:

```text
v1.3.0
```

`operator/OPERATOR.md` should record the fork purpose, custom plugin list,
maintainer contact, and AGPL posture:

```markdown
# Acme Sovereign Fork

**Upstream:** sovereignfs/sovereign
**Based on:** see `operator/UPSTREAM`
**Purpose:** Internal deployment with proprietary CRM integration plugin

## Custom plugins

| Plugin ID      | Location                | License     |
| -------------- | ----------------------- | ----------- |
| `com.acme.crm` | `plugins/com.acme.crm/` | Proprietary |

## AGPL compliance

This fork is deployed internally and not distributed externally.
No AGPL source-disclosure obligation applies.
```

Add custom plugins under `plugins/<com.yourorg.pluginid>/` and unignore them in
`.gitignore`:

```text
!/plugins/com.yourorg.myplugin/
```

**The isolation principle:** never modify files owned by upstream (`runtime/`,
`packages/`, `apps/`, `scripts/`, `plugins/account/`, `plugins/console/`,
`plugins/launcher/`, etc.). Operator additions go in `operator/` and
`plugins/<operator-id>/` only. Because the two file sets never overlap,
`git rebase upstream/main` applies every upstream release with zero conflicts.

Custom plugins are normal community plugins: use only `@sovereignfs/sdk` and
`@sovereignfs/ui`, declare a manifest, and run through `pnpm generate`. Do not
import from `runtime/src` or modify shell/auth/middleware internals in the fork.
If you need a new core extension point, propose an upstream RFC instead.

### Asset management in a fork

Do not replace upstream files in `runtime/public/` or app layouts just to brand a
fork.

- **Before RFC 0027 branding is available:** place static operator assets under
  `operator/assets/` and serve them from an operator-owned plugin route, such as
  `plugins/com.acme.brand/app/logo/route.ts`.
- **After RFC 0027 branding is available:** upload logos, favicons, and identity
  values through Console. Those assets live in deployment data, not in the fork.

### Upstream sync

```bash
git fetch upstream
git rebase upstream/main          # zero conflicts when the isolation principle is respected
echo "v1.3.0" > operator/UPSTREAM
git add operator/UPSTREAM && git commit -m "chore: sync with upstream v1.3.0"
git push --force-with-lease origin main

# Then deploy normally. If your fork builds its own image, build/publish that
# image from the rebased fork before recreating containers.
sv backup
docker compose -f docker-compose.prod.yml up --build -d
```

A conflict during rebase signals that a core-locked file was modified — fix by
reverting the change and expressing the intent as a community plugin or upstream
RFC instead.

### AGPL reference for fork operators

| Scenario                                                            | Obligation                                                          |
| ------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Private fork, self-hosted internally, not distributed               | None. AGPL triggers on distribution, not private use.               |
| Hosting a modified Sovereign as a service for external users (SaaS) | Publish source changes under AGPL or obtain the commercial license. |
| Building and distributing a white-labeled product                   | Use the commercial dual-license described in SRS §2.7.              |

Custom plugins in `plugins/<operator-id>/` use the MIT-licensed SDK/UI boundary
and may carry their own license. Record the fork's compliance posture in
`operator/OPERATOR.md`.

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
