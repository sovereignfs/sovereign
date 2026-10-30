# Connecting an app

Core is an OpenID Connect provider, so an app that can sign people in with OpenID Connect can use it, whoever wrote the
app. This is for the person setting one up. What core promises is in [`docs/specs/core-app.md`](specs/core-app.md) §3.6
and §3.7.

## What an app needs to support

Check these first. They are the places an app that says it supports "OAuth" may not fit.

| Core needs                            | So the app must                                                                                                                           |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| The authorization code flow           | Use it. The implicit and password flows are not offered. The client-credentials flow is, but only to an app an operator gave an app scope |
| PKCE with `S256`, for every app       | Send a `code_challenge`, even with a client secret. Many apps have PKCE off until a setting turns it on                                   |
| ID tokens signed with EdDSA (Ed25519) | Verify EdDSA, unless the app is set to RS256 in the Console. Not every library can (below)                                                |
| The client secret in a Basic header   | Send it as `client_secret_basic`, unless the app is set in the Console to send it in the request body                                     |
| A server of its own, or a native app  | Not call the token or userinfo endpoints from a web page: core sends no CORS headers, so a browser blocks it                              |
| `https` addresses                     | Have `https` sign-in and logout addresses. `http` is accepted only on `localhost` on a development instance                               |

An app that signs people in with plain OAuth 2.0, with no ID token, can read the same details from the userinfo endpoint.

Three of these decide whether an app can connect at all:

- **The secret.** Many libraries send the secret in the request body by default. Core refuses that with
  `invalid_client: client registered for client_secret_basic cannot use client_secret_post`, because each app is registered for one
  method and discovery's list is only what core knows. Either look for a setting that sends it in a header, or open the app's
  **Technical settings** in the Console and set **How the app sends its secret** to _In the request body_. Then give the app its secret
  again if it asks, since the setting changes only what core accepts.
- **EdDSA.** Some libraries choose how to check a token from the name of its algorithm, and treat a name they do not know as a
  shared-secret one. They never fetch core's keys, and fail. Some frameworks accept RS256 keys only: they read core's key set, keep
  the RSA keys, find none, and stop before the person is sent anywhere, with a vague error. Others can verify EdDSA but are not asked to unless a setting turns
  signature checking on, so an app can seem to work without ever checking the signature. If the app fails with a message about the
  algorithm or the key, this is the likely cause. In the Console's **Technical settings**, set **How tokens are signed** to _RSA, for apps
  that cannot read the usual way (RS256)_. Core then signs that app's ID tokens with an RSA key it publishes with the other, and every other
  app is unchanged. One limit: logout notices (a back-channel logout) are always signed the usual way, so an app that needs RS256 cannot
  check them.
- **PKCE.** It is often off by default. Turn it on and choose `S256`.
- **Scopes.** Core ignores a scope it does not offer, such as `groups`, and signs the person in with the scopes it knows, so an app that
  asks for extra ones by default needs no change. It cannot give what it does not offer: if the app needs that claim, the app has to do
  without it or take it from a scope in the table below. A request that names no `openid` is still refused.

## An app acting for itself

Most apps only act for a person who is there. An app that must act with nobody present, such as sending a reminder, can ask
core for a token of its own with the client-credentials flow: a `POST` to the token endpoint with its client ID and secret,
`grant_type=client_credentials`, `resource=<SV_URL>/api/v1` and the scopes it needs. Core gives it only what an operator allowed
under **What the app may do on its own** in the app's technical settings (nothing, until then), and only if the app is
confidential. The token lasts 15 minutes, has no refresh token, and names the app and no person. Changing the app's secret or
switching it off ends the tokens it holds. This is not a way to read people's details: `directory` and the scopes about a person
can never be given this way.

## Register the app

In the Console, go to **Apps** and add one. It needs the `client:manage` capability, which the owner and admins have by
default.

1. Give it a **name** and its **sign-in addresses**, one per line. Find the address in the app's documentation, usually
   called the redirect URI or callback URL. It must match exactly, including any trailing slash.
2. Choose the kind of app: **confidential** if it has a server that can keep a secret, **public** if it does not (a
   native or mobile app). This cannot be changed afterwards.
3. Open **Technical settings** to choose what the app may ask to see (below), and any logout addresses.
4. Save, and copy the **Client ID** and **client secret**. The secret is shown once and only a scrambled copy is kept. If
   it is lost, make a new one: the old one stops working at once, so the app must be given the new one straight away.

Fill in the launcher entry if people should find the app on core's home page.

## Configure the app

Most apps need three values:

| Setting       | Value                                                              |
| ------------- | ------------------------------------------------------------------ |
| Issuer        | Core's address, `SV_URL`, with no path: `https://core.example.com` |
| Client ID     | From the Console                                                   |
| Client secret | From the Console. A public app has none                            |

An app that asks for the discovery address, or for its endpoints one at a time, can find them all here:

```text
https://core.example.com/.well-known/openid-configuration
```

Check the address answers before anything else:

```bash
curl -s https://core.example.com/.well-known/openid-configuration
```

The endpoints are under `/api/auth/oauth2/`, but use discovery rather than typing them in. Only the issuer is a promise.

## What the app can ask for

An app gets the scopes it is allowed in the Console **and** the person agrees to.

| Scope            | What it gives                                                               |
| ---------------- | --------------------------------------------------------------------------- |
| `openid`         | `sub`: the person's stable identifier. Use this, not the email address      |
| `profile`        | `name`, `picture`, `locale`, `zoneinfo`                                     |
| `email`          | `email`, `email_verified`                                                   |
| `offline_access` | A refresh token, so the app can keep working after the access token expires |
| `directory`      | Finding other people on the instance (below)                                |
| `roles`          | `roles`: the person's roles on the instance. Trusted apps only              |

The claims appear in the ID token and at the userinfo endpoint, so an app can read them from either. (Userinfo also gives
`given_name` and `family_name`, worked out from `name`; the ID token does not, and core does not promise them.) Access tokens last
15 minutes, ID tokens an hour and refresh tokens 30 days from their last use. A refresh token changes every time it is
used, and using an old one signs the person out of that app everywhere.

## Who the person is

Core gives `sub`, which is opaque and stable, a `name`, and an `email`. It gives **no `preferred_username` and no `groups`**. An app
that makes a username from `preferred_username` usually falls back to the email address, or to `sub`, which reads as a string of
characters. Some give up instead: an app that names the user from `preferred_username` alone fails the sign-in with a generic profile
error, and has to be pointed at `name`. An app that maps roles or administrators from `groups` has no group to read.

For an app you run yourself, a **trusted** app that asks for `roles` can be told to read its groups from the `roles` claim, whose values
are core's role names (`platform:owner`), if the app lets you name the claim and the administrator group. That works only for a trusted
app. Identify a person by `sub`, and treat the email as something that can change.

## Consent and trusted apps

The first time a person uses an app, core asks them what it may see. **Trusted** skips that question and lets the app ask
for `roles`. Keep it for apps you run yourself: a trusted app sees what it asks for without the person being asked.

## Signing out

Sign-out goes two ways, and an app can use either or both.

- **From the app to core.** Add a **post-logout address** and have the app send the person to the `end_session_endpoint`
  from discovery with the `id_token_hint` it received. Core ends the session and returns them there. Without the hint, core
  cannot tell whose session it is: it shows a confirmation page and ends nothing, and the person stays signed in to core. Some
  apps send the bare address and nothing more.
- **From core to the app.** Add a **back-channel logout address**. When a person's session on core ends, core posts a
  signed logout token there, carrying `sub` and `sid`. It is sent once and not retried, so the app must also treat its
  own session as over when its tokens stop working.

Not every app takes a back-channel logout. For one that does not, signing out of core does not sign the person out of it: its own session
lasts until it expires, and it can refresh in the meantime, since a refresh token obtained with `offline_access` outlives core's session.
Signing out of the app itself clears only that app, and if core's session is still open the next visit signs the person straight back in.

An address core posts to must be reachable from inside core's container, so behind a proxy the app's public name needs
the same treatment as core's own ([Core must be able to reach its own address](deploying.md#core-must-be-able-to-reach-its-own-address)).

## Finding other people

An app with the `directory` scope can look people up on the instance by name or exact email address. The Directory needs
a token of its own: ask for one with `resource` set to `<SV_URL>/api/v1`, using the refresh token once the person is
signed in. A token asked for that way is for the Directory alone and comes with no ID token, so sign people in as usual
first. The contract is [`spec/core-api/openapi.yaml`](../spec/core-api/openapi.yaml).

## When it does not work

| What happens                                                          | Likely cause                                                                                                                                                                                         |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Core shows its own error page, not the app                            | The sign-in address does not match exactly. Compare it with what the app sent, character by character                                                                                                |
| Sign-in fails at once, with a PKCE error                              | The app is not sending a `code_challenge`, or it uses `plain`. The app may show only "403" or "login denied": the reason is in the address core sent back (`error_description`) and in the app's log |
| The app says the signature or algorithm is wrong                      | The app cannot verify EdDSA (set **How tokens are signed** to RS256), or is configured for another algorithm                                                                                         |
| The app fails before it sends the person to core, with a vague error  | It reads core's keys and keeps only RSA ones. Its own log says what it found missing                                                                                                                 |
| `invalid_scope`                                                       | The app asks for a scope core offers but the app is not allowed. Allow it in the Console, or narrow the app's scopes to the table above                                                              |
| A generic profile or login error after the person signs in and agrees | The app needs a claim core does not send, most often `preferred_username`. Point its name or username setting at `name` or `email`                                                                   |
| The app cannot verify core's certificate                              | The certificate comes from an authority the app does not trust. Many apps keep a store of their own, apart from the system's                                                                         |
| The app says the issuer does not match                                | The issuer it was given has a path or a trailing slash, or `SV_URL` is not the address it used                                                                                                       |
| The token request is refused                                          | A wrong or old secret, or the app sends it in the request body and is not set to (`cannot use client_secret_post`)                                                                                   |
| A person sees no consent screen, or is asked again                    | **Trusted** apps do not ask. An app asking for a scope the person has not granted asks again                                                                                                         |
| Signing out of core leaves the person in the app                      | No back-channel address, or core cannot reach it. Core's logs say so                                                                                                                                 |
