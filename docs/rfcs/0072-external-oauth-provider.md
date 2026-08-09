# RFC 0072 — External OAuth/OIDC provider for non-plugin apps

**Status:** Implemented\
**Date:** July 2026\
**Author:** External contributor (submitted for consideration; adapted to repository conventions and revised during implementation against the actual `@better-auth/oauth-provider` API)\
**Scope:** `apps/auth`, `runtime` (better-auth client version only), `plugins/console`, `docs/self-hosting.md`, `docs/security.md`, `docs/upgrade.md`. Builds on RFC 0021 (platform roles & capabilities).\
**Incorporated into plan:** Yes — epic tasks 1.18, 1.24 (addendum, partial).

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

**Status:** Partially implemented (2026-08, epic task 1.24) — the seeding
infrastructure below (points 1–3) is built and live; the shell-side consumer
(§5's actual PKCE flow + OS keychain storage) is not, and remains genuinely
unscheduled. RFC 0082 is now **Accepted** (`docs/rfcs/README.md`), but its own
adoption path (epic tasks 2.27, 20.11, 20.12) doesn't include §5 — that stays
a separate follow-up per RFC 0082 itself. Nothing in the shipped product
consumes this yet; today's shells authenticate
fine via plain WebView cookie sessions either way. The remaining open
questions below (revocation semantics, Console visibility, the opt-out
toggle) are still genuinely unresolved product decisions — don't guess at
them; they matter more once a real shell-side consumer exists.

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

**Verified against the installed `@better-auth/oauth-provider@1.6.25` package**
(its `.d.mts` type definitions — the actual shipped API, not assumption).
This corrected an earlier version of this draft, which proposed two fixed
literal client IDs (e.g. `sovereign-desktop`) shared identically across
every instance. That's not how the package works: **`adminCreateOAuthClient`
never accepts a caller-supplied `client_id` — every client gets a
server-generated ID, and there is no pluggable client-resolution hook to
special-case a fixed one.** The design below reflects what the package
actually supports, not the original sketch.

1. **Not implemented via `adminCreateOAuthClient` — corrected 2026-08,
   verified live, not assumed.** The original draft claimed this endpoint
   was directly callable from server code because it's marked `SERVER_ONLY`.
   That's true of its HTTP-reachability, but its handler still calls
   `assertClientPrivileges`, which throws `UNAUTHORIZED` without a real user
   session (`getSessionFromCtx(ctx)`, checked against `clientPrivileges` in
   `apps/auth/src/auth.ts`) — and there is no session at server boot.
   `epic task 1.24` seeds the row via a direct `INSERT` into the
   `oauthClient` table instead (`apps/auth/src/builtin-oauth-clients.ts`),
   the same pattern `instrumentation.ts`'s RFC 0021 owner-migration already
   uses for `better-auth`-owned tables. No patching or forking the package —
   the row shape (JSON-encoded array columns, boolean-as-0/1 on SQLite,
   `ON DELETE CASCADE userId` left `NULL`) was reverse-engineered from a
   client actually created through the legitimate `adminCreateOAuthClient`
   path with a genuine session, not guessed from the package's `.d.mts`
   types alone, and the seeded row was confirmed to resolve correctly
   through `getClient()` — the same internal resolver the real authorize
   flow uses.

2. **Implemented: seed one native, secretless, PKCE-required client per
   shell at auth server startup**, idempotently —
   `apps/auth/instrumentation.ts` calls `seedBuiltinOAuthClients()` after
   migrations run, keyed on a stable value in the `name` column (doubles as
   the idempotency check) rather than `metadata`:
   - `sovereign-desktop` → `sovereign://oauth/callback` (epic task 17.3's
     existing scheme)
   - `sovereign-mobile` → `sovereign://oauth/callback` — **resolved**: both
     shells register the identical `sovereign://` scheme (confirmed against
     `sovereign-mobile`'s `Info.plist`/`AndroidManifest.xml`, added for deep
     linking, epic task 20.14). No collision risk despite the identical
     literal string — each is a distinct server-side client row scoped by
     its own `client_id`, and the two shells never coexist on the same OS.

   The resulting `client_id` is **server-generated (a `randomUUID()`, not
   better-auth's own generator — its exact ID alphabet is an internal
   implementation detail this doesn't need to match) and different on every
   instance** — there is no shared literal string. `cachedTrustedClients` is
   **not used** — left for the still-open revocation-semantics question
   below, since populating it now would prejudge that decision.

3. **Implemented: `GET /api/instance` now returns `oauthClients`**
   (`runtime/src/instance-oauth-clients.ts`, called from
   `runtime/app/api/instance/route.ts`) — a server-to-server call to a new
   public, unauthenticated `apps/auth` route,
   `GET /api/oauth-clients` (`apps/auth/app/api/oauth-clients/route.ts`),
   which re-seeds on read (cheap and idempotent) rather than trusting
   startup timing alone. Resolves the addendum's own "upgrade window" open
   question from below: an instance that hasn't seeded yet, or whose auth
   server is unreachable, gets the field **omitted entirely**, not an error
   — the shell already has to treat a missing field as "not yet available"
   for any older-platform-version instance, so no new case to handle.

4. **Redirect URI matching stays exact-string-only**, per §5 above — each
   seeded client's redirect is exactly one value stored on its own
   `OAuthClient` row, so this doesn't loosen that rule at all; it's the
   same exact-match behavior every other client already gets.

### Security considerations

- No secret to leak, by design — the generated ID being discoverable via a
  public endpoint is the point of a PKCE public client, not a weakness
  introduced here.
- The real security boundary is (a) PKCE `code_verifier` possession and
  (b) exact match against each instance's own stored `redirect_uri`. A
  malicious app that also registers the same custom scheme on the same
  device (a known risk class for native-app OAuth, historically worse on
  Android than iOS/macOS) could observe the authorization _code_ via the
  redirect, but cannot complete the token exchange without the
  `code_verifier`, which never leaves the legitimate app's process. This
  narrows but does not fully eliminate scheme-hijacking risk — accepted
  residual risk consistent with mainstream native-app OAuth (RFC 8252), not
  a novel gap.
- **Revised from an earlier version of this draft, which assumed one
  shared client ID trusted unconditionally by every instance:** because
  each instance seeds and stores its _own_ client independently (point 2),
  an operator can revoke it the same way as any other client — delete the
  row in Console (or, if `cachedTrustedClients` is used to protect it from
  accidental deletion, whatever un-cache/disable path that requires). A
  compromised official shell build is contained per-instance, not trusted
  everywhere until a platform-wide fix ships — a meaningfully better story
  than the original sketch, and worth noting as a reason this correction
  is an improvement, not just a complication. What doesn't change: nothing
  stops a compromised build from authenticating against any instance whose
  _user_ still trusts it enough to run it and hasn't revoked access —
  that part is inherent to any first-party client model, not specific to
  this design.
- Whether `cachedTrustedClients` (making the seeded client immutable
  through Console's CRUD) is worth trading against the revocability above
  is exactly the operator-control question the Alternatives section's
  opt-out toggle addresses — not resolved here.

### Alternatives considered

- **Fully dynamic client self-registration**
  (`allowDynamicClientRegistration: true`), gated by some verifiable
  proof of official-ness (app attestation on iOS/Android, code-signing
  verification on desktop). Rejected for this draft: meaningfully more
  complex, and its security properties depend on platform attestation APIs
  this repo has no existing integration with. Bootstrap-seeding a native
  PKCE public client per instance (proposed above) reaches equivalent
  practical security (no secret to protect, redirect-URI scoped, and now
  per-instance revocable) for far less implementation risk.
- **Per-instance admin opt-in toggle** (a single Console switch — "Allow
  official Sovereign apps" — rather than always-on): a middle ground
  addressing the operator-control tradeoff above without per-client manual
  registration. Not adopted here; left open below rather than settled
  unilaterally, since it's a real operator-trust question, not just an
  implementation detail.

### Open questions

- **Confirmed still open, not merely hypothetical:** `cachedTrustedClients`
  is not used (see point 2 above), so an operator who deletes a seeded
  client via Console gets it **silently recreated** on the next auth-server
  restart — `seedBuiltinOAuthClient` has no way to distinguish "never
  created yet" from "created, then deliberately removed," since it only
  checks for a row matching the stable `name`. Not fixed in epic task 1.24;
  needs a persistence mechanism (e.g. a tombstone row, or an
  `auth_settings`-style marker) before this matters — i.e. before any real
  shell-side consumer exists and an operator could actually want to revoke
  one.
- Should Console surface these two clients read-only, for operator
  visibility into what can authenticate against their instance, or not
  display them at all since there's nothing to configure?
- Should there be an instance-level opt-out (see Alternatives), or is
  first-party-shell access always-on — the same category as the platform's
  own built-in Console/Launcher/Account plugins not being uninstallable?

**Resolved:** `sovereign-mobile`'s redirect scheme (`sovereign://oauth/callback`,
same as desktop) and the upgrade-window behavior of `GET /api/instance`'s
`oauthClients` field (omitted, not an error) — see points 2–3 above.

This addendum's seeding infrastructure (points 1–3) is implemented and live
(epic task 1.24), but **does not by itself unblock RFC 0082 §5 or
sovereign-desktop epic task 17.4** — those need the actual shell-side PKCE
flow and OS keychain storage built against this, plus the remaining open
questions above resolved, neither of which is scheduled yet.

## Changelog

| Version | Date        | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 0.1     | July 2026   | Initial draft                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 0.2     | July 2026   | Implemented. Switched from the deprecated bundled `oidc-provider` to `@better-auth/oauth-provider`; corrected the custom-table assumption (plugin auto-manages its own schema); dropped the `tenant` claim (no multi-tenant concept in this platform); resolved both admin-gating open questions.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 0.3     | August 2026 | Added the well-known first-party client addendum (draft, not implemented) — a design for `sovereign-desktop`/`sovereign-mobile` to authenticate as OAuth clients on arbitrary self-hosted instances without per-instance admin registration, proposed while scoping sovereign-desktop epic task 17.4 (blocked without it) and RFC 0082 §5's durable-session sketch.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 0.4     | August 2026 | Corrected the addendum's mechanism against the actual installed `@better-auth/oauth-provider@1.6.25` package: `adminCreateOAuthClient` never accepts a caller-supplied `client_id`, so the "two fixed literal IDs shared across every instance" sketch in 0.3 doesn't work as written. Revised to per-instance bootstrap seeding (idempotent, using the already-shipped `adminCreateOAuthClient` — confirms no patching of the package is needed) plus a new `GET /api/instance` discovery field the shell reads to learn its generated ID. Net effect is a better security story than 0.3's (each instance's client is now independently revocable, not trusted unconditionally everywhere) at the cost of new open questions around deletion/recreation semantics and upgrade-window behavior. Still draft; still not implemented.                                                                         |
| 0.5     | August 2026 | **Partially implemented (epic task 1.24).** Live-verified `adminCreateOAuthClient` itself doesn't work as 0.4 assumed — it's `SERVER_ONLY` but still requires a real user session internally, which doesn't exist at server boot — and corrected the mechanism to a direct `INSERT` into `oauthClient` instead, with the row shape reverse-engineered from a client created through the real admin path and confirmed to resolve via the same `getClient()` the authorize flow uses. Seeding (points 1–2) and `GET /api/instance` discovery (point 3) are shipped and live. Resolved the `sovereign-mobile` redirect-scheme and upgrade-window open questions. The revocation/recreation gap is now confirmed real, not hypothetical. The shell-side PKCE flow and OS keychain storage — the part that actually unblocks RFC 0082 §5 and sovereign-desktop epic task 17.4 — remains unbuilt and unscheduled. |
