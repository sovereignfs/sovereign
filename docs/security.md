---
docSection: architecture-security
docType: reference
audiences:
  - user
  - operator
  - app-developer
  - contributor
---

# Security

This document describes Sovereign's **security posture** — the threat model, the
hardening that ships in v1, and a checklist for self-hosters. It complements
[`SECURITY.md`](https://github.com/sovereignfs/sovereign/blob/main/SECURITY.md)
(vulnerability disclosure) and implements
[RFC 0008](rfcs/0008-security-encryption-architecture.md) / SRS §3.17.

Sovereign is **self-hosted and privacy-first**: you run it, you own the data.

## No telemetry

Sovereign sends **no analytics, telemetry, or usage data** anywhere. There is no
outbound "phone home", no third-party scripts, and no tracking. The only network
calls a deployment makes are the ones you configure: the database, the SMTP
server (if email is enabled), and the browser ↔ your instance. This is a
guarantee, not a default you can toggle.

## Logging and telemetry

Sovereign's structured logger (RFC 0020) writes newline-delimited JSON to the
process's own **stdout/stderr** — controlled by the `LOG_LEVEL` env var (`warn`
by default). No log data is sent to any third party. Operators read logs via
`docker logs`, `journalctl`, or their own log aggregator on the same host.

This is **logging, not telemetry**: everything stays on the operator's
infrastructure. The no-telemetry guarantee is intact — the distinction is where
the data goes, not whether it exists.

## Production dev-mode isolation

The optional [production dev-mode](self-hosting.md#production-dev-mode-rfc-0020)
feature routes platform database reads and writes for a single request to a mock
database, leaving all other concurrent requests unaffected. The isolation
properties that make this safe to run on a live instance:

- **Off unless explicitly enabled.** `SOVEREIGN_DEV_MODE_ENABLED` must be `true`;
  without it the `X-Sovereign-Dev-Mode-Secret` header is silently ignored.
- **Secret-gated per request.** Switching to the mock DB requires both a valid
  session cookie (authenticated caller) and the `SOVEREIGN_DEV_MODE_SECRET` header.
- **Per-request, never global.** The mock client is selected inside
  `getPlatformDb()` by reading the forwarded `x-sovereign-dev-mode` request header
  for that request's Next.js context only. A concurrent real-user request with no
  such header sees the production database as normal.
- **Hard isolation between clients.** The mock DB is a separate Drizzle
  `createClient()` instance. There is no code path from a dev-mode request back to
  the production `PlatformDb` singleton.
- **Audited.** Every activation is logged as a JSON line (level `info`) to server
  stdout, including the user ID and path, so operators can review usage via
  `docker logs`.

## Threat model

Security controls are only meaningful against a stated adversary. **Assets:** the
identity database (`auth.db`), the platform database (`sovereign.db`), plugin
data, avatars/blobs, backups, secrets, and live sessions.

| Threat                                     | Addressed by                                                                             | Ships in                                | Residual risk                                                                                                           |
| ------------------------------------------ | ---------------------------------------------------------------------------------------- | --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Network sniffing / MITM                    | Transport: TLS/HSTS at the edge, Postgres SSL                                            | **v1**                                  | Endpoint compromise.                                                                                                    |
| XSS / injected scripts                     | Strict nonce-based CSP + security headers                                                | **v1**                                  | A bug that echoes a valid nonce.                                                                                        |
| Clickjacking                               | `X-Frame-Options: DENY` + `frame-ancestors 'none'`                                       | **v1**                                  | —                                                                                                                       |
| Stolen or guessed password                 | TOTP / passkey second factor (opt-in per user)                                           | **v1**                                  | Users who haven't enrolled MFA have password-only auth.                                                                 |
| Forged session cookie                      | HMAC-signed cookie cache; Argon2id passwords (better-auth)                               | **v1**                                  | Stolen live cookie from a compromised device.                                                                           |
| Compromised / curious plugin               | SDK boundary (plugins can't import runtime internals)                                    | **v1**                                  | A plugin still sees its own users' data.                                                                                |
| Stolen disk / leaked backup / VPS snapshot | At-rest encryption (DB / backup / blob)                                                  | post-v1 (Task 1.0.1)                    | Until then, rely on host-level disk encryption.                                                                         |
| Curious/malicious host or hosting provider | Field-level encryption; opt-in client-side encryption (RFC 0060) for plugins that use it | **v1 (opt-in)** / post-v1 (field-level) | Only data a plugin explicitly encrypts client-side is protected; most data still relies on host-level protection in v1. |
| RCE / compromised server process           | Client-side encryption (RFC 0060) for the specific objects a plugin protects this way    | **v1 (opt-in, partial)**                | Data not passed through client-side encryption is still readable by an attacker with code execution.                    |

**Honest framing.** v1 ships Tiers 0–1 of RFC 0008 (hardening + transport) plus
Tier 4 (client-side/zero-knowledge encryption, RFC 0060) as an **opt-in
capability** — the runtime and server-side plugin code can never decrypt an
object a plugin chose to protect this way, even with full server access. It is
not a blanket guarantee: most platform and plugin data is **not** encrypted at
rest by default, so anyone who can read the server's disk or a raw backup can
still read the bulk of it. Protect the host accordingly (see the checklist).
At-rest and field-level encryption for the rest of the data model are
specified and deferred to Task 1.0.1.

## What v1 enforces

- **Security headers on every response** (both the runtime and the auth app):
  - `Content-Security-Policy` — strict and **nonce-based**: inline scripts run
    only with a per-request nonce (set in middleware); no `'unsafe-inline'` for
    scripts. `object-src 'none'`, `base-uri 'self'`, `frame-ancestors 'none'`.
  - `Strict-Transport-Security` (production only) — `max-age` 2 years,
    `includeSubDomains; preload`.
  - `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`,
    `Referrer-Policy: strict-origin-when-cross-origin`,
    `Permissions-Policy` (camera/microphone/geolocation/topics disabled).
- **No secrets with defaults.** `AUTH_SECRET` / `SOVEREIGN_AUTH_SECRET`,
  `SOVEREIGN_ADMIN_KEY`, and vault encryption keys have no plaintext fallback.
  Features that require them fail closed when unset.
- **Session cookies** are `httpOnly`; the signed `session_data` cache cookie is
  HMAC-verified offline and carries `Secure` in production (`__Secure-` prefix).
- **Transport:** Postgres connects over TLS when the connection string sets
  `sslmode` (see below); the public edge must terminate TLS with HSTS.
- **Login rate limiting** is active in all environments (dev + production): the
  auth server enforces 3 sign-in attempts per 10 seconds per IP address and 3
  password-reset requests per 60 seconds per IP (via better-auth's built-in
  per-path rate limiter). Responses above the limit return `429 Too Many Requests`
  with an `X-Retry-After` header. Rate limiting is stored in-memory per process
  (sufficient for single-instance deployments); a shared secondary storage (e.g.
  Redis) would be needed for multi-instance setups.
- **Email verification is required by default** (`AUTH_REQUIRE_EMAIL_VERIFICATION=true`).
  A new account must click an emailed link before it can sign in; registration
  does not grant a session until then. Operators can disable this
  (`AUTH_REQUIRE_EMAIL_VERIFICATION=false`) for air-gapped/internal deployments.
  Accounts that existed before this shipped are grandfathered automatically —
  the requirement only applies to new registrations.
- **Console-managed SMTP settings (platform:owner only)**: an owner can view
  and change SMTP host/port/user/password/from-address from Console → Settings,
  with changes taking effect immediately (no restart). The password is
  encrypted at rest with the same AES-256-GCM scheme (`SOVEREIGN_VAULT_KEY`)
  used by the plugin secret vault — never stored in plaintext, never logged,
  never returned to the client after saving (the form shows only whether a
  password is set, not its value). Non-owners see the current settings
  read-only and cannot save or send a test email.
- **Client-side encryption (RFC 0060) has no operator recovery path, by
  design.** A user unlocks their Client Master Key with a recorded recovery
  secret or an already-enrolled device — the server never holds a plaintext
  copy or an escrow key. **Resetting a user's password does not recover their
  encrypted data**; a lost recovery secret plus every enrolled device being
  lost means that data is permanently unrecoverable, for anyone, including the
  operator. Account deletion removes all client-side encryption material
  (profile, recovery wrapper, device enrollments) unconditionally — this is
  always safe, since none of it is ever plaintext. Account export includes
  this same wrapped material (still ciphertext-only) so a user's ability to
  unlock their data can travel with a data export/migration, provided they
  still have their recovery secret.

## Self-hoster hardening checklist

- [ ] **Terminate TLS at a reverse proxy** (Caddy/nginx/Traefik) and redirect
      HTTP → HTTPS. See [self-hosting.md](self-hosting.md#reverse-proxy). HSTS is
      emitted automatically by the apps in production.
- [ ] **Generate strong secrets** (`openssl rand -base64 32`) for `AUTH_SECRET`
      and `SOVEREIGN_ADMIN_KEY`; never reuse or commit them.
- [ ] **Encrypt the host disk / volume** — v1 does not encrypt data at rest, so
      this is your protection for a stolen disk or snapshot.
- [ ] **Use Postgres over TLS** for non-local databases: add `?sslmode=require`
      (or `verify-full` with a CA) to `DATABASE_URL` / `AUTH_DATABASE_URL`.
- [ ] **Enable MFA for all admin accounts** — enroll TOTP or a passkey from
      Account → Security. MFA is opt-in; admins are not automatically required to
      use it in v1. Until mandatory-MFA enforcement lands, treat admin enrollment
      as a manual policy step.
- [ ] **Restrict network exposure** — only the reverse proxy should be public;
      keep the auth server, database, and Mailpit on the internal network.
- [ ] **Configure `SMTP_HOST`** if you keep `AUTH_REQUIRE_EMAIL_VERIFICATION` at
      its default (`true`) — without SMTP, new registrations fail closed rather
      than issuing an unverifiable account.
- [ ] **Keep backups encrypted and off-host**, and test restores.
- [ ] **Update regularly** and watch the repository's security advisories.

## Reporting a vulnerability

See
[`SECURITY.md`](https://github.com/sovereignfs/sovereign/blob/main/SECURITY.md).
Please do not file public issues for security reports.
