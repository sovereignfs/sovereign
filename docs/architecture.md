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

**Capabilities** flow from two sources: platform-role presets (11 built-in
capabilities derived from the user's role, RFC 0021) and plugin-declared
capabilities with `defaultGrant: "all"` (injected from the generated
`plugin-capabilities.ts`, RFC 0022). Both are serialised into the
`x-sovereign-user-capabilities` header so `sdk.auth.hasCapability` can resolve
them synchronously in any server component or route handler without a DB call.

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

`@sovereignfs/sdk` exposes:

- **Stable (v1 guarantee, NFR-04):** `auth`, `db`, `mailer`, `platform`.
- **Implemented, experimental:** `data` (cross-plugin data sharing, RFC 0002),
  `activity` (activity log, RFC 0005), `portability` (user data export/import,
  RFC 0007), `env` (plugin-scoped env vars, RFC 0018).
- **Reserved (throw `NotImplementedError` until their backing mechanisms ship):**
  `storage`, `notifications`, `events`.

The package is published to npm with zero runtime dependencies — implementations
are host-provided by the runtime at startup via `provideHost()`, so plugins can
type-check and lint in isolation without a full platform checkout. `DrizzleClient`
is kept opaque so the published SDK takes no dialect dependency.

## PWA (SRS §3.11)

The runtime is an installable PWA. The web manifest and icons are committed
source; the service worker is generated at build and disabled in dev.

## Security (SRS §3.17, RFC 0008)

v1 ships the hardening tiers: static security headers + HSTS (production) via
each app's `next.config.ts`, and a **strict, nonce-based Content-Security-Policy**
set per-request in middleware (no `'unsafe-inline'` for scripts). Postgres
connects over TLS from the connection string's `sslmode`. Sovereign sends **no
telemetry**. Threat model and a self-hoster hardening checklist live in
[security.md](security.md). At-rest, field-level, and zero-knowledge encryption
(Tiers 2–4) are specified but post-v1 (Task 1.0.01).

## Post-v1 (specified, not built)

Native mobile via a Capacitor shell + `sdk.device.*` (SRS §3.12), the
Notification Center (RFC 0015), Web Push (RFC 0016), and at-rest / field-level /
zero-knowledge encryption (SRS §3.17 Tiers 2–4, RFC 0008) are designed but out
of scope for v1.

## Design proposals (RFCs)

Cross-cutting design decisions are recorded as RFCs in [`docs/rfcs/`](rfcs/README.md).
See the [RFC index](rfcs/README.md) for the status of each at a glance.

## Repository layout

See the monorepo structure in the [README](../README.md#monorepo-layout) and the
detailed breakdown in SRS §2.3.
