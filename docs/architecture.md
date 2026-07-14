---
docSection: architecture-security
docType: reference
audiences:
  - operator
  - app-developer
  - contributor
---

# Architecture

A contributor-oriented summary of how Sovereign fits together. It distils the
platform architecture into public documentation. For building plugins see
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
standalone output. A PM2-based non-Docker path is also supported (RFC 0026,
`sv setup pm2`).

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
The first registered user becomes `platform:owner`; subsequent users become
`platform:user`.

**MFA (RFC 0012):** better-auth's `twoFactor` plugin handles TOTP (authenticator
app + 10 backup codes) and `@better-auth/passkey` handles WebAuthn passkeys. Both
are opt-in per user; passkeys also work as a passwordless login path. The Account
plugin's Security tab manages enrollment; Console → Users provides an admin
"Reset MFA" action, and `sv user reset-mfa <email>` is the CLI break-glass for
SQLite instances.

## Runtime (SRS §3.4)

The middleware is the gate: it authenticates the request, injects the verified
user as `x-sovereign-user-*` headers for downstream server components, enforces
`adminOnly` (403), disabled-plugin (404), and paywalled-plugin (303/402) rules,
and serves the configured root plugin at `/`. Plugin routes are composed into the
App Router at build time.

**Capabilities** flow from two sources: platform-role presets (11 built-in
capabilities derived from the user's role, RFC 0021) and plugin-declared
capabilities with `defaultGrant: "all"` (injected from the generated
`plugin-capabilities.ts`, RFC 0022). Both are serialised into the
`x-sovereign-user-capabilities` header so `sdk.auth.hasCapability` can resolve
them synchronously in any server component or route handler without a DB call.

**Platform roles (RFC 0021):** four presets — `platform:owner` (full, including
`role:assign`), `platform:admin` (full except role assignment), `platform:auditor`
(read-only Console), `platform:user` (basic access). The first user becomes owner;
existing admin-only instances are migrated on first startup.

**Production dev-mode (RFC 0020):** when `SOVEREIGN_DEV_MODE_ENABLED=true`, a
request carrying the correct `X-Sovereign-Dev-Mode-Secret` header routes SDK DB
calls to a mock database for that request only — real requests run unaffected. The
response is stamped with `x-sovereign-dev-mode: active`. A structured logger
(`LOG_LEVEL`) writes newline-delimited JSON to stdout.

## Plugin system & manifest (SRS §3.5, §3.8, §3.9)

Each plugin ships a strict `manifest.json` (validated at build — invalid manifest
fails the build) and an `app/` tree. The generate step composes `app/` into the
runtime under the manifest's `routePrefix` as **copies** (not symlinks; Next's
dev route watcher doesn't follow symlinked route dirs), git-ignored, with
`plugins/<id>/` as the source of truth. The SDK (`@sovereignfs/sdk`) is the only
plugin↔platform contract, enforced by an ESLint import-boundary rule.

**Shell modes:** `default` (full chrome sidebar), `overlay` (plugin renders as a
dialog over the current page, with a full-page fallback on hard navigation — RFC
0001), `minimal` (chrome-free full-bleed — RFC 0014). Console and Account use
`overlay`; a kiosk plugin can use `minimal` and is still eligible as the root
plugin.

**Plugin compatibility (RFC 0024):** `manifest.json` carries `schemaVersion` and
optional `compatibility.minPlatformVersion` / `maxPlatformVersion`. The generate
script rejects incompatible plugins at build; `sv plugin add` rejects at install;
boot disables them and surfaces the reason in Console / `/api/admin/health`.

**Plugin capabilities (RFC 0022):** plugins declare optional `capabilities` (a
record of kebab-case local names) in `manifest.json`. The platform auto-namespaces
them to `<pluginId>:<capName>`; those with `defaultGrant: "all"` are injected into
every session by the middleware. Plugin-level enforcement lives inside the plugin
via `sdk.auth.hasCapability`.

**Plugin monetization (RFC 0003):** plugins declare a `monetization` object
(`model`, `tiers`, `license.publicKey`). The middleware paywalls plugin routes for
users lacking a valid entitlement and redirects to `/paywall/<pluginId>`. Operators
import signed Ed25519 license tokens into Account → Billing; Console → Entitlements
shows all grants. Key generation and signing run client-side in Console with
`crypto.subtle`; private keys can be stored on the instance.

**Plugin-scoped env vars (RFC 0018):** plugins declare an `env` map in
`manifest.json`; keys are auto-namespaced to `SV_PLUGIN_<SLUG>_<KEY>` (runtime)
or `NEXT_PUBLIC_SV_PLUGIN_<SLUG>_<KEY>` (build). `sdk.env.get('KEY')` reads only
the calling plugin's own vars.

## Database (SRS §3.7)

Drizzle ORM, dialect-agnostic: SQLite by default, Postgres via env. The default
model shares one schema with **slug-prefixed** plugin tables (`tasks_lists`).
`tenant_id` is present on user-scoped tables from day one for future multi-tenancy.
The platform data layer is **async** (Postgres has no synchronous query), so
platform DB reads and `sdk.db`/`sdk.platform` return promises.

**Per-plugin isolated databases (RFC 0004):** plugins that set `"database":
"isolated"` get a dedicated store — `data/plugins/<pluginId>.db` on SQLite, or a
separate `plugin_<slug>` Postgres schema. Migration runner routes each plugin's
`migrations/{sqlite,postgres}/` to its own store. `sdk.db.getClient()` is
transparent; `sv plugin remove` drops the store (opt-out: `--keep-data`).

## SDK (SRS §3.6)

`@sovereignfs/sdk` exposes:

- **Stable (v1 guarantee, NFR-04):** `auth`, `db`, `mailer`, `platform`.
- **Implemented, experimental:** `data` (cross-plugin data sharing, RFC 0002),
  `activity` (activity log, RFC 0005), `portability` (user data export/import,
  RFC 0007), `env` (plugin-scoped env vars, RFC 0018), `notifications` (in-app
  notification delivery, RFC 0015).
- **Reserved (throw `NotImplementedError` until their backing mechanisms ship):**
  `storage`, `events`, `billing` (stub only; full payment flow is post-v1,
  Task 1.0.2).

The package is published to npm with zero runtime dependencies — implementations
are host-provided by the runtime at startup via `provideHost()`, so plugins can
type-check and lint in isolation without a full platform checkout. `DrizzleClient`
is kept opaque so the published SDK takes no dialect dependency.

## Notifications & Web Push (RFC 0015, RFC 0016)

A per-user `notifications` table stores in-app inbox items. `sdk.notifications.send()`
is the plugin-facing send surface; the runtime fans out to the inbox, fires toasts
for active sessions (polled every 30 s, or via SSE), and optionally delivers Web
Push (background, when VAPID keys are configured). Console admins can broadcast
announcements to all users or a subset, rate-limited to once per 60 s. Users
control per-category muting and push opt-in in Account → Notifications. Push
subscriptions are pruned automatically on `410 Gone`.

## Activity log (SRS §3.14, RFC 0005)

The `activity_log` table records platform and plugin actions. `sdk.activity.log()`
is fire-and-forget; the runtime stamps actor, plugin, and tenant from request
headers. Personal activity appears in Account → Activity; platform-wide history
(with actor/action/scope filters) in Console → Activity. Login capture is deferred
(Edge middleware cannot write the platform DB).

## Cross-plugin data sharing (SRS §3.13, RFC 0002)

A consent-gated, pull-based, read-only sharing mechanism. Provider plugins call
`sdk.data.provide(contract, resolver)`; consumer plugins call `sdk.data.query(ref,
params)` — the runtime checks consent grants in the `consent_grants` table and logs
access to `data_access_log`. Users manage (and revoke) grants in Account → Data.

## User data portability (SRS §3.16, RFC 0007)

`GET /api/account/export` streams a versioned ZIP; `POST /api/account/import`
applies it additively with ID remapping. Plugin participation is opt-in via
`sdk.portability.provideExport` / `provideImport` and the `data:export` /
`data:import` manifest permissions. Import remaps IDs (no FK breakage) and skips
unknown or non-permitted plugin sections with a per-section warning.

## White-labeling, Phase 1 (RFC 0027, RFC 0032)

Operators can replace Sovereign's visual identity via Console → Settings → Branding.
The `instance_config` table stores instance name, primary colour (hex), logo and
favicon URLs. `InstanceProvider` (server component in `runtime/src/instance-provider.tsx`)
reads this at render time, injects `--sv-instance-*` CSS custom properties at `:root`,
and derives `--sv-color-accent` from the primary colour. `INSTANCE_*` env vars supply
deployment-level defaults. `sdk.platform.getConfig()` exposes `instanceName`,
`instancePrimaryColor`, and the stable `instanceId` UUID. Phases 2 (branded email +
auth login page) and 3 (dynamic PWA manifest) are post-v1.

## PWA (SRS §3.11)

The runtime is an installable PWA. The web manifest and icons are committed
source; the service worker is generated at build and disabled in dev. An
`OfflineBanner` client component surfaces soft-offline state (network dropped
while the user is on a page); the `/offline` route covers the hard-offline
navigation fallback.

## Security (SRS §3.17, RFC 0008)

v1 ships the hardening tiers: static security headers + HSTS (production) via
each app's `next.config.ts`, and a **strict, nonce-based Content-Security-Policy**
set per-request in middleware (no `'unsafe-inline'` for scripts). Postgres
connects over TLS from the connection string's `sslmode`. Sovereign sends **no
telemetry**. Threat model and a self-hoster hardening checklist live in
[security.md](security.md). At-rest, field-level, and zero-knowledge encryption
(Tiers 2–4) are specified but post-v1 (Task 1.0.1).

## Post-v1 (specified, not built)

Native mobile via a Capacitor shell + `sdk.device.*` (SRS §3.12), and at-rest /
field-level / zero-knowledge encryption (SRS §3.17 Tiers 2–4, RFC 0008) are
designed but out of scope for v1. White-labeling Phases 2–3 (branded email + auth
login page + dynamic PWA manifest) are also deferred (Tasks 1.0.04–1.0.05).

## Design proposals (RFCs)

Cross-cutting design decisions are recorded as RFCs in [`docs/rfcs/`](rfcs/README.md).
See the [RFC index](rfcs/README.md) for the status of each at a glance.

## Repository layout

See the monorepo structure in the
[README](https://github.com/sovereignfs/sovereign#monorepo-layout).
