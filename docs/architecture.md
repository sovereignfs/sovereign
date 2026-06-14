# Architecture

A contributor-oriented summary of how Sovereign fits together. It distils the
authoritative specification in
[sovereign-proposal-plan-srs.md](sovereign-proposal-plan-srs.md) §3 — follow the
section links for the full detail and rationale. For building plugins see
[plugin-development.md](plugin-development.md); for running an instance see
[self-hosting.md](self-hosting.md).

## What Sovereign is

A modular, self-hostable workspace runtime. A shared platform — auth, database,
email, UI — hosts installable **plugins** as first-class apps. The plugin system
_is_ the product. v1 is single-tenant, multi-user, privacy-first.

## Deployment model (SRS §3.1)

Two Next.js apps behind one public entry point:

- **runtime** (`runtime/`) — the platform shell, middleware, plugin host, and
  SDK bridge. The only publicly-exposed service.
- **auth** (`apps/auth/`) — a self-contained better-auth server owning the
  identity database and login UI. Not mapped to a public port; reached over the
  internal network (and behind one reverse proxy in production, so the session
  cookie is shared by host).

Docker Compose is the canonical deployment. Production images build from Next.js
standalone output.

## Layer overview (SRS §3.2)

```
Browser → runtime (shell, middleware, plugins)
              │  sdk.auth · sdk.db · sdk.mailer · sdk.platform
              ├─ auth server (better-auth)         identity
              ├─ Drizzle DB (SQLite | Postgres)    platform + plugin data
              └─ mailer (SMTP)                      email
```

## Auth (SRS §3.3, §3.10; AUTH-05/06)

better-auth manages sessions via an httpOnly, host-scoped cookie. The runtime
middleware verifies each request **locally** from better-auth's signed
`session_data` cookie cache (HMAC with the shared `AUTH_SECRET`), avoiding a
round-trip per request; it falls back to the auth server's `/api/verify` when no
cache cookie is present, forwarding the refreshed cookie so the cache self-heals.
The first registered user becomes `platform:admin`; everyone else is
`platform:user`.

## Runtime (SRS §3.4)

The middleware is the gate: it authenticates the request, injects the verified
user as `x-sovereign-user-*` headers for downstream server components, enforces
`adminOnly` (403) and disabled-plugin (404) rules, and serves the configured
root plugin at `/`. Plugin routes are composed into the App Router at build time.

## Plugin system & manifest (SRS §3.5, §3.8, §3.9)

Each plugin ships a strict `manifest.json` (validated at build — invalid manifest
fails the build) and an `app/` tree. The generate step composes `app/` into the
runtime under the manifest's `routePrefix` as **copies** (not symlinks; Next's
dev route watcher doesn't follow symlinked route dirs), git-ignored, with
`plugins/<id>/` as the source of truth. The SDK (`@sovereignfs/sdk`) is the only
plugin↔platform contract, enforced by an ESLint import-boundary rule.

## Database (SRS §3.7)

Drizzle ORM, dialect-agnostic: SQLite by default, Postgres via env. One shared
schema with **slug-prefixed** plugin tables (`tasks_lists`), no per-plugin
databases in v1. `tenant_id` is present on user-scoped tables from day one for
future multi-tenancy. The platform data layer is **async** (Postgres has no
synchronous query), so platform DB reads and `sdk.db`/`sdk.platform` return
promises.

## SDK (SRS §3.6)

`@sovereignfs/sdk` exposes `auth`, `db`, `mailer`, `platform` (implemented) and
`storage`, `notifications`, `events`, `data` (reserved, post-v1). It is published
to npm as a public contract for plugin developers; `DrizzleClient` is kept
opaque so the published SDK takes no dialect dependency.

## PWA (SRS §3.11)

The runtime is an installable PWA. The web manifest and icons are committed
source; the service worker is generated at build and disabled in dev.

## Post-v1 (specified, not built)

Native mobile via a Capacitor shell + `sdk.device.*` (SRS §3.12) and
consent-gated cross-plugin data sharing via `sdk.data` (SRS §3.13, RFC 0002) are
designed but out of scope for v1.

## Repository layout

See the monorepo structure in the [README](../README.md#monorepo-layout) and the
detailed breakdown in SRS §2.3.
