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

## Addendum: well-known first-party client for official native shells

**Status:** Draft — proposed, not implemented. Everything above this section
already shipped and is unaffected; this addendum only adds new scope for a
consumer that doesn't exist yet ([RFC 0082 §5](0082-focused-plugin-app-shell.md#5-auth--cookie-now-durable-session-named-as-the-sequel)'s
"durable session sequel," itself still an unbuilt design sketch, not an
accepted commitment). Don't implement this addendum ahead of that consumer
being scheduled.

### Motivation

v1's registration model (above) requires an admin to manually create a
client in Console — a display name, an exact redirect URI, generated
secret — before any external app can authenticate against that instance.
That's the right model for its actual use case: a specific, known,
deliberately-integrated third-party app on its own domain.

It's the wrong model for `sovereign-desktop` / `sovereign-mobile`. Those are
**universal shells** — a single published binary that connects to whatever
self-hosted instance a user types in, including one it has never talked to
before. RFC 0082 §5 names this exact gap: "A single published binary talking
to arbitrary self-hosted instances would require every operator to
hand-register a client in Console before login works — unacceptable for a
store app." Today there is no way for either shell to become a registered
OAuth client on a fresh instance without that instance's admin taking
action first, which makes RFC 0082 §5's OS-keychain-backed durable session
(and, transitively, sovereign-desktop epic task 17.4) unbuildable as
sketched.

### Proposed design

1. **Two fixed, literal, publicly-known client IDs**, checked into this repo
   and treated as platform constants — proposed `sovereign-desktop` and
   `sovereign-mobile` (exact strings TBD; see Open questions). **No client
   secret** — both are PKCE-only public clients. This isn't a weaker version
   of the v1 model's secret-bearing clients; it's the correct model for a
   distributed native binary, which cannot keep a secret regardless of how
   it's registered (RFC 8252's standard guidance for native-app OAuth).

2. **Recognition happens in code, not data.** No database row, no
   migration, nothing in Console for an admin to see, register, or
   accidentally delete. `apps/auth/src/auth.ts`'s OAuth provider wiring (or
   a thin lookup shim in front of `@better-auth/oauth-provider`) treats
   these two IDs as always-valid on every instance, each with exactly one
   hardcoded expected `redirect_uri`:
   - `sovereign-desktop` → `sovereign://oauth/callback` (the exact custom
     scheme `sovereign-desktop` epic task 17.3 already registers via
     `tauri.conf.json`'s `plugins.deep-link.desktop.schemes` — no new
     scheme needed)
   - `sovereign-mobile` → whatever custom scheme that repo registers for
     the equivalent purpose (unconfirmed from this session — needs
     checking against `sovereign-mobile` before implementation)

   **Unverified as of this draft:** whether `@better-auth/oauth-provider`
   actually exposes a pluggable client-resolution hook for this, or whether
   built-in-client recognition would require patching around its internal
   client store. This needs checking against the actual package source
   before the design above can be called final — flagged in Open questions,
   not assumed.

3. **Redirect URI matching stays exact-string-only**, per §5 above — a
   well-known client's redirect is exactly one hardcoded value, so this
   doesn't loosen that rule; it's exact-match against a compiled-in
   constant instead of a database-stored one.

### Security considerations

- No secret to leak, by design — the ID being publicly known is the point
  of a PKCE public client, not a weakness introduced here.
- The real security boundary is (a) PKCE `code_verifier` possession and
  (b) exact match against a compiled-in native-app redirect scheme. A
  malicious app that also registers the same custom scheme on the same
  device (a known risk class for native-app OAuth, historically worse on
  Android than iOS/macOS) could observe the authorization _code_ via the
  redirect, but cannot complete the token exchange without the
  `code_verifier`, which never leaves the legitimate app's process. This
  narrows but does not fully eliminate scheme-hijacking risk — accepted
  residual risk consistent with mainstream native-app OAuth (RFC 8252), not
  a novel gap.
- These two clients are valid on **every** instance unconditionally, with
  no per-instance revoke path in this design (contrast: an admin-registered
  client can be deleted in Console in seconds). A compromise of the
  shell's own build/release pipeline would let a malicious "official" build
  authenticate against any instance whose user trusts it enough to run it —
  a materially larger and slower-to-revoke blast radius than today's
  per-instance model. Not a new category of risk (a compromised official
  build is already catastrophic today — it already has the URL the user
  typed their own instance into, and can already render a fake login form),
  but the blast radius is real and worth the reviewer weighing deliberately,
  not inheriting by default.

### Alternatives considered

- **Fully dynamic client self-registration**
  (`allowDynamicClientRegistration: true`), gated by some verifiable
  proof of official-ness (app attestation on iOS/Android, code-signing
  verification on desktop). Rejected for this draft: meaningfully more
  complex, and its security properties depend on platform attestation APIs
  this repo has no existing integration with. The fixed-ID + PKCE approach
  reaches equivalent practical security (no secret to protect, redirect-URI
  scoped) for far less implementation risk.
- **Per-instance admin opt-in toggle** (a single Console switch — "Allow
  official Sovereign apps" — rather than always-on): a middle ground
  addressing the operator-control tradeoff above without per-client manual
  registration. Not adopted here; left open below rather than settled
  unilaterally, since it's a real operator-trust question, not just an
  implementation detail.

### Open questions

- Does `@better-auth/oauth-provider` support pluggable client resolution,
  or does recognizing a well-known client without a database row require
  patching around its internals? Verify against the actual package source
  before implementation.
- Exact literal client-ID strings for both shells — proposed
  `sovereign-desktop` / `sovereign-mobile` above, not finalized.
- `sovereign-mobile`'s exact custom-scheme redirect URI — unconfirmed from
  this session; needs checking against that repo.
- Should Console surface these two clients read-only, for operator
  visibility into what can authenticate against their instance, or not
  display them at all since there's nothing to configure?
- Should there be an instance-level opt-out (see Alternatives), or is
  first-party-shell access always-on — the same category as the platform's
  own built-in Console/Launcher/Account plugins not being uninstallable?

This addendum does not by itself unblock RFC 0082 §5 or sovereign-desktop
epic task 17.4 — it is the design that would unblock them once accepted,
the open questions above are resolved, and epic tasks are assigned to build
it.

## Changelog

| Version | Date        | Change                                                                                                                                                                                                                                                                                                                                                              |
| ------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0.1     | July 2026   | Initial draft                                                                                                                                                                                                                                                                                                                                                       |
| 0.2     | July 2026   | Implemented. Switched from the deprecated bundled `oidc-provider` to `@better-auth/oauth-provider`; corrected the custom-table assumption (plugin auto-manages its own schema); dropped the `tenant` claim (no multi-tenant concept in this platform); resolved both admin-gating open questions.                                                                   |
| 0.3     | August 2026 | Added the well-known first-party client addendum (draft, not implemented) — a design for `sovereign-desktop`/`sovereign-mobile` to authenticate as OAuth clients on arbitrary self-hosted instances without per-instance admin registration, proposed while scoping sovereign-desktop epic task 17.4 (blocked without it) and RFC 0082 §5's durable-session sketch. |
