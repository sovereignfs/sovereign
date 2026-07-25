# RFC 0072 — External OAuth/OIDC provider for non-plugin apps

**Status:** Draft\
**Date:** July 2026\
**Author:** External contributor (submitted for consideration; adapted to repository conventions)\
**Scope:** `apps/auth`, `docs/self-hosting.md`, `docs/security.md`, `docs/upgrade.md`. Builds on RFC 0021 (platform roles & capabilities) and RFC 0043 (plugin secret vault, for the client-secret storage pattern).\
**Incorporated into plan:** No — documentation-first. Design only; scheduling deferred to a roadmap slot.

---

## Summary

Let a Sovereign instance's auth server (`apps/auth`, a better-auth instance)
act as an OAuth 2.0 / OIDC identity provider for applications that are **not**
Sovereign plugins — standalone apps on their own domain and infrastructure
that want "log in with Sovereign" without being composed into the Sovereign
runtime, sharing its database, or joining the plugin manifest system.

## Motivation

Sovereign's plugin model assumes an app is composed into the platform
monorepo at build time and reads its session via runtime-injected headers
(`sdk.auth.getSession()`). That serves apps that want to live inside a
Sovereign workspace, but not an adjacent, increasingly common case: an
independent site on its own domain that simply wants to let a known set of
people (already Sovereign users) sign in, without becoming a plugin.

This gap is concrete, not hypothetical: **FindMyModel**, a separate
standalone app under active development, wants exactly this — sign-in backed
by an operator's Sovereign instance, with its own independent authorization
model (a curator allowlist) layered on top of verified identity.

better-auth already ships plugins for this (`oidcProvider`, and an OAuth 2.1
provider) — authorization code flow, client registration, and a JWKS endpoint
for offline token verification. The gap is not cryptographic or
architectural; `apps/auth` simply doesn't enable, document, or expose an
operator-facing registration flow for it today.

## Current state (what this builds on)

- `apps/auth/src/auth.ts:195-207` (`buildOptions()`) configures exactly three
  better-auth plugins today: `twoFactor`, `passkey`, and `nextCookies`. No
  OIDC/OAuth provider plugin is enabled — this is new surface, not a
  bug/gap in an existing one.
- `apps/auth` has no Drizzle migration path for its own tables; new tables
  (e.g. client registrations) go through the same idempotent
  `ensureAuthTables()` / `ALTER TABLE ADD COLUMN` pattern used for invite
  columns (`apps/auth/src/db.ts`, see epic task 1.17).
- RFC 0043 (plugin secret vault) already establishes the "generate once,
  store hashed, never re-display" pattern for credential material within
  this codebase — client secrets here should follow the same discipline
  rather than inventing a new one.
- RFC 0021 establishes platform roles/capabilities; client registration
  should be gated the same way (see Open questions).
- `docs/self-hosting.md` and `docs/security.md` currently have no section
  on external OAuth/OIDC — this RFC is additive documentation and
  configuration, not a change to an existing documented contract.

## Non-goals

- Making external apps first-class Sovereign plugins, or giving them access
  to `sdk.db`, `sdk.storage`, or any other plugin-scoped SDK surface. The
  only thing shared is verified identity (who is this person), not platform
  capabilities.
- Changing how plugin-internal auth works today.
- Any change to `sdk.auth.getSession()` or the plugin-facing session model.

## Proposed design

### 1. Enable and document the provider plugin

Add better-auth's OIDC (or OAuth 2.1) provider plugin to the `plugins` array
in `buildOptions()` (`apps/auth/src/auth.ts`), and document it in
`docs/self-hosting.md` and `docs/security.md` as a supported, stable surface
— not an internal implementation detail.

### 2. Client registration

Add an operator-facing way to register an external client, parallel in
spirit to how plugin manifests are validated today:

- **Console UI**: an "External clients" section (e.g. under Console → Auth,
  or a new top-level page) where an operator enters a display name, one or
  more allowed redirect URIs, and requested scopes (start with `openid`,
  `email`, `profile`). On save, the platform generates and displays a client
  ID and client secret exactly once (never shown again, only regenerable).
- **Storage**: client records live in the auth server's own store (not
  plugin-scoped), keyed by client ID, with `redirectUris`, `createdAt`,
  `createdBy` (admin user), and a revocation flag — added via the same
  `ensureAuthTables()` pattern as Task 1.17's invite columns.
- **API surface (optional, follow-up)**: an `sv` CLI or admin API
  equivalent for scripted registration, mirroring `sv plugin add`'s
  ergonomics.

### 3. Discovery and verification endpoints

Expose the standard OIDC surface publicly at `auth.<instance>`:

- `/.well-known/openid-configuration`
- `/oauth2/authorize`, `/oauth2/token`
- `/.well-known/jwks.json` for offline signature verification

These come from the better-auth plugin itself; the work here is confirming
they're reachable, documented, and stable across upgrades (add to
`docs/upgrade.md`'s breaking-change tracking, alongside the existing
downgrade-guard/compatibility-gate entries).

### 4. Claims contract

Document a stable minimal claim set external consumers can rely on:

| Claim    | Type   | Notes                                            |
| -------- | ------ | ------------------------------------------------ |
| `sub`    | string | Stable user ID, same value across sessions       |
| `email`  | string | Verified email                                   |
| `name`   | string | Display name                                     |
| `tenant` | string | Tenant/instance identifier, for multi-tenant ops |

Explicitly out of scope for v1: plugin capabilities, roles, or any
Sovereign-internal authorization data. An external app treats this purely as
"who is this" and manages its own authorization afterward (e.g.
FindMyModel's own curator allowlist) — state this explicitly in the docs so
consumers don't conflate "has a Sovereign account" with "authorized in my
app."

### 5. Trusted origins / redirect URI allowlisting

Redirect URIs are allowlisted per-client at registration (§2), doubling as
the trusted-origin mechanism — no separate global config needed. Reject any
authorization request whose `redirect_uri` isn't an exact match against a
registered client's allowlist (never prefix or wildcard matching).

### 6. Token lifetime and refresh

Follow better-auth's defaults unless there's a reason to diverge; document
whatever is chosen (access token TTL, refresh token issuance/rotation
policy) in `docs/security.md` so external operators can build correct
session-refresh logic.

## Security considerations

- Client secrets are shown exactly once and stored hashed server-side,
  consistent with RFC 0043's existing vault pattern.
- Redirect URI matching is exact-string only, to prevent open-redirect
  abuse.
- Revoking a client immediately invalidates its ability to mint new tokens;
  existing access tokens may be left to expire naturally unless a stronger
  requirement (immediate revocation list) is wanted.
- This surface increases the auth server's attack surface — it's now
  reachable by arbitrary external redirect targets, not just same-origin
  plugin routes. Needs an explicit pass in `docs/security.md`'s threat
  model section before this ships.

## Alternatives considered

- **Cross-subdomain cookie sharing** (better-auth's `crossSubDomainCookies`):
  simpler to wire up, but couples the external app into the same auth
  realm/secret as the platform itself — a much larger trust and operational
  commitment than most external integrations want. Not proposed as the
  default path; worth documenting as a lighter-weight option for operators
  who explicitly want tighter coupling (e.g. a family of apps under one
  brand).

## Open questions

- Should external client registration be admin-only, or delegable via the
  per-user capability grant mechanism (RFC 0070)? Recommend starting
  admin-only for v1, consistent with the platform's operator-controlled
  trust model.
- Is per-client rate limiting needed on the token endpoint, separate from
  whatever protects plugin-internal auth today?
- Dynamic client registration (RFC-style, self-service) vs. admin-registered
  only — recommend admin-registered only for v1.

## Adoption path

Documentation-first: this RFC does not commit to a roadmap slot. If
accepted, implementation is a single epic task (provider plugin + Console
registration UI + docs) since it's additive and does not touch existing
auth flows. See epic task [1.18](../epics/users-auth.md#-118--external-oauthoidc-provider-for-non-plugin-apps-rfc-0072).

## Changelog

| Version | Date      | Change        |
| ------- | --------- | ------------- |
| 0.1     | July 2026 | Initial draft |
