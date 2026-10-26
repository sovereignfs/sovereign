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

- `/.well-known/openid-configuration`; authorization, token, userinfo and JWKS
  endpoints; ID tokens signed with EdDSA
- Authorization code flow only; PKCE `S256` required for public clients;
  refresh tokens on `offline_access`; no dynamic registration; exact matching
  of redirect URIs
- Scopes and claims from spec §3.6.2: `openid`, `profile`, `email`, `roles`,
  `directory`, `offline_access`
- Token lifetimes per spec §3.6.1: access 15 minutes, ID 1 hour, refresh 30
  days from last use
- Refresh tokens rotated on every use, with reuse detection revoking every
  token descended from a reused one

**Dependencies:** 4.1, 5.1

**Spec reference:** §3.6.1, §3.6.2

**Review checklist:**

- An off-the-shelf OIDC relying party completes sign-in against core
- A client receives no claim outside its allowed and granted scopes
- An implicit or password grant request is refused
- Presenting an already-used refresh token revokes its whole family

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

**Goal:** Signing out, deactivation, deletion and revoked consent all end a
client's access.

**Deliverables:**

- End-session endpoint honouring registered post-logout redirect URIs
- Deactivating or deleting an account revokes its tokens; core's endpoints
  stop accepting them
- Revoking consent ends that client's refresh tokens for the account

**Dependencies:** 6.2, 4.7

**Spec reference:** §3.3.6, §3.6.3, §3.6.4

**Review checklist:**

- After deactivation, a refresh token and an access token for the account are
  both rejected
- After revoking consent, the client's next sign-in asks again
