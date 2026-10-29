# Epic 6: OIDC Provider

> Core as a sign-in server for any application: OpenID Connect flows, scopes
> and claims, consent, logout and token revocation.

## Status

📋 Planned

## Overview

Built on `@better-auth/oauth-provider`. Clients are registered by operators
only (epic 7). Any standards-compliant OIDC application must be able to sign
people in through core without knowing anything about Sovereign.

## Related

- [docs/specs/core-app.md](../specs/core-app.md) — §3.6

## Tasks

#### 📋 6.1 — Provider, flows, scopes and claims

**Goal:** Registered clients can sign people in with the authorization code
flow and receive exactly the claims their scopes allow.

**Deliverables:**

- better-auth's JWT plugin with `issuer` set to the instance URL, so
  `/.well-known/openid-configuration` and `/.well-known/oauth-authorization-server`
  are served at the root (a route handler delegates to
  `auth.api.getOpenIdConfig()`); endpoints stay under `/api/auth`; ID tokens
  signed with EdDSA; signing keys rotate every 90 days with a 30-day grace
  period
- `@better-auth/oauth-provider` configured as in research 0001: `grantTypes`
  limited to `authorization_code` and `refresh_token`; PKCE `S256` required for
  every client; refresh tokens on `offline_access`; no dynamic registration;
  `storeClientSecret: 'hashed'`; exact matching of redirect URIs
- Scopes and claims from spec §3.6.2: `openid`, `profile`, `email`, `roles`,
  `directory`, `offline_access`; `customIdTokenClaims` and
  `customUserInfoClaims` emit `name`, `picture`, `email`, `email_verified`,
  `locale`, `zoneinfo` and `roles` (only when the scope was granted) in both the
  ID token and userinfo
- Token lifetimes per spec §3.6.1: access 15 minutes, ID 1 hour, refresh 30
  days from last use
- Refresh tokens rotated on every use; reuse of a rotated token is refused and
  removes every refresh and access token the client holds for that account
- Regression tests for each behaviour verified in research 0001

**Dependencies:** 4.1, 5.1

**Spec reference:** §3.6.1, §3.6.2

**Review checklist:**

- An off-the-shelf OIDC relying party configured with only the instance URL
  completes sign-in against core
- A client receives no claim outside its allowed and granted scopes, and
  `roles` only when it is trusted and the scope was granted
- An implicit, password or client-credentials grant request is refused
- Authorize without a `code_challenge` is refused for confidential and public
  clients
- Presenting an already-used refresh token is refused and the client's other
  tokens for that account stop working
- The discovery `issuer`, every ID token `iss` and the JWKS agree

**Not here:** the consent page (6.2), the end-session and revocation work (6.3),
the client registry and its Console page (7.1, 8.6), the Directory API's resource
(10.2), and CORS for single-page apps. Clients are registered meanwhile through
the provider's own server API, and must be trusted.

#### 📋 6.2 — Consent

**Goal:** People decide what untrusted clients may know, once, and can change
their mind.

**Deliverables:**

- The trusted flag; untrusted by default
- A consent screen listing the requested scopes, built from `@sovereignfs/ui`
- Consent remembered per account, client and set of scopes; asked again when a
  client requests a new scope
- `roles` only for trusted clients

**Dependencies:** 6.1

**Spec reference:** §3.6.4

**Review checklist:**

- An untrusted client shows consent once, then not again for the same scopes
- A trusted client never shows consent
- An untrusted client requesting `roles` does not receive it

#### 📋 6.3 — Logout and revocation

**Goal:** Signing out, deactivation, deletion and removed access all end a
client's access, and clients are told when a session ends.

**Deliverables:**

- End-session endpoint (RP-initiated logout) honouring only registered
  post-logout redirect URIs
- Back-channel logout: clients with a back-channel logout URI receive a signed
  logout token (with `sub` and `sid`) when a person's session ends; `sid` in
  the ID token for clients with end-session or a back-channel URI
- **One revocation routine** used by deactivation, deletion and "Remove
  access", written against the generated Drizzle schema (not raw table names):
  it revokes every access token and refresh token for the account (or for the
  account and one client), including `offline_access` refresh tokens, which
  ending a session leaves alone. Deactivation and deletion also end the
  sessions in the same operation
- Core's own endpoints (userinfo, token, introspection) stop accepting revoked
  tokens
- Deleting the consent through the plugin is never exposed directly; the
  identity pages call our routine, which deletes the consent and revokes the
  client's tokens together

**Dependencies:** 6.2, 4.7

**Spec reference:** §3.3.6, §3.6.3, §3.6.4, §3.6.5

**Review checklist:**

- After deactivation, a refresh token (with and without `offline_access`), an
  access token and a userinfo call for the account are all rejected
- After "Remove access", the client's refresh token is rejected and the next
  sign-in asks for consent again
- Signing out of core posts a logout token to a registered back-channel URI
  and revokes that session's access tokens
- An end-session request to an unregistered post-logout redirect URI does not
  redirect there
- The routine behaves the same on sqld, PostgreSQL and a SQLite file
