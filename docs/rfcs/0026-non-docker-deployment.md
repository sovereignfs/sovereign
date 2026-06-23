# RFC 0026 — Non-Docker production deployment

**Status:** Accepted\
**Date:** June 2026\
**Author:** kasunben\
**Scope:** `bin/sv`, `docs/self-hosting.md`, `docs/examples/`, SRS §3.1; amends RFC 0006 (adds a non-Docker fallback path alongside the canonical Docker Compose model)\
**Incorporated into plan:** Yes — **Phase 1 (PM2)** as Task 0.5.30; **Phase 2 (systemd)** as epic task 0.13. SRS requirement IDs assigned during the implementation tasks.

---

## Summary

Define a **first-class non-Docker production path** for Sovereign, delivered in
two phases. Docker Compose remains the canonical deployment; this RFC makes the
fallback documented and supported rather than an undocumented improvisation.

**Phase 1 (pre-v1, Task 0.5.30):** PM2 as the single non-Docker path. A health-gate
is added to `sv serve`, a `sv setup pm2` command generates a ready-to-use
ecosystem config, and `docs/self-hosting.md` gains a "Non-Docker deployment"
section.

**Phase 2 (pre-v1, epic task 0.13):** systemd as the zero-extra-dependency Linux
alternative. `sv setup systemd` generates unit files; `docs/self-hosting.md`
gains a parallel systemd section alongside PM2.

## Motivation

RFC 0006 defines Docker Compose as the canonical deployment and briefly notes
"build from source" as a fallback for forks and air-gapped environments — but
does not specify a process manager, startup ordering, or any concrete procedure.
Four real-world scenarios make a first-class non-Docker path necessary:

1. **Shared hosting / managed VPS plans** that do not expose Docker (Hetzner
   shared, A2 Hosting, cPanel environments, etc.).
2. **ARM single-board computers** — Raspberry Pi, Synology NAS, QNAP — where
   multi-stage Docker builds are slow, architecturally awkward, or outright
   unsupported on older firmware.
3. **Air-gapped networks** where pulling images from GHCR is blocked and
   cross-compiling for a private registry is overkill.
4. **Operators fluent in native tools** — system administrators who manage dozens
   of services via systemd or PM2 and have no appetite for learning Compose for a
   single app.

The current `sv serve` command _technically_ runs both standalone servers, but
has no startup ordering (the runtime can start before auth is ready, causing
connection failures), no restart-on-crash, and no documented production posture.

## Current state (what this builds on)

- **`sv serve`** (`bin/sv.ts`): spawns `node runtime/.next/standalone/runtime/server.js`
  and `node apps/auth/.next/standalone/apps/auth/server.js` in parallel with mutual
  teardown on exit and SIGTERM forwarding. No startup ordering between the two
  processes.
- **Standalone output**: both apps set `output: 'standalone'` and
  `outputFileTracingRoot` to the monorepo root in their `next.config.ts`. Servers
  read `PORT` and `HOSTNAME` from env (the old `next start --port` flag is gone).
- **SQLite path resolution**: paths resolve against the process `cwd`, which in
  Docker is `/app` (the `WORKDIR`). In a native setup the operator must either
  run from the monorepo root or use absolute `DATABASE_URL`/`AUTH_DATABASE_URL`
  paths. `packages/db/src/client.ts`.
- **`SOVEREIGN_AUTH_URL`**: the runtime uses this to reach the auth server.
  Docker sets it to `http://auth:3001` (internal bridge alias). In a native
  same-host setup both servers are on localhost: `http://localhost:3001`.
- **Auth binding**: Docker exposes auth only on the internal `sovereign_net`
  bridge (no host port). On bare metal, binding auth to `127.0.0.1` instead of
  `0.0.0.0` achieves the same isolation — controlled by the `HOSTNAME` env var
  the standalone server reads.
- **Health endpoints**: `GET /api/health` (public liveness) on both servers,
  excluded from the session gate. Used by the Docker `HEALTHCHECK`; reused here
  for startup ordering and process-manager health probes.
- **RFC 0006 upgrade flow**: `sv backup` / `sv restore` (Task 0.5.14) applies
  unchanged. The pre-upgrade snapshot is the same procedure regardless of whether
  the container layer exists.

## Proposed design

### Phase 1 — PM2 (pre-v1, Task 0.5.30)

#### PM2 ecosystem config

`docs/examples/pm2.example.config.js` (committed reference; also the output of
`sv setup pm2` with default arguments):

```js
module.exports = {
  apps: [
    {
      name: 'sovereign-auth',
      script: 'apps/auth/.next/standalone/apps/auth/server.js',
      cwd: '/opt/sovereign',
      node_args: [],
      env: {
        NODE_ENV: 'production',
        PORT: '3001',
        HOSTNAME: '127.0.0.1',
      },
      restart_delay: 3000,
      max_restarts: 10,
    },
    {
      name: 'sovereign-runtime',
      script: 'runtime/.next/standalone/runtime/server.js',
      cwd: '/opt/sovereign',
      node_args: [],
      env: {
        NODE_ENV: 'production',
        PORT: '3000',
        HOSTNAME: '0.0.0.0',
      },
      restart_delay: 5000,
      max_restarts: 10,
    },
  ],
};
```

Load secrets and start:

```bash
set -a; source /etc/sovereign/env; set +a
pm2 start /opt/sovereign/docs/examples/pm2.example.config.js
pm2 save
pm2 startup   # prints the init-system hook command; run it as root
```

PM2 limitation: it has no built-in health-gate ordering between apps. The
`restart_delay` on the runtime is a soft workaround — if auth takes longer than
5 s to start, the runtime will crash-restart and pick up on the second attempt.
Operators who need hard ordering run `sv serve` as a single PM2-managed process
(see below).

#### `sv serve` as a single PM2 process

`sv serve` (with the health-gate improvement below) is itself a valid supervised
process — a single entry in the PM2 ecosystem that manages both servers internally:

```js
// PM2 — single-process variant
{ name: 'sovereign', script: 'bin/sv', args: 'serve', cwd: '/opt/sovereign' }
```

This is also the right choice on platforms with a minimal init system (supervisor,
runit, s6) that can manage only one process per service.

#### `sv serve` health-gate improvement

Before spawning the runtime process, `sv serve` polls
`http://127.0.0.1:${AUTH_PORT}/api/health` (port 3001 by default, derived from
`SOVEREIGN_AUTH_URL`) with a 30-second timeout and 2-second retry interval. Once
auth returns 200, the runtime process spawns. The wait is logged via
`consola.info`. On timeout, `sv serve` exits non-zero with a `consola.error`
message rather than starting a runtime that will immediately fail its first
request.

This improvement lands in Phase 1 and benefits Phase 2 as well.

#### `sv setup pm2` sub-command (Phase 1)

```
sv setup pm2 [--dir <install-dir>] [--env-file <path>]
```

Defaults: `--dir /opt/sovereign`, `--env-file /etc/sovereign/env`. Writes
`pm2.config.js` to the current working directory pre-filled with the
operator-supplied paths. Pure template-fill logic in `bin/helpers.ts`,
unit-tested. Idempotent (re-running overwrites).

---

### Phase 2 — systemd (pre-v1, epic task 0.13)

#### systemd unit files

Two unit files, committed as canonical examples in `docs/examples/` and generated
by `sv setup systemd`:

```ini
# docs/examples/sovereign-auth.service
[Unit]
Description=Sovereign Auth Server
After=network.target

[Service]
Type=simple
User=sovereign
Group=sovereign
WorkingDirectory=/opt/sovereign
EnvironmentFile=/etc/sovereign/env
Environment=NODE_ENV=production PORT=3001 HOSTNAME=127.0.0.1
ExecStart=/usr/bin/node apps/auth/.next/standalone/apps/auth/server.js
Restart=on-failure
RestartSec=5s
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

```ini
# docs/examples/sovereign-runtime.service
[Unit]
Description=Sovereign Runtime
After=network.target sovereign-auth.service
Requires=sovereign-auth.service

[Service]
Type=simple
User=sovereign
Group=sovereign
WorkingDirectory=/opt/sovereign
EnvironmentFile=/etc/sovereign/env
Environment=NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
ExecStartPre=/bin/sh -c \
  'until wget -qO- http://127.0.0.1:3001/api/health >/dev/null 2>&1; \
   do echo "Waiting for sovereign-auth..."; sleep 2; done'
ExecStart=/usr/bin/node runtime/.next/standalone/runtime/server.js
Restart=on-failure
RestartSec=5s
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

Key decisions:

- `User=sovereign` — dedicated non-root account, mirroring Docker's `nextjs`
  runner. Created with `useradd -r -s /sbin/nologin sovereign`.
- `WorkingDirectory=/opt/sovereign` — the monorepo root, so
  `file:./data/sovereign.db` resolves correctly (same logic as Docker's
  `WORKDIR /app`).
- `EnvironmentFile=/etc/sovereign/env` — systemd does not auto-load `.env` files.
  The operator writes all secrets here, owned root:root, mode 600.
- `HOSTNAME=127.0.0.1` on the auth unit — binds auth to loopback only.
- `ExecStartPre` health-poll on the runtime unit — waits until auth is actually
  healthy before the runtime process starts. Hard ordering, no restart-on-race
  needed.
- `Restart=on-failure` + `RestartSec=5s` — crash recovery on both units.
- Logs via `journalctl -u sovereign-auth` / `journalctl -u sovereign-runtime`.

Boot persistence:

```bash
systemctl enable sovereign-auth sovereign-runtime
systemctl start sovereign-auth sovereign-runtime
```

#### `sv setup systemd` sub-command (Phase 2)

```
sv setup systemd [--user <user>] [--dir <install-dir>] [--env-file <path>]
```

Defaults: `--user sovereign`, `--dir /opt/sovereign`,
`--env-file /etc/sovereign/env`. Writes the two unit files to the current
directory; operator copies them to `/etc/systemd/system/` and runs
`systemctl daemon-reload`. Pure template-fill in `bin/helpers.ts`, unit-tested.

---

### Common: environment variable differences

### Environment variable differences (both phases)

| Variable                  | Docker value                 | Non-Docker value                                                                           |
| ------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------ |
| `SOVEREIGN_AUTH_URL`      | `http://auth:3001`           | `http://127.0.0.1:3001`                                                                    |
| `AUTH_BASE_URL`           | `http://auth:3001`           | `http://127.0.0.1:3001`                                                                    |
| `NEXT_PUBLIC_RUNTIME_URL` | public URL                   | same — public URL                                                                          |
| `DATABASE_URL`            | `file:./data/sovereign.db`   | `file:./data/sovereign.db` (cwd-relative if `WorkingDirectory` is set) or an absolute path |
| `AUTH_DATABASE_URL`       | `file:./data/auth.db`        | same caveat as above                                                                       |
| `HOSTNAME` (runtime)      | `0.0.0.0` (Docker sets this) | `0.0.0.0` (reverse proxy in front)                                                         |
| `HOSTNAME` (auth)         | container-internal           | `127.0.0.1` (loopback-only, never public)                                                  |

Note: `SOVEREIGN_AUTH_URL` must **not** be set in `.env` when using Docker Compose
(the Compose file injects the Docker service alias). Non-Docker deployments set
it to the loopback address. The two configs are mutually exclusive; operators
should maintain separate env files for each context.

### Reverse proxy

Unchanged from RFC 0006. Caddy, nginx, or Traefik terminates TLS and proxies to
`http://127.0.0.1:3000` (the runtime). Auth on port 3001 is never proxied
externally — its `HOSTNAME=127.0.0.1` binding enforces this at the OS level.
`docs/self-hosting.md` already has reverse-proxy snippets for all three tools;
the non-Docker section references them.

### Build and upgrade

**Build**: from the monorepo root, `pnpm install && pnpm build`. The standalone
output lands at:

```
runtime/.next/standalone/runtime/server.js
apps/auth/.next/standalone/apps/auth/server.js
```

The public PWA assets (`runtime/public/`) must be present for the runtime to
serve them; `pnpm build` places them in the repo and the standalone server serves
them from `WorkingDirectory`.

**Upgrade** (no `docker compose pull`):

```bash
sv backup                          # pre-upgrade snapshot (RFC 0006 / Task 0.5.14)
git pull
pnpm install --frozen-lockfile
pnpm build
pm2 restart all                    # Phase 1 (PM2)
# or: systemctl restart sovereign-auth sovereign-runtime   # Phase 2 (systemd)
```

The same expand-contract migration discipline from RFC 0006 applies. The
`runMigrations()` runner (Task 0.5.14) fires on startup inside each server
process, so both apps self-migrate on restart.

### Data directory

```
/opt/sovereign/
├── data/
│   ├── sovereign.db      (runtime platform DB)
│   ├── auth.db           (auth server identity DB)
│   └── avatars/          (user avatar uploads)
└── ...
```

The `data/` directory must be owned by `sovereign:sovereign` and mode 750.
Avatar uploads are served by `/api/account/avatar/[userId]` and read from
`data/avatars/` relative to cwd — same layout as Docker's named volume.

## Alternatives considered

**Enhance `sv serve` into a production-grade process manager.** Writing crash
recovery, log rotation, and boot persistence into `sv serve` would duplicate PM2
and systemd. The CLI is already documented as a thin orchestrator (RFC 0006,
CLAUDE.md). Better to delegate to the right tool and generate its config.

**Docker outside of Compose (bare `docker run`).** Avoids Compose's learning
curve but still requires Docker, which is the same blocker. Not materially
different from the existing path for the target scenarios.

**nohup / screen / tmux.** Available everywhere but offer no restart-on-crash or
boot integration. Acceptable only for ephemeral testing; not suitable for
production. Documented as explicitly unsupported.

**Node.js cluster / single-binary.** The two-process model (separate auth and
runtime) is a load-bearing architectural decision (SRS §3.3) — better-auth owns
its own process, database, and cookie scope. Merging them is a breaking redesign,
not a deployment option.

## Open questions

1. **Node.js version management.** The host Node.js must match the build version
   (24.x). Should the docs mandate a specific version manager (nvm, fnm, volta)
   or just state the major version requirement?
2. **Postgres under non-Docker.** Postgres itself would also run as a native
   service; should the docs include a `sovereign-postgres.service` example
   (Phase 2) or refer operators to standard Postgres installation guides?
3. **Windows support (Phase 1).** PM2 runs on Windows. Should the docs
   explicitly state Windows production is unsupported, or include a brief note
   on running it as a Windows Service via NSSM?

## Adoption path

- **This RFC** lands in `docs/rfcs/` as a Draft.
- **Phase 1 — Task 0.5.30 (pre-v1):** `sv serve` health-gate, `sv setup pm2`,
  `docs/examples/pm2.example.config.js`, "Non-Docker deployment (PM2)" section in
  `docs/self-hosting.md`, SRS §3.1 PM2 addition.
- **Phase 2 — epic task 0.13 (pre-v1):** `sv setup systemd`, systemd unit files in
  `docs/examples/`, "Non-Docker deployment (systemd)" section in
  `docs/self-hosting.md`, SRS §3.1 systemd note.
- **Dependencies**: `sv serve` exists (Task 0.5.4). `sv backup`/`restore`
  (Task 0.5.14) is referenced in the upgrade procedure but is not a blocker.
- **Semver**: `bin/sv` is a monorepo-internal CLI. No semver impact. `docs/`
  changes carry no version bump.

## Changelog

| Version | Date      | Change                                                         |
| ------- | --------- | -------------------------------------------------------------- |
| 0.1     | June 2026 | Initial draft                                                  |
| 0.2     | June 2026 | Split into Phase 1 (PM2, pre-v1) and Phase 2 (systemd, pre-v1) |
