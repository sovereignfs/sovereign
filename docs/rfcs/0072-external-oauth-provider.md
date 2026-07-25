# RFC 0072 — External OAuth/OIDC provider for non-plugin apps

**Status:** Implemented\
**Date:** July 2026\
**Author:** External contributor (submitted for consideration; adapted to repository conventions and revised during implementation against the actual `@better-auth/oauth-provider` API)\
**Scope:** `apps/auth`, `runtime` (better-auth client version only), `plugins/console`, `docs/self-hosting.md`, `docs/security.md`, `docs/upgrade.md`. Builds on RFC 0021 (platform roles & capabilities).\
**Incorporated into plan:** Yes — epic task 1.18.

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

This gap is concrete, not hypothetical: a separate standalone app under
active development wants exactly this — sign-in backed by an operator's
Sovereign instance, with its own independent authorization model (e.g. a
curator allowlist) layered on top of verified identity.

better-auth ships provider support for exactly this. **Important correction
found during implementation:** the originally-drafted target, the bundled
`oidc-provider` plugin (`better-auth/plugins/oidc-provider`), is marked
`@deprecated` as of the better-auth version this repo already pinned
(1.6.16) — "Use `@better-auth/oauth-provider` instead. This plugin will be
removed in the next major version." better-auth split OAuth/OIDC provider
support into a separate, actively-maintained package,
[`@better-auth/oauth-provider`](https://www.better-auth.com/docs/plugins/oauth-provider).
This RFC and its implementation build on that package instead — the gap is
still "not enabled, documented, or given a registration flow," not
cryptographic or architectural.

## Current state (what this builds on)

- `apps/auth/src/auth.ts:195-208` (`buildOptions()`, before this RFC)
  configured exactly three better-auth plugins: `twoFactor`, `passkey`, and
  `nextCookies`. No OIDC/OAuth provider plugin was enabled.
- `@better-auth/oauth-provider` manages its **own** schema
  (`oauthClient`, `oauthAccessToken`, `oauthRefreshToken`, `oauthConsent`)
  through better-auth's own adapter — unlike the hand-rolled `invites` table
  (`apps/auth/src/db.ts`'s `ensureAuthTables()`), this schema is
  **auto-discovered by better-auth's own migrator**
  (`getMigrations()`/`runMigrations()` in `apps/auth/src/migrate.ts`, which
  RFC 0012 already documented as auto-discovering plugin tables for
  `twoFactor`/`passkey`). **No custom table or migration code was needed** —
  this corrects the original draft's assumption of a custom
  `ensureAuthTables()`-based client table.
- The package exposes full client CRUD over HTTP, session-gated via its own
  `clientPrivileges` hook (`create`/`read`/`update`/`delete`/`list`/`rotate`
  actions) — `POST /oauth2/create-client`, `GET /oauth2/get-clients`,
  `POST /oauth2/client/rotate-secret`, `POST /oauth2/delete-client`. (Its
  `adminCreateOAuthClient`/`adminUpdateOAuthClient` variants are
  `SERVER_ONLY` — not HTTP-reachable at all — so the session-gated
  non-admin-prefixed endpoints are what a browser-facing Console UI must
  use, with `clientPrivileges` doing the actual authorization.)
- `storeClientSecret: 'hashed'` is a first-class plugin option — no need to
  reinvent RFC 0043's "generate once, store hashed" discipline; the plugin
  already does it when configured this way.
- The existing generic proxy `runtime/app/api/auth/[...path]/route.ts`
  (forwards `/api/auth/*` from the runtime's origin to the auth server with
  cookies + `Origin` header) already covers every path this plugin mounts —
  **no runtime proxy changes were needed** for the Console UI to reach these
  endpoints with the calling admin's real session.
- RFC 0021 establishes platform roles/capabilities; `runtime/src/capabilities.ts`'s
  `instance:configure` capability (granted to `platform:admin` and
  `platform:owner`) is reused for the Console page gate; `apps/auth` itself
  doesn't import runtime code, so its `clientPrivileges` role check
  (`platform:owner`/`platform:admin`) is a small, intentional duplication of
  the same role set.
- `docs/self-hosting.md` and `docs/security.md` had no section on external
  OAuth/OIDC before this RFC.

## Non-goals

- Making external apps first-class Sovereign plugins, or giving them access
  to `sdk.db`, `sdk.storage`, or any other plugin-scoped SDK surface. The
  only thing shared is verified identity (who is this person), not platform
  capabilities.
- Changing how plugin-internal auth works today.
- Any change to `sdk.auth.getSession()` or the plugin-facing session model.

## Proposed design

### 1. Enable the provider plugin

Add `oauthProvider(...)` from `@better-auth/oauth-provider` to the `plugins`
array in `buildOptions()` (`apps/auth/src/auth.ts`):

- `loginPage: '/login'`, `consentPage: '/oauth2/consent'` (new page, §2b).
- `storeClientSecret: 'hashed'` — secrets are never reversibly stored.
- `allowDynamicClientRegistration: false` (explicit — matches the plugin's
  own default; no self-service registration in v1).
- `clientPrivileges`: authorizes every client mutation
  (create/read/update/delete/list/rotate) only when the session user's
  `role` is `platform:owner` or `platform:admin`.

### 2. Client registration and management

**a. Console UI** — a new "External clients" section
(`plugins/console/app/oauth-clients/`), gated to `instance:configure`
(granted to `platform:admin`/`platform:owner`), where an admin enters a
display name and one or more exact redirect URIs. On submit the platform
generates and displays a client ID and client secret exactly once (never
shown again — only rotatable). The page calls the plugin's own
non-admin-prefixed HTTP endpoints directly from the browser
(`/api/auth/oauth2/create-client`, `/get-clients`, `/client/rotate-secret`,
`/delete-client`) via the runtime's existing generic auth proxy — no new
runtime or apps/auth routes were needed; `clientPrivileges` is the actual
security boundary, re-checked by the plugin on every request regardless of
what the Console page itself gates.

**b. Consent page** — a new page at `apps/auth/app/oauth2/consent/`. The
plugin's `/oauth2/authorize` redirects an already-authenticated user here
with a signed query string; the page displays the requesting client's name
and requested scopes (fetched from the plugin's public `/oauth2/public-client`
endpoint) and, on Allow/Deny, POSTs to `/api/auth/oauth2/consent` with the
signed query forwarded verbatim — the page never re-derives or trusts it,
only displays and echoes it back for the plugin's own re-verification.

**c. Storage**: entirely the plugin's own schema
(`oauthClient`/`oauthAccessToken`/`oauthRefreshToken`/`oauthConsent`),
auto-migrated — no custom table.

### 3. Discovery and verification endpoints

Exposed automatically by the plugin at the auth server's public URL:

- `/.well-known/openid-configuration`, `/.well-known/oauth-authorization-server`
- `/oauth2/authorize`, `/oauth2/token`, `/oauth2/userinfo`
- `/.well-known/jwks.json` for offline signature verification

Documented in `docs/self-hosting.md`'s "External OAuth/OIDC provider"
section and tracked in `docs/upgrade.md`.

### 4. Claims contract

| Claim   | Type   | Notes                                      |
| ------- | ------ | ------------------------------------------ |
| `sub`   | string | Stable user ID, same value across sessions |
| `email` | string | Verified email                             |
| `name`  | string | Display name                               |

(The original draft proposed a `tenant` claim for multi-tenant operators;
dropped — Sovereign is single-tenant per instance, so there is no tenant
identifier to carry, and the plugin's `sub` is already scoped to this
instance's own user table.)

Explicitly out of scope for v1: plugin capabilities, roles, or any
Sovereign-internal authorization data. An external app treats this purely as
"who is this" and manages its own authorization afterward (e.g. its own
allowlist) — stated explicitly in
`docs/self-hosting.md` so consumers don't conflate "has a Sovereign account"
with "authorized in my app."

### 5. Trusted origins / redirect URI allowlisting

Redirect URIs are matched **exact-string only** against the client's
registered `redirect_uris` — the plugin's own behavior, no separate global
config needed.

### 6. Token lifetime and refresh

Left at the plugin's defaults (`accessTokenExpiresIn`, `refreshTokenExpiresIn`,
`idTokenExpiresIn`, `codeExpiresIn`) — no reason found during implementation
to diverge from them for v1.

## Security considerations

- Client secrets are shown exactly once and stored **hashed**
  (`storeClientSecret: 'hashed'`) — never reversibly encrypted, never
  re-displayed after creation.
- Redirect URI matching is exact-string only, to prevent open-redirect
  abuse.
- Revoking a client (delete) immediately stops new token issuance for it;
  already-issued access tokens are left to expire naturally.
- Registration/rotation/revocation is restricted to `platform:owner`/
  `platform:admin` via `clientPrivileges` — there is no dynamic or
  self-service registration path to worry about in v1.
- This surface increases the auth server's attack surface — it's now
  reachable by arbitrary external redirect targets, not just same-origin
  plugin routes. Reflected in `docs/security.md`'s threat model table.

## Alternatives considered

- **The bundled `oidc-provider` plugin** (`better-auth/plugins/oidc-provider`),
  the original draft's target: rejected once implementation began — it is
  `@deprecated` as of better-auth 1.6.16 (the version already pinned in this
  repo) in favor of `@better-auth/oauth-provider`, and "will be removed in
  the next major version." Building new functionality on a plugin already
  flagged for removal would create near-term migration debt for no benefit;
  the replacement package required only a non-breaking `better-auth`
  dependency bump (`^1.6.16` → `^1.6.25`).
- **Cross-subdomain cookie sharing** (better-auth's `crossSubDomainCookies`):
  simpler to wire up, but couples the external app into the same auth
  realm/secret as the platform itself — a much larger trust and operational
  commitment than most external integrations want. Not proposed as the
  default path; worth documenting as a lighter-weight option for operators
  who explicitly want tighter coupling (e.g. a family of apps under one
  brand).

## Open questions

- ~~Should external client registration be admin-only, or delegable via the
  per-user capability grant mechanism (RFC 0070)?~~ **Resolved:** admin-only
  for v1 (`platform:owner`/`platform:admin` via `clientPrivileges`),
  consistent with the platform's operator-controlled trust model. Delegable
  via a grantable capability remains an option for a future task if needed.
- Is per-client rate limiting needed on the token endpoint, separate from
  whatever protects plugin-internal auth today? Not addressed in v1 —
  left as a follow-up if abuse is observed.
- ~~Dynamic client registration vs. admin-registered only?~~ **Resolved:**
  admin-registered only for v1 (`allowDynamicClientRegistration: false`).

## Adoption path

Implemented in epic task 1.18 as a single PR (provider plugin + consent page + Console registration UI +
docs) — additive, no changes to existing auth flows. `better-auth` bumped
`^1.6.16` → `^1.6.25` (non-breaking, same major) to meet
`@better-auth/oauth-provider`'s peer requirement.

## Changelog

| Version | Date      | Change                                                                                                                                                                                                                                                                                            |
| ------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0.1     | July 2026 | Initial draft                                                                                                                                                                                                                                                                                     |
| 0.2     | July 2026 | Implemented. Switched from the deprecated bundled `oidc-provider` to `@better-auth/oauth-provider`; corrected the custom-table assumption (plugin auto-manages its own schema); dropped the `tenant` claim (no multi-tenant concept in this platform); resolved both admin-gating open questions. |
