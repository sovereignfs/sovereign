# RFC 0008 — Security & encryption architecture

**Status:** Accepted\
**Date:** June 2026\
**Author:** kasunben\
**Scope:** Whole platform — runtime, `apps/auth`, `packages/db`, `packages/sdk`, `packages/manifest`, `bin/sv`, Docker/Compose, `.env.example`, docs, SRS; amends RFC 0006 & 0007\
**Incorporated into plan:** Yes, **phased** — SRS §3.17, §5 (`crypto:use`). **Tier 0 (hardening) + Tier 1 (transport) ship in v1** (Task 0.5.15); **at-rest encryption, field-level `sdk.crypto` + `crypto:use`, and zero-knowledge E2EE (Tiers 2–4) are post-v1** (Task 1.0.01). The reserved `sdk.crypto` stub + `crypto:use` permission land with the post-v1 task.

---

## Summary

Establish Sovereign's **security & encryption architecture** as a layered,
threat-model-driven roadmap — not a single feature. We **harden** (security
headers, transport), **encrypt at rest** (databases, avatars, backups, exports)
under a **local-keyfile envelope key hierarchy**, **specify** field-level
encryption behind a reserved `sdk.crypto`, and **chart** zero-knowledge
end-to-end encryption honestly as the post-v1 direction.

The guiding stance: deliver real, verifiable privacy wins now (a stolen disk or
leaked backup yields ciphertext) **without overpromising** an E2EE model the
current server-side-rendering + server-side-plugin architecture cannot yet
support. Encryption is **opt-in and operator-owned**: the operator holds the key,
and **losing it means losing the data** — that is the cost of true ownership.

## Motivation

Sovereign's positioning is "open source, privacy-first, owned entirely by the
person or organisation running it." The cryptographic baseline does not yet match
that promise:

- **Nothing is encrypted at rest** — `sovereign.db`, `auth.db`, and avatars are
  plaintext on disk; Postgres has no SSL configured.
- **No security headers** — CSP, HSTS, `X-Frame-Options`, `X-Content-Type-Options`,
  `Referrer-Policy`, `Permissions-Policy` are unset.
- **Backups and exports are plaintext** — RFC 0006 archives and RFC 0007 export
  bundles carry personal data in the clear (0007 flags bundle encryption as an
  open question).
- **The internal channel is plaintext HTTP** — runtime↔auth over the Docker
  network.

What is already solid: Argon2id password hashing (better-auth), HMAC-signed
session cookies, httpOnly cookies (AUTH-04), secrets with no defaults (NFR-08),
and **no telemetry** (confirmed — there is no outbound data collection). This RFC
builds the rest on that foundation.

The SRS lists **E2EE as out-of-scope for v1** (§4.6), and "simplicity over
premature flexibility" is a guiding principle. This RFC respects both: it commits
to the achievable tiers and treats zero-knowledge as a charted, post-v1
direction rather than a v1 deliverable.

## Threat model

Encryption choices are only meaningful against a stated adversary. **Assets:**
the identity DB (`auth.db`), the platform DB (`sovereign.db`), plugin data,
avatars/blobs, backups, export bundles, secrets/keys, and live sessions.

| Threat                                     | Tier that addresses it                                   | Residual risk                                                 |
| ------------------------------------------ | -------------------------------------------------------- | ------------------------------------------------------------- |
| Network sniffing / MITM                    | **Transport** (TLS/HSTS, Postgres SSL, internal channel) | Endpoint compromise.                                          |
| Stolen disk / leaked backup / VPS snapshot | **At-rest** (volume / DB / backup / blob encryption)     | Key stored on the same host (see below).                      |
| Curious/malicious host or hosting provider | **Field-level** (key off-box) → **zero-knowledge**       | At-rest alone does **not** stop someone who can read RAM/key. |
| Compromised or curious plugin              | SDK boundary (exists) + field scoping                    | A plugin still sees its own users' data.                      |
| RCE / compromised server process           | **Only zero-knowledge E2EE** mitigates                   | With server-held keys, an attacker with code execution wins.  |
| Co-tenant user on a shared instance        | Access control (exists) + per-user keys                  | Admin can still act on the instance.                          |

**Honest framing of server-held keys (Tiers 0–3):** at-rest encryption protects
data _off_ the running host (theft, backups, decommissioned disks). It does **not**
protect against an attacker who already controls the live process or the key —
that requires Tier 4. We state this plainly rather than implying "encrypted"
means "private from the operator."

## Current state (what this builds on)

- **Secrets with no defaults** — `apps/auth/src/env.ts` throws on missing
  `AUTH_SECRET` / `SOVEREIGN_ADMIN_KEY`; the envelope KEK follows the same rule.
- **HMAC session cookies** — signed cache verified offline in
  `runtime/src/session-verify.ts` (`resolveAuthSecret`); Argon2id via better-auth;
  httpOnly cookies (AUTH-04).
- **Reserved-surface pattern** — `packages/sdk/src/unimplemented.ts` /
  `packages/sdk/src/data.ts` stubs throw `NotImplementedError`; the manifest enum
  reserves matching permissions (`packages/manifest/src/schema.ts`). Reused for
  `sdk.crypto` + `crypto:use`.
- **Plaintext baseline** — `packages/db/src/client.ts`, `apps/auth/src/db.ts`,
  avatars in `runtime/app/api/account/avatar/route.ts`; no headers in the Next
  configs or `runtime/middleware.ts`; no Postgres SSL.
- **`SECURITY.md`** exists (disclosure policy + scope); there is **no threat-model
  document** yet — this RFC adds `docs/security.md`.
- **Amends RFC 0006** (`sv backup` archives) and **RFC 0007** (export ZIP, open
  question #4) to encrypted.

## Proposed architecture — tiers

All tiers below are **deferred** (specified for post-acceptance tasks) except the
reserved `sdk.crypto` stub noted under "Adoption path".

### Tier 0 — Hardening (cheapest, ship first)

Security response headers on every response — **CSP**, **HSTS** (prod),
`X-Frame-Options`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`,
`Permissions-Policy` — via Next `headers()` in both apps' `next.config.ts` plus
`runtime/middleware.ts` for dynamic cases; cookie hardening review; log/PII
redaction; codify the **no-telemetry** guarantee; and a new **`docs/security.md`**
holding this threat model + a self-hoster hardening checklist.

### Tier 1 — Transport

Enforce TLS/HSTS at the edge (reverse proxy already terminates TLS — document and
require it); add Postgres `sslmode=require` + certificate handling in
`packages/db/src/client.ts`; optionally authenticate/encrypt the internal
runtime↔auth channel (shared secret or mTLS). Mostly configuration + docs.

### Tier 2 — At-rest encryption (server-held key — the main deliverable)

**Key hierarchy (envelope).** A single **master key-encryption key (KEK)** is
supplied locally — an env var or a host keyfile, **no default, fail-fast when
encryption is enabled** (same discipline as `AUTH_SECRET`). The KEK wraps
**data-encryption keys (DEKs)** (per store, and per user/tenant where Tier 3
needs them); wrapped DEKs live in the DB. Rotation re-wraps DEKs under a new KEK
without bulk data re-encryption. **The KEK is the operator's to keep and to back
up separately** — see Key management.

Four combinable mechanisms (all four are in scope per the design decision):

- **2a — Operator disk/volume encryption.** LUKS / encrypted Docker volume,
  documented as the baseline. App unchanged; protects a powered-off disk.
- **2b — App-level database encryption.** SQLCipher via
  `better-sqlite3-multiple-ciphers` for `sovereign.db` + `auth.db`, opened with a
  key derived from the KEK. Postgres relies on TDE/disk + `sslmode` (no portable
  app-level per-cluster TDE) — documented. Protects DB files even on a shared
  filesystem, independent of disk encryption.
- **2c — Encrypted backups & exports.** `sv backup` encrypts its archive
  (age / AES-GCM + passphrase); RFC 0007 export bundles gain optional
  passphrase/age encryption. **Resolves the RFC 0006 / 0007 gaps directly.**
- **2d — Avatar / blob encryption.** On-disk user files are encrypted under a
  DEK and decrypted on serve in the avatar route (`runtime/app/api/account/avatar/...`).

### Tier 3 — Field-level encryption (specified, deferred)

A reserved **`sdk.crypto`** surface lets a plugin encrypt designated sensitive
values before they hit the DB and decrypt on read, using envelope encryption with
a **per-user DEK** the runtime injects (a plugin never handles the raw KEK):

```ts
// reserved — throws NotImplementedError in v1
sdk.crypto.encryptField(plaintext: string): Promise<string>; // returns opaque ciphertext token
sdk.crypto.decryptField(ciphertext: string): Promise<string>;
```

Gated by a new manifest permission **`crypto:use`**. Caveat: encrypting a column
**breaks DB-side search/sort** on it; optional **blind indexes** (keyed hashes)
can restore equality lookup. Field-level keeps the key off the disk that holds
the ciphertext only if the KEK is sourced from outside that disk — otherwise it
is defense-in-depth over Tier 2, not protection from the operator.

### Tier 4 — Zero-knowledge / E2EE (charted, aspirational)

Keys derived from each user's passphrase (Argon2id) on the **client**; data
encrypted client-side; the server stores **ciphertext only**. This is the only
tier that defends against a curious operator or an RCE attacker — but it **breaks**
a great deal of how Sovereign works today:

- server-side search and SSR of user content;
- server-side plugin processing, aggregation, and notifications/email of content;
- admin support workflows that read user data;
- password reset becomes **data loss** without a separate recovery key;
- multi-device requires client-side key sync.

It is therefore a **major architectural shift**, realistically **per-plugin
opt-in**, aligned with the post-v1 **federated-systems ("fs")** direction, and
**out of v1 scope** (SRS §4.6). This RFC charts it so later work has a target,
not a v1 commitment.

## Key management (cross-cutting)

- **Default: local keyfile / passphrase**, no external dependency (NFR-02). The
  operator owns the KEK.
- **Envelope hierarchy:** KEK → wrapped DEK(s) in the DB; rotation re-wraps DEKs.
- **Recovery is the operator's responsibility.** **Lose the KEK → lose the data**
  (that is what "owned entirely by you" costs). The KEK must be backed up
  **separately** from encrypted backups — a backup encrypted under a key stored
  only inside that backup is worthless. Document this prominently; consider a
  printed recovery code.
- **Optional pluggable KMS / Vault / OS-keyring adapter** as a _future_ backend
  for advanced operators — never the default, never required.
- **Startup:** fail-fast if encryption is enabled but the KEK is absent or wrong.

## New configuration & Docker impact

New env vars (final names TBD): `SOVEREIGN_ENCRYPTION` (on/off),
`SOVEREIGN_ENCRYPTION_KEY` or keyfile path, and a backup passphrase. On
implementation this carries **real Docker-config impact** — the SQLCipher native
dependency (`better-sqlite3-multiple-ciphers`) changes the image build and the
`pnpm-workspace.yaml` `allowBuilds` allowlist, and `.env.example` +
`docs/self-hosting.md` + the `runtime/src/docs-parity.test.ts` env-var parity
check must be updated in the same change. (Flagged here; nothing changes in this
doc-only draft.)

## Impact when accepted (deferred — beyond the reserved stub)

| Where                                    | Change                                                                      |
| ---------------------------------------- | --------------------------------------------------------------------------- |
| runtime                                  | Security headers (next config + middleware); avatar decrypt-on-serve.       |
| `apps/auth`                              | DB encryption; security headers.                                            |
| `packages/db`                            | SQLCipher driver option; Postgres SSL; envelope/key-management helpers.     |
| `packages/sdk`                           | Implement `sdk.crypto` (replace the stub) against the runtime per-user DEK. |
| `packages/manifest`                      | Enforce `crypto:use`.                                                       |
| `bin/sv`                                 | Encrypt backup archives.                                                    |
| RFC 0006 / RFC 0007                      | Amend to encrypted backups / encrypted export bundles.                      |
| `.env.example`, `docs/self-hosting.md`   | New encryption env vars + setup/rotation/recovery procedures.               |
| `docs/security.md` (new)                 | Threat model + hardening checklist.                                         |
| SRS §3 / §4                              | New `SEC-xx` requirement IDs + decision-log entry.                          |
| `docs/sovereign-implementation-tasks.md` | Sequenced tasks (Tier 0 → 1 → 2 → 3 → 4).                                   |

## Alternatives considered

1. **Cloud KMS as the default key store.** Violates self-host / NFR-02 (no
   external dependency for core). Kept only as an _optional_ future adapter.
2. **Full-disk encryption only.** Necessary but insufficient — does nothing
   against a curious operator, a co-tenant, or a leaked logical backup. Adopted as
   the baseline (Tier 2a), not the whole story.
3. **End-to-end encryption now.** Breaks server-side search/SSR/plugin processing
   and is out of v1 scope; charted as Tier 4 instead.
4. **Always-on per-field encryption.** Significant performance and
   search/sort cost for data that is mostly not sensitive; field-level is opt-in
   (Tier 3).
5. **Rely entirely on the operator (no in-app crypto).** Gives no verifiable
   in-product guarantee and clashes with the privacy-first positioning. Rejected
   in favour of the tiered model.

## Open questions

1. **SQLCipher native dependency.** Does `better-sqlite3-multiple-ciphers`
   replace `better-sqlite3` outright, and what is the image-build / `allowBuilds`
   impact?
2. **Postgres at-rest story.** Without portable app-level TDE, is disk encryption
   - `sslmode` the recommended posture, or pgcrypto for select columns?
3. **better-auth under SQLCipher.** Does the auth server's driver open an
   encrypted `auth.db` cleanly?
4. **Key rotation cost.** Re-wrapping DEKs is cheap; any scenario forcing bulk
   re-encryption?
5. **Recovery model.** Printed recovery code vs escrow vs "you're on your own."
6. **Searchable encryption.** Blind indexes for Tier 3 equality lookups — ship
   with Tier 3 or later?
7. **Encrypted DB × migrations.** Interaction with the drizzle-kit /
   expand-contract flow (RFC 0006).
8. **Tier 2 key granularity.** Single instance key vs per-user keys for at-rest.
9. **Performance overhead** of SQLCipher + envelope ops on modest hardware
   (NFR-07: start & serve within 10s on a 2-core/1GB VPS).

## Adoption path

1. **v1 — Tier 0 / 1 (Task 0.5.15):** security headers + `docs/security.md`
   (threat model) + Postgres SSL + transport hardening. No new app secrets or
   native deps.
2. **post-v1 — reserved stub (Task 1.0.01):** reserved `sdk.crypto` stub
   (`encryptField`/`decryptField` throw `NotImplementedError`) + `crypto:use`
   permission — additive (SDK + manifest **minor** bumps).
3. **post-v1 — Tier 2 (Task 1.0.01):** key management (local KEK + envelope) → DB
   encryption (SQLCipher) → encrypted backups/exports (amend RFC 0006/0007) →
   avatar/blob encryption.
4. **post-v1 — Tier 3 (Task 1.0.01):** implement `sdk.crypto` field-level
   encryption (+ optional blind indexes).
5. **post-v1 — Tier 4:** zero-knowledge E2EE — per-plugin opt-in, aligned with the
   federation direction.

## Changelog

| Version | Date     | Change                                                                                                  |
| ------- | -------- | ------------------------------------------------------------------------------------------------------- |
| 0.1     | Jun 2026 | Initial draft; threat model + tiered encryption roadmap; proposes reserved `sdk.crypto` + `crypto:use`. |
