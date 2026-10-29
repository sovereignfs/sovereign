# Deploying core

Core ships as one image, `ghcr.io/sovereignfs/sovereign-core`, and three ways to run it with a database. Nothing is
baked into the image: it holds no environment file, and it refuses to start, saying what is missing, until it is
given `SV_URL` and `SV_AUTH_SECRET`. Every variable core reads is in
[`apps/core/.env.example`](../apps/core/.env.example), and [`spec/env.md`](../spec/env.md) says how they work.

## Quick start

```bash
cp apps/core/.env.example .env
# Edit .env: set SV_URL (core's public address) and SV_AUTH_SECRET (openssl rand -base64 48).
docker compose up -d
```

That is sqld, the default. The first account to sign up becomes the owner. Core listens on `3000` (change the published
port with `SV_PORT`); put a reverse proxy with TLS in front of it and set `SV_URL` to the public address, with no path.

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

  When the proxy is another container, give it a network alias of the name on core's network instead.

`docker compose exec core node -e "fetch(process.env.SV_URL + '/api/auth/jwks').then(r => console.log(r.status))"`
should print `200`.

## The image

- Built from [`Dockerfile`](../Dockerfile) at the repository root: `docker build -t sovereign-core .`
- Multi-stage on `node:24-alpine`. The last stage holds only the server Next traced, its static files and the
  migrations, which core applies when it starts; there is no source, no dev dependency and no package manager in it.
- Runs as the unprivileged `node` user, listens on `3000`, and reports `/api/health` (the app and the database) to
  Docker. `/data` is a volume, for a SQLite file.
- `docker-compose.yml` and `docker-compose.sqlite.yml` can build it themselves (`docker compose build`), or pull
  the published one; `SV_IMAGE` names the image to use.

`pnpm docker:smoke` builds the image and boots each of the three setups from it, signs the first account up and checks
the address above from inside; CI runs it on every change.

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
