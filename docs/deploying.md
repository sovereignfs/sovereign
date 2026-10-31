# Deploying core

Core ships as one image, `ghcr.io/sovereignfs/sovereign`, and three ways to run it with a database. Nothing is
baked into the image: it holds no environment file, and it refuses to start, saying what is missing, until it is
given `SV_URL` and `SV_AUTH_SECRET`. Every variable core reads is in
[`apps/core/.env.example`](../apps/core/.env.example), and [`spec/env.md`](../spec/env.md) says how they work.

> **Running an instance with apps?** The operator toolkit, `sv`, deploys core, a proxy and your apps to one machine and keeps them up
> to date, backed up and restorable. Start with [Running an instance](operating.md). This page is the plain Compose route: core on its own,
> with the pieces you assemble yourself.

## Quick start

```bash
cp apps/core/.env.example .env
# Edit .env: set SV_URL (core's public address) and SV_AUTH_SECRET (openssl rand -base64 48).
docker compose up -d
```

That is sqld, the default. The first account to sign up becomes the owner. Core listens on `3000` (change the published
port with `SV_PORT`); [put a reverse proxy with TLS in front of it](#putting-a-proxy-in-front) and set `SV_URL` to the
public address, with no path.

| Database                     | Command                                                                     | Needs                                |
| ---------------------------- | --------------------------------------------------------------------------- | ------------------------------------ |
| sqld (default)               | `docker compose up -d`                                                      | `SV_URL`, `SV_AUTH_SECRET`           |
| PostgreSQL                   | `docker compose -f docker-compose.yml -f docker-compose.postgres.yml up -d` | the above and `SV_POSTGRES_PASSWORD` |
| A SQLite file, one container | `docker compose -f docker-compose.sqlite.yml up -d`                         | `SV_URL`, `SV_AUTH_SECRET`           |

`.env` in the directory you run `docker compose` from is read for the variables above and passed on to core as it
stands, so it is also where the rest go: the mail server (`SV_SMTP_*`), `SV_FIELD_ENCRYPTION_KEYS`, and anything else
in the example. Secrets can be given as a file instead (`SV_AUTH_SECRET_FILE` and the others that take `_FILE`), which
suits Docker and Kubernetes secrets.

The database servers are not published: only core is reachable from outside the compose network. Their data lives in
named volumes (`sqld-data`, `postgres-data`, `core-data`), and so does anything you would want to back up.

To use core as the sign-in server for your apps, of any kind, see [Connecting an app](connecting-an-app.md).

## Putting a proxy in front

A public instance needs TLS, which core leaves to a reverse proxy. This is the whole of it with Caddy, which gets and
renews its own certificates. Point the name's DNS at the machine, open ports 80 and 443, and add two files beside the
compose file.

`Caddyfile`:

```text
core.example.com {
	reverse_proxy core:3000
}
```

`docker-compose.override.yml`, which `docker compose up -d` reads by itself:

```yaml
services:
  core:
    # Reached through the proxy only.
    ports: !reset []

  caddy:
    image: caddy:2
    restart: unless-stopped
    ports:
      - '80:80'
      - '443:443'
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy-data:/data
    networks:
      default:
        # Core's public name reaches the proxy from inside the network too (see below).
        aliases:
          - core.example.com

volumes:
  caddy-data:
```

Then, in `.env`:

- `SV_URL=https://core.example.com`
- `SV_AUTH_TRUSTED_PROXIES` set to the compose network's range, shown by `docker network inspect sovereign_default`.
  Sign-in limits count attempts per address, and without this they can count everyone behind the proxy as one.

**Leave `SV_AUTH_COOKIE_DOMAIN` unset**, also when apps run on subdomains of core's name. Apps sign in through core and
need no shared cookie. Setting a parent domain sends core's session cookie, which signs a person in to core, to every
host under that domain, whoever runs it. Left unset, and over https, core's cookies are host-only (the `__Host-` prefix):
a browser refuses to let any other host, an app on a subdomain included, set one that core would read as its own.

With another proxy the same things apply: forward to port 3000, pass `Host` and `X-Forwarded-For`, and leave `/sw.js` and
`/manifest.webmanifest` uncached.

## Core must be able to reach its own address

Core's public address, `SV_URL`, is the **issuer** apps sign in against, and core fetches its own signing keys from it
when it checks an `id_token_hint` (RP-initiated logout). So the address must work from inside core's container as well
as from your browser:

- `SV_URL=http://localhost:3000` already works, since core listens there. That is the right setting to try it out.
- Behind a reverse proxy on a public name, make that name reach the proxy from inside the container too. When the
  proxy is on the same machine, give core a host entry for the name:

  ```yaml
  services:
    core:
      extra_hosts:
        - 'core.example.com:host-gateway'
  ```

  When the proxy is another container, give it a network alias of the name on core's network instead, as the example
  above does.

`docker compose exec core node -e "fetch(process.env.SV_URL + '/api/auth/jwks').then(r => console.log(r.status))"`
should print `200`.

## The image

- Built from [`Dockerfile`](../Dockerfile) at the repository root: `docker build -t sovereign .`
- Multi-stage on `node:24-alpine`. The last stage holds only the server Next traced, its static files and the
  migrations, which core applies when it starts; there is no source, no dev dependency and no package manager in it.
- Runs as the unprivileged `node` user, listens on `3000`, and reports `/api/health` (the app and the database) to
  Docker. `/data` is a volume, for a SQLite file.
- `docker-compose.yml` and `docker-compose.sqlite.yml` can build it themselves (`docker compose build`), or pull
  the published one; `SV_IMAGE` names the image to use.
- It is published for `linux/amd64` and `linux/arm64`, tagged by version (`1.2.3`), by minor version (`1.2`) and
  `latest`. The compose files use `latest`, which moves only when you pull. To stay on a version until you choose to
  move, set `SV_IMAGE=ghcr.io/sovereignfs/sovereign:1.2.3` in `.env`.

`pnpm docker:smoke` builds the image and boots each of the three setups from it, signs the first account up and checks
the address above from inside; CI runs it on every pull request that changes code, and before every release.

## Installing core as an app

A browser can install core as an app: its own window, the instance's name and icon, a page of its own saying so when the
network is down. Nothing needs setting up beyond what sign-in already needs.

- **It needs https.** A browser offers to install a site, and lets it keep a service worker, only over https (or on
  `localhost`). Put the reverse proxy with TLS in front of core and set `SV_URL` to the `https` address, as above.
- **The proxy must not cache `/sw.js` or `/manifest.webmanifest`.** Core answers `/sw.js` with `Cache-Control: no-cache`
  so a new release reaches a browser on its next visit; a proxy that caches it holds an old worker for as long as it
  likes. Leave both paths alone (most proxies cache nothing unless told to).
- **Nothing of a person is stored for it.** The worker keeps only the built scripts, styles and fonts and the icons, which
  are the same for everyone; no page, no answer to an API call. Signing out, or lending the device, leaves nothing
  behind, and there is no setting for it.
- **The installed name follows the instance's name** in the Console's settings. Its icon is the Sovereign mark.
- **Apps open outside the window.** An installed core's window covers core's own address only. A tile in the launcher goes to
  an app on another address, which the device opens in the browser or in a view over the window, as it chooses; the
  sign-in the app starts with core comes back to the app the same way.

## Backing up and upgrading

- **sqld**: copy the `sqld-data` volume while sqld is stopped. **PostgreSQL**: `pg_dump` the `sovereign` database.
  **SQLite**: copy `core.db` from the `core-data` volume while core is stopped, or use `sqlite3 core.db ".backup"`.
- Keep `SV_AUTH_SECRET` and `SV_FIELD_ENCRYPTION_KEYS` with the backup: without the key ring a saved SMTP password
  cannot be read, and changing `SV_AUTH_SECRET` signs everyone out and ends every two-factor enrolment.
- To upgrade, pull a newer image and `docker compose up -d`. Migrations are applied at start-up, and only forward.
  Pin the database server images (they are pinned in the compose files) and upgrade them on purpose.

## Development

`pnpm dev` starts core from source on `:3000`. When `apps/core/.env` chooses sqld, it first starts the persistent sqld
from [`docker-compose.dev.yml`](../docker-compose.dev.yml) (ports `8080` and `8081`, on this machine only); with SQLite or
PostgreSQL chosen it starts only core. `pnpm seed` makes an owner, an admin and an ordinary person to try it with
(`owner@example.test`, `admin@example.test`, `user@example.test`, password `sovereign-dev-password`, or `SEED_PASSWORD`),
and refuses to run for any address that is not on this machine.
