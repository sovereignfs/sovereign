# Research 0002 — Third-party apps against core's sign-in server

|                     |                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Status**          | Decided: recommendations 1 and 4 were accepted on 2026-10-30. The second is applied and the third is done. The fifth is not yet decided                                                                                                                                                                                                                                                                            |
| **Date**            | October 2026                                                                                                                                                                                                                                                                                                                                                                                                       |
| **Author**          | Claude Code                                                                                                                                                                                                                                                                                                                                                                                                        |
| **Scope**           | `docs/specs/core-app.md` §3.6, §3.7; `docs/connecting-an-app.md`; tasks [12.6](../epics/release.md) and [12.7](../epics/release.md) and [12.8](../epics/release.md)                                                                                                                                                                                                                                                |
| **Versions tested** | Core 0.51.0 (image built from commit `8d088db`). oauth2-proxy v7.15.5 (`sha256:8498b0d0…`). Grafana 13.3.0 (`sha256:488984b7…`). Linkding 1.47.0 (`sha256:e35c…`), which uses `mozilla-django-oidc` 5.0.2 and PyJWT 2.13.0. Follow-up: Homarr v2.9.1 (`sha256:9421086c…`, Auth.js, `@auth/core` 0.41.3), BookStack v26.09.2 (linuxserver build `ls294`, `sha256:da632423…`), Karakeep v0.34.1 (`sha256:69ae5315…`) |

---

## Question

Core's guide says any app that speaks OpenID Connect can sign people in with it. Until now the only app that had tried was the
acceptance suite's own stub. Core is stricter than many providers: ID tokens are signed with EdDSA only, PKCE is required of every
app, an app is registered for `client_secret_basic`, and the claims on offer have no `preferred_username` and no `groups`. Which
real apps does that keep out, why, and what, if anything, should core change?

## Method

Core ran from a locally built image on SQLite, as a development instance at `http://core.localhost:3000`. Each app ran in a
container, published on its own `*.localhost` port. Every container, core included, was started with
`--add-host <name>.localhost:host-gateway`, so each reached core, and core reached each of them, through the host's published ports.
A headless Chromium (Playwright) drove each sign-in, and each app was registered through the Console's own form. The owner's email
was marked verified in the database, as it would be on an instance that requires verification. Each app was configured from its own
documentation or `--help`, as the guide says: the issuer, the client ID and the secret, and then whatever its failures required.

The protocol questions were also asked of the token endpoint directly, with `curl`, using fresh authorization codes.

**Not verified:**

- **Auth.js (Next.js) apps and PHP apps.** Covered by the follow-up below, with one app each.
- **Java, .NET, Ruby and Rust apps**, and apps whose OpenID Connect support is a separate plugin.
- **The TLS path.** The first three apps ran on a development instance that accepts `http`. The follow-up ran behind a proxy with a
  private certificate authority; nothing here used a publicly trusted certificate.
- **Back-channel logout.** None of the three has a setting for it, as far as the documentation and `--help` read for this showed.
- **RS256.** Core cannot issue it, so whether an app that rejects EdDSA works with RS256 is expected and not tested.

## Results

| Check                                        | oauth2-proxy                                          | Grafana                                                       | Linkding                                                       |
| -------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------- | -------------------------------------------------------------- |
| Connects with the guide's three values alone | No: PKCE is off                                       | No: PKCE is off                                               | No: it sends the secret in the body                            |
| PKCE `S256`                                  | Works with `--code-challenge-method=S256`             | Works with `use_pkce=true`                                    | Sends it by default                                            |
| Secret in a Basic header                     | Yes                                                   | Yes (`auth_style` auto-detect). Forced into the body: fails   | **No.** Body only, and no setting reaches the library's switch |
| Verifies an EdDSA ID token                   | Yes                                                   | Yes, once told to check the signature. It does not by default | **No.** The library cannot, whatever the setting               |
| Identity it takes                            | `email`. Its user is `sub`                            | `email` as login, `name` as name                              | Not reached                                                    |
| Refresh token                                | Works (a refresh after 1m33s, no error)               | Not tested (an access token lasts 15 minutes)                 | Not reached                                                    |
| Sign-out                                     | Clears its own cookie. The next request signs back in | Sends the person to core without a hint: core ends nothing    | Not reached                                                    |
| What the person sees when it fails           | `403 Forbidden`                                       | "Login provider denied login request"                         | `Server Error (500)` or `Bad Request (400)`                    |

## Findings

### A. An app registered the usual way cannot send its secret in the body

Core refuses `client_secret_post` with `invalid_client`: `client registered for client_secret_basic cannot use client_secret_post`.
It does so although discovery lists `client_secret_post` and `private_key_jwt` among the methods it supports. Discovery lists what the
provider knows. Each client is registered for one, and the Console registers every confidential app for `client_secret_basic`
(`apps/core/src/clients/registry.ts`). A client with no secret is refused as well (`cannot use none`).

Linkding's library sends the secret in the body by default. It has a switch for Basic (`OIDC_TOKEN_USE_BASIC_AUTH`), but Linkding
passes a fixed list of settings through from the environment and that is not on it, so an operator cannot reach it.

An experiment shows the fix is a registration setting, not a deeper change. With that one client's method changed to
`client_secret_post` in the test database (by hand, with no code change), the exchange succeeded and Linkding went on to fail at the
signature check (B). Grafana, forced to send the secret in the body, failed with core's same refusal.

### B. One library cannot verify EdDSA, and no setting fixes it

`mozilla-django-oidc` 5.0.2 fetches the provider's keys only when the configured algorithm starts with `RS` or `ES`. For any other
name, `verify_token` uses the client secret as the key. With `OIDC_RP_SIGN_ALGO=EdDSA` the result is
`InvalidKeyError: Not a public or private key`. With the documented default, `RS256`, it refuses core's tokens: `The provider
algorithm 'EdDSA' does not match the client's OIDC_RP_SIGN_ALGO`. Both are the library's design, and Linkding offers no way around it.

The two Go stacks verify EdDSA. oauth2-proxy does it by default. Grafana does it only when `validate_id_token` is on, which it is not
by default, and that was shown to be a real check: with a wrong key address the login fails with `signing key not found for kid`. An
operator who never turns it on would not learn whether their Grafana could have verified the tokens.

Core's discovery advertises `EdDSA` as the only algorithm.

### C. PKCE is a setting away, but the failure does not say so

All three can send PKCE. Two have it off until it is turned on. The person sees `403 Forbidden` (oauth2-proxy) or "Login provider
denied login request" (Grafana). The reason is only in the redirect and the app's log: `pkce is required for this client`, or, when
`offline_access` is requested, `pkce or OIDC nonce is required when requesting offline_access scope`. oauth2-proxy's log also warns that
the provider supports `S256` and it is not enabled.

Core's behaviour is as the spec says, and was checked directly: a request without `code_challenge` is refused at the authorize
endpoint, `plain` is refused (`code_challenge_method must be one of: S256`), an exchange with no verifier or a wrong one is refused,
and a code cannot be used twice.

### D. There is no `preferred_username` and no `groups`

The ID token carries `name`, `email` and `email_verified` for the granted scopes (and `picture`, `locale`, `zoneinfo` when set).
Userinfo also returns `given_name` and `family_name`, which the provider derives from `name`. The ID token does not carry them and the
spec does not promise them, although discovery lists them in `claims_supported`.

What an app does without a username claim differs. oauth2-proxy's user is the opaque `sub`, and its `PreferredUsername` is empty.
Grafana's login is the email address. Linkding's documented default is the email. None failed for want of it, but an app that
requires `preferred_username`, or maps roles from `groups`, would need configuring, and `roles` reaches only a trusted app.

### E. Signing out does not reach the apps

- An app's own sign-out clears only that app. oauth2-proxy's returned the person to a page that started a new sign-in, and core's live
  session signed them straight back in.
- Grafana, set to send the person to core's end-session endpoint, sent the bare address with no `id_token_hint`. Core could not match
  the request to a session, showed its confirmation page, and ended nothing: the person stayed signed in to core. Why Grafana sent no
  hint was not investigated.
- No tested app takes a back-channel logout. So signing out of core does not sign them out, and an app's session lasts until its own
  expiry. Refresh tokens issued for `offline_access` outlive core's session by design, so oauth2-proxy's refreshed afterwards.

### F. What worked

Discovery with an `http` issuer; the consent screen for an untrusted app, on the first use; the authorization code flow with PKCE for
all three; EdDSA verification in two Go stacks; refresh-token rotation, with the new token accepted; userinfo; and an app reaching
core by the same public address a browser uses, which is the arrangement a suite depends on.

## Follow-up: Auth.js and PHP apps (task 12.8)

Three more apps were tried, to cover the two families the first pass left out.

### Method changes

The same harness, with two changes forced by what the apps could reach:

- **A proxy with TLS in front of everything.** Core and each app sat behind one Caddy with `tls internal`, under the names `core.test`,
  `homarr.test` and `bookstack.test`. Every name was a network alias of the proxy, so each container reached the others by the address
  a browser uses. This is the topology RFC 0002 describes, and the apps' sign-in addresses were `https`, registered under the
  production rules.
- **Why not `*.localhost` again.** Homarr resolves names through a cached resolver that answers `127.0.0.1` for any `.localhost` name and
  ignores a host entry, so it never reached core. And core advertises an `https` issuer for an `http` address that is not `localhost`
  (found while setting this up), so a real name needs TLS from the start.
- **The private authority is an artefact.** Each app had to be told to trust Caddy's root. Homarr ignores `NODE_EXTRA_CA_CERTS` and reads
  `.crt` files from a folder of its own (`LOCAL_CERTIFICATE_PATH`); BookStack's PHP uses the system store, so the root was installed
  through the image's init hook. A real certificate needs neither, and none of this counts against core.

**Karakeep is not an Auth.js app.** It was chosen as one, and its settings still say `NEXTAUTH_*`, but at v0.34.1 its provider is
better-auth's generic OAuth. It is kept in the table because it is the same stack as the apps built for Sovereign. **Homarr** is the
Auth.js app: `@auth/core` 0.41.3 with `next-auth` 5.

### Results

| Check                                        | Homarr (Auth.js)                                                       | BookStack (PHP)                                                 | Karakeep (better-auth)           |
| -------------------------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------- | -------------------------------- |
| Connects with the guide's three values alone | No: it asks for a `groups` scope                                       | No: it stops before reaching core                               | **Yes**                          |
| PKCE `S256`                                  | On by default                                                          | In its code (a PKCE code is kept in the session). Not reached   | On by default (`pkce: true`)     |
| Secret in a Basic header                     | Yes, the default (and a setting to change it)                          | Yes, by its source (`HttpBasicAuthOptionProvider`). Not reached | Yes, the default (and a setting) |
| Verifies an EdDSA ID token                   | Yes, with no setting                                                   | **No.** RS256 only, in three places in its code                 | Yes                              |
| Identity it takes                            | `name` once pointed at it. By default `preferred_username`, then fails | Not reached                                                     | `name` and `email`               |
| Administrator rights                         | Only through a `groups` claim, which core does not send (see I)        | Not reached                                                     | Not tested                       |
| What the person sees when it fails           | "Log in to your account", with a generic error                         | "An unknown error occurred", before any redirect to core        | n/a                              |

### Findings

#### G. A scope core does not offer ends the sign-in

Homarr asks for `openid email profile groups` by default. Core answers the authorization request with
`invalid_scope: The following scopes are invalid: groups`, and the person sees only a generic login error. Restricting the app's scopes
to the ones in the guide's table fixes it. OpenID Connect Core says a scope an implementation does not understand SHOULD be ignored, so
this is core being stricter than the specification asks, and it will catch any app that asks for `groups` or a scope of its own.

#### H. Some apps require `preferred_username`

With the scopes fixed, Homarr fails with `OAuthProfileParseError`. Its code, not its log, gives the reason: it names the user from
`preferred_username` and throws "did not return a name" when it is absent. Auth.js hides the message. A setting
(`AUTH_OIDC_NAME_ATTRIBUTE_OVERWRITE=name`) points it at `name`, and the sign-in then works. Without that setting nobody can sign in.

#### I. A trusted app can use `roles` where an app wants groups

Homarr's first-run setup needs the name of an administrator group "sent by LDAP or OIDC", and core sends no `groups`. Signed in as an
ordinary person, the owner could not continue setup. With the app registered as **trusted** and the `roles` scope requested, setting the
group claim to `roles` and the administrator group to `platform:owner` made Homarr log `Added user to groups successfully` and let the
owner resume setup as an administrator. This works only for a trusted app, and only where the app lets the claim be named.

#### J. A PHP app that accepts RS256 only fails before it reaches core

BookStack, with discovery on, reads core's key set and keeps only keys that are `kty: RSA`, `use: sig` and `alg: RS256`
(`OidcProviderSettings::filterKeys`). Core publishes only `OKP`/`EdDSA` keys, so none remain, and the person sees "An unknown error
occurred" with the cause only in its log: `Missing required configuration "keys" value`. Elsewhere its code refuses any ID token whose
`alg` is not `RS256` and any key that is not RSA. No setting changes this. Its other behaviour, by its source, suits core: Basic
authentication and PKCE.

#### K. Karakeep connects with nothing beyond the guide

Discovery address, client ID and secret were enough: sign-in, consent, and the dashboard. It runs on the stack the apps built for
Sovereign use.

### Where the six apps stand

| Family                | App          | Connects                | What stands in the way                           |
| --------------------- | ------------ | ----------------------- | ------------------------------------------------ |
| Go (`go-oidc`)        | oauth2-proxy | Yes                     | PKCE off until a setting turns it on             |
| Go (own OAuth code)   | Grafana      | Yes                     | PKCE off until a setting turns it on             |
| Django                | Linkding     | **No**                  | Secret in the body, and no EdDSA                 |
| better-auth (Next.js) | Karakeep     | Yes                     | Nothing                                          |
| Auth.js (Next.js)     | Homarr       | Yes, after two settings | Scope `groups`; `preferred_username` as the name |
| PHP (Laravel)         | BookStack    | **No**                  | EdDSA: it accepts RS256 only                     |

Two of six cannot connect, and for the same reason in part: **both reject EdDSA outright**, and both are server frameworks with their
own token handling. One of them also needs the secret in the body. No app needed a way to turn PKCE off.

## Recommendation

1. **Task 12.7 is needed, and narrower than planned.**
   - **Accept the secret in the body**, as a per-app choice made when the app is registered, with Basic the default. One of three apps
     needs it, and discovery already advertises it. Core's behaviour when it is chosen has to be checked in that task, since this
     research changed a database row and not a setting.
   - **Add RS256 as an additional ID-token algorithm**, off for an app unless chosen, with EdDSA the default. The same app needs it.
     Whether better-auth can sign with a second algorithm for chosen apps only is for that task to find out.
   - **Do not add "this app can't send PKCE".** No app in this sample needed it, and the two that had PKCE off needed one setting to
     turn it on. Revisit it if Auth.js or PHP apps show otherwise.
2. **The guide says what was found** (done in this task): the secret is Basic only for now, PKCE is often off by default, EdDSA is not
   universal, the claims core does and does not give, and how far sign-out reaches.
3. **Try the families that were not tried** (done, in the follow-up above, for Auth.js and PHP; Java, .NET, Ruby and Rust remain).
4. **Consider** having core ignore a scope it does not offer, as OpenID Connect Core says an implementation SHOULD, instead of refusing the
   whole sign-in (G). It would let an app that asks for `groups` connect with no change, and it is a candidate for task 12.7 or one of its own.
5. **Consider** having core name the missing thing in the page a person sees when PKCE is missing. The app owns that page today, and the
   reason reaches the person only as `403` or "denied".

## Reproducing it

```bash
docker build -t sovereign:compat .
docker run -d --name compat-core -p 3000:3000 \
  --add-host core.localhost:host-gateway --add-host <app>.localhost:host-gateway \
  --env-file core.env -e SV_URL=http://core.localhost:3000 -e SV_DB_DIALECT=sqlite \
  -e SV_SQLITE_URL=file:/data/core.db -e SV_AUTH_REQUIRE_EMAIL_VERIFICATION=false -v compat-core:/data sovereign:compat
# Each app: --add-host core.localhost:host-gateway, and a redirect address of http://<app>.localhost:<port>/<callback>
```

The owner is made with `POST /api/auth/sign-up/email`, and each app is registered in the Console as the guide says (untrusted, the
`profile`, `email` and `offline_access` scopes). The settings that mattered:

| App          | Settings beyond the issuer, ID and secret                                                                                                                                |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| oauth2-proxy | `--provider=oidc --code-challenge-method=S256 --scope='openid profile email offline_access' --cookie-refresh=1m`                                                         |
| Grafana      | `GF_AUTH_GENERIC_OAUTH_*`: the three endpoints from discovery, `USE_PKCE=true`, `VALIDATE_ID_TOKEN=true` with `JWK_SET_URL`, and `AUTH_STYLE=InParams` to force the body |
| Linkding     | `LD_ENABLE_OIDC=True`, the four `OIDC_OP_*` endpoints, `OIDC_RP_SIGN_ALGO=EdDSA`                                                                                         |

The protocol checks are plain requests to `/api/auth/oauth2/token`: Basic against `client_secret_post` against none, a missing and a
wrong `code_verifier`, and a repeated code.

## Decisions

The first recommendation was accepted as proposed on 2026-10-30, and the fourth, after the follow-up, the same day.

| #   | Decision                                          | Outcome                                                                                                                                                                                                                                                                                                                                                                                   |
| --- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Accept the secret in the request body (A)         | **Yes.** A per-app choice made at registration, with Basic the default. Task 12.7. Core's behaviour when it is chosen is checked there, since this research changed a database row, not a setting                                                                                                                                                                                         |
| 2   | Add RS256 as an additional ID-token algorithm (B) | **Yes.** Off unless chosen for an app, EdDSA the default. Task 12.7, which first finds out whether better-auth can sign with a second algorithm for chosen apps only                                                                                                                                                                                                                      |
| 3   | A "this app can't send PKCE" setting (C)          | **No.** No app tried needed one, and the two that had PKCE off needed one setting to turn it on. Revisit it if Auth.js or PHP apps show otherwise                                                                                                                                                                                                                                         |
| 4   | Ignore a scope core does not offer (G)            | **Yes.** An unrecognised scope is dropped from the authorization request, as OpenID Connect Core says it SHOULD be, and the sign-in goes ahead with the scopes core does know. Task 12.7. The mechanism is expected to be `oauthGuards`, which already rewrites the request's scopes for `roles` (to be confirmed). A scope core knows but the app is not allowed keeps today's behaviour |

The follow-up (task 12.8) leaves the first three standing. It adds a second app that rejects EdDSA and none that needs a way to turn PKCE
off: RS256 is now needed by two of six apps, the secret in the body by one, and a PKCE opt-out by none.

Of the other recommendations, the second is applied (the guide and §3.6.1 say what was found), and the third is done for Auth.js and PHP
(Java, .NET, Ruby and Rust remain untried). The fifth, naming the missing PKCE in what the person sees, is **not yet decided**.

## Effect on the spec and epics (applied 2026-10-30)

- **Epic 12:** task 12.7's deliverables are exactly decisions 1 to 4.
- **RFC 0002:** its outcome points here for the RS256 question.
- **`docs/specs/core-app.md`:** §3.6.1, §3.6.2 and §3.7.1 change first in task 12.7, before any code, as that task says. §3.6.1 already records today's
  Basic-only behaviour.
