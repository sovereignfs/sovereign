# Security

This document describes Sovereign's **security posture** — the threat model, the
hardening that ships in v1, and a checklist for self-hosters. It complements
[`SECURITY.md`](../SECURITY.md) (vulnerability disclosure) and implements
[RFC 0008](rfcs/0008-security-encryption-architecture.md) / SRS §3.17.

Sovereign is **self-hosted and privacy-first**: you run it, you own the data.

## No telemetry

Sovereign sends **no analytics, telemetry, or usage data** anywhere. There is no
outbound "phone home", no third-party scripts, and no tracking. The only network
calls a deployment makes are the ones you configure: the database, the SMTP
server (if email is enabled), and the browser ↔ your instance. This is a
guarantee, not a default you can toggle.

## Threat model

Security controls are only meaningful against a stated adversary. **Assets:** the
identity database (`auth.db`), the platform database (`sovereign.db`), plugin
data, avatars/blobs, backups, secrets, and live sessions.

| Threat                                     | Addressed by                                               | Ships in              | Residual risk                                   |
| ------------------------------------------ | ---------------------------------------------------------- | --------------------- | ----------------------------------------------- |
| Network sniffing / MITM                    | Transport: TLS/HSTS at the edge, Postgres SSL              | **v1**                | Endpoint compromise.                            |
| XSS / injected scripts                     | Strict nonce-based CSP + security headers                  | **v1**                | A bug that echoes a valid nonce.                |
| Clickjacking                               | `X-Frame-Options: DENY` + `frame-ancestors 'none'`         | **v1**                | —                                               |
| Forged session cookie                      | HMAC-signed cookie cache; Argon2id passwords (better-auth) | **v1**                | Stolen live cookie from a compromised device.   |
| Compromised / curious plugin               | SDK boundary (plugins can't import runtime internals)      | **v1**                | A plugin still sees its own users' data.        |
| Stolen disk / leaked backup / VPS snapshot | At-rest encryption (DB / backup / blob)                    | post-v1 (Task 1.0.01) | Until then, rely on host-level disk encryption. |
| Curious/malicious host or hosting provider | Field-level → zero-knowledge encryption                    | post-v1 (charted)     | The operator can read data at rest in v1.       |
| RCE / compromised server process           | Only zero-knowledge E2EE mitigates                         | not planned for v1    | An attacker with code execution wins.           |

**Honest framing.** v1 ships Tiers 0–1 of RFC 0008 (hardening + transport). It
does **not** yet encrypt data at rest, so anyone who can read the server's disk
or a raw backup can read the data. Protect the host accordingly (see the
checklist). At-rest and field-level encryption are specified and deferred to
Task 1.0.01; zero-knowledge E2EE is charted but out of v1 scope.

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
- **No secrets with defaults.** `AUTH_SECRET` / `SOVEREIGN_AUTH_SECRET` and
  `SOVEREIGN_ADMIN_KEY` have no fallback — the apps refuse to start if unset.
- **Session cookies** are `httpOnly`; the signed `session_data` cache cookie is
  HMAC-verified offline and carries `Secure` in production (`__Secure-` prefix).
- **Transport:** Postgres connects over TLS when the connection string sets
  `sslmode` (see below); the public edge must terminate TLS with HSTS.

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
- [ ] **Restrict network exposure** — only the reverse proxy should be public;
      keep the auth server, database, and Mailpit on the internal network.
- [ ] **Keep backups encrypted and off-host**, and test restores.
- [ ] **Update regularly** and watch the repository's security advisories.

## Reporting a vulnerability

See [`SECURITY.md`](../SECURITY.md). Please do not file public issues for
security reports.
