# Research 0001 — better-auth's OAuth provider for core's sign-in server

|                     |                                                                                                                                                         |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Status**          | Decided — all seven recommendations accepted on 2026-10-27 and applied to the spec and epics                                                            |
| **Date**            | October 2026                                                                                                                                            |
| **Author**          | Claude Code                                                                                                                                             |
| **Scope**           | `docs/specs/core-app.md` §3.6 (OIDC provider), §3.7 (app registration), §3.8, §3.9 (Directory API), §3.3.6 (account states); epics 4.7, 6, 7, 8.6, 10.2 |
| **Versions tested** | `better-auth` 1.7.14, `@better-auth/oauth-provider` 1.7.14, `@better-auth/drizzle-adapter` 1.7.14 (all current `latest`, released 2026-10-26)           |

---

## Question

Phase 1 builds core's sign-in server on `@better-auth/oauth-provider`. The spec
and epics assume several behaviours of that plugin that had not been
confirmed. Which does the plugin do natively, which need configuration, which
need code of our own, and which cannot be done — and what does that change in
the spec?

## Method

A throwaway prototype, run in-process by calling the better-auth request
handler directly (no browser), driving the full flow: sign-up, client
registration, authorize, consent, token, refresh, userinfo, end-session,
back-channel logout. The same flows were then repeated on:

| Database                                                                          | How                                                                      | Result               |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | -------------------- |
| SQLite (better-auth's built-in Kysely path)                                       | `better-sqlite3`, in memory                                              | all behaviours below |
| **PostgreSQL 18.4**                                                               | real server binary (`embedded-postgres`)                                 | all key flows pass   |
| **libSQL** (the client sqld uses), through the **Drizzle adapter** (Fjord's path) | `@libsql/client` over a `file:` URL, Drizzle schema from `auth generate` | all key flows pass   |

**Not verified:** a running `sqld` server (the Docker daemon was not running).
The libSQL client over a file uses the same SQL dialect and driver, so the
risk is low, but namespace handling (`x-namespace`) is untested with this plugin.
Also not tested: rate limiting of the token endpoints, DPoP, retries of failed
back-channel logout calls, behaviour under load.

The prototype is not kept in the repository. Every finding below names the
behaviour that was checked, so it can be rebuilt as a regression test in task
6.1.

---

## Findings

### A. Works as the spec says, with no extra code

| Spec requirement                                                                                    | Result                                                                                                                                                       |
| --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Discovery document, JWKS, authorization, token, userinfo, introspect, revoke, end-session endpoints | Present. Discovery advertises `EdDSA`, `S256`, `client_secret_basic`/`post`, `private_key_jwt`                                                               |
| ID tokens signed with EdDSA                                                                         | Default; verified against `/jwks` with the expected `iss` and `aud`                                                                                          |
| Authorization code flow with PKCE                                                                   | PKCE is required for **every** client, confidential or public; only `S256` (no `plain`)                                                                      |
| No dynamic registration                                                                             | Refused (403) unless enabled                                                                                                                                 |
| Consent per account, client and set of scopes; asked again for a new scope                          | Exactly this: stored scopes must be a superset of those requested                                                                                            |
| Trusted client skips consent                                                                        | The client field `skipConsent`                                                                                                                               |
| `roles` only for trusted clients                                                                    | Enforced by scope: a client can only request scopes in its allowed list (`invalid_scope` otherwise), so an untrusted client simply never has `roles` allowed |
| Client secret generated, shown once, stored hashed                                                  | Plain secret returned once (32 chars); `storeClientSecret: 'hashed'` stores a hash                                                                           |
| Tokens stored hashed                                                                                | Default (`storeTokens: 'hashed'`)                                                                                                                            |
| Token lifetimes: access 15 min, ID 1 h, refresh 30 d                                                | Plain options: `accessTokenExpiresIn`, `idTokenExpiresIn`, `refreshTokenExpiresIn` (defaults are 1 h, 10 h, 30 d)                                            |
| Refresh token rotation                                                                              | Each use issues a new token with a fresh 30-day expiry (sliding)                                                                                             |
| Reuse of a rotated refresh token is detected                                                        | Refused with `invalid_grant`, and the family is killed (see D2)                                                                                              |
| Disabling a client                                                                                  | Authorize redirects to a `client_disabled` error; token and refresh answer `invalid_client`; introspection reports inactive; re-enabling restores everything |
| Deleting a client                                                                                   | Cascades to its tokens and consents                                                                                                                          |
| Deleting a user                                                                                     | Foreign keys cascade to clients they own, tokens and consents; sessions on tokens become `NULL` (verified on PostgreSQL and libSQL with foreign keys on)     |
| Connected apps (list and delete consent)                                                            | `get-consents`, `delete-consent` (but see B2)                                                                                                                |
| RP-initiated logout                                                                                 | `end-session` with `id_token_hint`: follows a registered `post_logout_redirect_uri` with `state`, ignores an unregistered one, ends the core session         |
| Back-channel logout                                                                                 | **Implemented** — see D3                                                                                                                                     |

### B. Gaps that need our own code

**B1. A deactivated account can still use its tokens.** The refresh grant only
checks that the user _exists_; userinfo does likewise. After setting the account
inactive, `refresh_token` and `userinfo` both still returned 200. Deleting the
account's sessions does not help either: the plugin deliberately leaves
refresh tokens that carry `offline_access` alone when a session ends.
_Fix, verified on all three databases:_ on deactivation (and deletion),
mark every `oauthRefreshToken` and `oauthAccessToken` row for the user revoked
— one update each. After that, refresh and userinfo are refused. This is task
6.3's job and must be part of the same operation that ends the sessions.

**B2. Deleting a consent does not end the client's refresh tokens.**
`delete-consent` removed the consent, and the client's refresh token still
returned 200. The spec (§3.6.4) says revoking consent ends them. _Fix,
verified:_ "Connected apps → Remove access" is our own server action that
deletes the consent **and** revokes that user's refresh and access tokens for
that client, in one transaction.

**B3. A trusted client cannot be created through the API.** `create-client`
silently ignores `skip_consent`, and the server-only admin creation does the
same redirect checks. The trusted flag, the launcher fields and any
development redirect (B4) have to be written by us.
_Recommended mechanism:_ register through the plugin (so the secret is hashed
and defaults are applied), then write our own fields through the plugin's own
adapter (`auth.$context.adapter`), which stores and returns proper arrays and
objects. **Do not** read or write these rows through Drizzle's schema objects:
on the Drizzle SQLite path the plugin stores JSON as text and a Drizzle read
returned `redirectUris` as a _string_. Launcher fields (launch URL,
description, show in launcher) fit in the client's `metadata` JSON column, so no
schema change is needed.

**B4. Redirect URIs for local development.** For the default `web`
application type a redirect URI must be `https` and must not be a loopback
host. `http://localhost:…` is accepted only for `native` clients, and
`http://app.localhost:…` is accepted for none — including through the
server-only admin API. This blocks the `*.localhost` suite setup. Our client
write path (B3) can store such a URI; the plugin then accepts it at authorize
time (verified). Validation of what an operator may enter is then ours:
`https` always, plus `http` on `localhost` and `*.localhost` only when core's
own `SV_URL` is itself `http` (a development instance).

**B5. Operators other than the creator cannot manage a client.** The plugin
ties management to the creating user. A second admin could not rotate, update,
delete or even list a client the owner had created (401, empty list). _Fix,
verified:_ `clientReference: () => 'instance'` gives every client an
instance-wide `referenceId`, after which any account passing `clientPrivileges`
(owner or admin) can rotate, update, list and delete, and a plain user still
cannot.

**B6. ID tokens carry no profile or email claims by default.** `name`,
`picture`, `email` and `email_verified` are delivered only at the userinfo
endpoint, as the OIDC spec allows for the code flow. Many relying parties read
`email` from the ID token. `locale` and `zoneinfo` are not built in at all.
_Fix, verified:_ `customIdTokenClaims` and `customUserInfoClaims` emit them,
gated by the granted scopes; `roles` is emitted only when the `roles` scope was
granted (so only for trusted clients, per A).

**B7. The Directory API needs a revocation check of its own.** With a
`resource` parameter the access token becomes a JWT (`typ: at+jwt`, EdDSA,
`aud` = the resource, `scope`, 15 minutes), which the Directory API can verify
offline from the JWKS. A revoked JWT still verifies offline until it expires.
Userinfo honours revocation. So the Directory API must verify the JWT _and_
look the token up for revocation (an indexed read). Without a `resource` the
token is opaque.
_Note:_ `enforcePerClientResources` defaults to `true`, which requires linking
every client to the resource; we would set it to `false` and rely on each
client's allowed scopes (`directory` must be in them).

### C. Cannot be done as written

**C1. Two live secrets during a rotation.** `rotate-secret` **replaces** the
secret at once (a single `clientSecret` column). After rotating, the old secret
answered `invalid_client` immediately. The 24-hour overlap in spec §3.7.3 is
not available.

### D. Differences from what the spec assumes

**D1. Rotation is immediate** — see C1.

**D2. Reuse detection removes more than "descendants".** Presenting a rotated
refresh token **deletes** (not flags) every refresh token, and the access
tokens linked to them, that the client holds for that account. A user signed in
to the same app on two devices loses both. Stricter than the spec's "every
token descended from it", and safe, but it is a UX fact worth stating.

**D3. Back-channel logout exists and is automatic.** When a session is
deleted — sign-out, an operator ending sessions, our deactivation — the plugin
revokes that session's access tokens and `POST`s a signed `logout_token` (event
`http://schemas.openid.net/event/backchannel-logout`, with `sub` and `sid`) to
the `backchannelLogoutUri` of every client the session touched, with a 5-second
timeout and no retry (failures are logged). Verified end to end against a local
receiver. Requirements: the client sets `backchannelLogoutUri`; the ID token
then carries a `sid`; the JWT plugin must be on. This was planned for "a later
phase" (§3.16); it costs almost nothing now, because the work is a field in the
Console. It does **not** cover refresh tokens with `offline_access` — see B1.

**D4. `client_credentials` is advertised by default.** The spec offers the
authorization code flow only. Set `grantTypes: ['authorization_code',
'refresh_token']`; verified that discovery then lists only those and a
`client_credentials` request is refused.

**D5. The issuer includes `/api/auth` by default,** and discovery is served
under that path. Spec §3.6.1 says discovery lives at
`/.well-known/openid-configuration`. Setting the JWT plugin's `issuer` to the
bare origin (`jwt({ jwt: { issuer: SV_URL } })`) makes the plugin serve
discovery at the **root** (`/.well-known/openid-configuration` and
`/.well-known/oauth-authorization-server`) with `iss` = the bare origin in
discovery and in every token; the endpoints themselves stay under `/api/auth`.
Verified. Apps can be configured with just the instance URL as the issuer.

---

## Operational notes

- **Self-fetch on logout.** Verifying an `id_token_hint` for RP-initiated logout
  fetches core's _own_ `/jwks` over its **public URL**. Inside a container the
  server must be able to reach that URL, or logout fails with "the id_token_hint
  is invalid". Compose files and `sovereign-infra` must make the public name
  resolvable from the container (a hairpin route or a host entry); other token
  checks use an in-process lookup and are unaffected.
- **JWKS keys.** Private keys are encrypted with the auth secret by default.
  Rotation is **off** by default (`rotationInterval` unset); `gracePeriod` keeps
  old public keys published. Pick values before release.
- **Management ownership and privileges** need `clientPrivileges` (we return
  true for owner and admin) _and_ `clientReference` (B5).
- **Session cookies across subdomains are not needed for OIDC.** Apps use the
  code flow; only core's own pages and passkeys need core's cookie.
  `SV_AUTH_COOKIE_DOMAIN` can stay unset unless passkeys are shared across
  subdomains.
- **Drizzle path** (sqld, Fjord's path): the CLI that generates the plugin's
  Drizzle schema is the `auth` package (`npx auth generate`, version 1.7.14);
  `@better-auth/cli` is stale. Table names are snake_case (`oauth_client`,
  `skip_consent`). Our revocation code (B1, B2) must use the generated schema
  objects for those tables, not raw SQL with other names.
- **PostgreSQL:** arrays are `jsonb`, times are `timestamptz`, booleans are
  real booleans; nothing needed adapting.
- **Upgrades.** Legacy skipped better-auth 1.7.0–1.7.2 over a migration that
  failed on a populated store. 1.7.14 was tested on empty databases only; the
  rule "verify an upgrade against a populated store" still applies at every bump.

---

## Recommendation

Build on `@better-auth/oauth-provider` as planned. Roughly nine-tenths of the
OIDC surface in Phase 1 is native or configuration. The code we own is small and
well defined: client rows written through the adapter (B3, B4), one revocation
routine used by deactivation, deletion and "Remove access" (B1, B2), the claims
hooks (B6), and the Directory API's token check (B7).

### Configuration to adopt

```ts
jwt({ jwt: { issuer: SV_URL }, /* + rotationInterval, gracePeriod */ })
oauthProvider({
  loginPage, consentPage,
  scopes: ['openid', 'profile', 'email', 'offline_access', 'roles', 'directory'],
  grantTypes: ['authorization_code', 'refresh_token'],
  storeClientSecret: 'hashed',
  allowDynamicClientRegistration: false,
  accessTokenExpiresIn: 900,
  idTokenExpiresIn: 3600,
  refreshTokenExpiresIn: 2_592_000,
  clientReference: () => 'instance',
  clientPrivileges: ({ user }) => /* owner or admin */,
  customIdTokenClaims, customUserInfoClaims,   // profile, email, locale, zoneinfo, roles
  resources: [{ identifier: `${SV_URL}/api/v1`, allowedScopes: ['directory'] }],
  enforcePerClientResources: false,
})
```

## Decisions

All seven were accepted as recommended on 2026-10-27.

| #   | Decision                                                                                          | Outcome                                                                                                                                                           |
| --- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Secret rotation (C1): drop the 24-hour overlap and rotate immediately, or build overlap ourselves | **Immediate only.** Overlap would mean wrapping client authentication in the token endpoint; not worth it for Phase 1. Operators rotate during a planned redeploy |
| 2   | Back-channel logout (D3): move into Phase 1                                                       | **Yes.** Add the field to app registration and document it for app authors                                                                                        |
| 3   | Reuse detection wording (D2)                                                                      | Accept the plugin's behaviour; state it in the spec                                                                                                               |
| 4   | Development redirect URIs (B4)                                                                    | Allow `http` on `localhost`/`*.localhost` only when `SV_URL` is `http`                                                                                            |
| 5   | Directory API token model (B7)                                                                    | Resource-scoped JWT plus a revocation lookup                                                                                                                      |
| 6   | Profile and email claims in the ID token (B6)                                                     | Yes, scope-gated, for compatibility with ordinary relying parties                                                                                                 |
| 7   | JWKS rotation                                                                                     | Rotate every 90 days with a 30-day grace period                                                                                                                   |

## Effect on the spec and epics (applied 2026-10-27)

| Where                        | Change                                                                                                                                                                                                                 |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Spec §3.6.1, §3.6.5 (new)    | Discovery at the root with `iss` = instance URL; PKCE `S256` required for **all** clients; refresh reuse removes every token the client holds for that account; signing-key rotation; sign-out and back-channel logout |
| Spec §3.7.3                  | Secret rotation takes effect immediately; remove the 24-hour option                                                                                                                                                    |
| Spec §3.7.1                  | The back-channel logout URI is used from Phase 1, not "stored for later"; add the optional end-session flag                                                                                                            |
| Spec §3.16                   | Remove "acting on back-channel logout" from the not-in-Phase-1 list                                                                                                                                                    |
| Spec §3.3.6, §3.6.3          | Deactivation and deletion revoke every token row, including `offline_access` refresh tokens                                                                                                                            |
| Spec §3.6.4, §3.11           | "Remove access" revokes the client's tokens for that account                                                                                                                                                           |
| Task 6.1                     | Config above; tests for each verified behaviour; claims hooks                                                                                                                                                          |
| Task 6.3                     | One revocation routine for deactivation, deletion and consent removal; back-channel logout test                                                                                                                        |
| Task 7.1                     | Rows written through the adapter; trusted flag; launcher fields in `metadata`; `clientReference`; dev redirect rule; rotation is immediate (the fallback already written there)                                        |
| Task 8.6                     | Rotation dialog without the overlap choice; back-channel logout URI field                                                                                                                                              |
| Task 10.2                    | Resource-scoped JWT plus a revocation check                                                                                                                                                                            |
| Task 0.5 / `sovereign-infra` | Make core's public URL reachable from inside its container                                                                                                                                                             |
