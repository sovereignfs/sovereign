# Connecting an app

Core is an OpenID Connect provider, so an app that can sign people in with OpenID Connect can use it, whoever wrote the
app. This is for the person setting one up. What core promises is in [`docs/specs/core-app.md`](specs/core-app.md) §3.6
and §3.7.

## What an app needs to support

Check these first. They are the places an app that says it supports "OAuth" may not fit.

| Core needs                            | So the app must                                                                                              |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| The authorization code flow           | Use it. The implicit, password and client-credentials flows are not offered                                  |
| PKCE with `S256`, for every app       | Send a `code_challenge`, even with a client secret. An app with no PKCE setting is refused at sign-in        |
| ID tokens signed with EdDSA (Ed25519) | Verify EdDSA. A library that handles only RS256 fails when it checks the ID token                            |
| The client secret sent by HTTP Basic  | Use `client_secret_basic`, which apps are registered with. It is the default in most libraries               |
| A server of its own, or a native app  | Not call the token or userinfo endpoints from a web page: core sends no CORS headers, so a browser blocks it |
| `https` addresses                     | Have `https` sign-in and logout addresses. `http` is accepted only on `localhost` on a development instance  |

An app that signs people in with plain OAuth 2.0, with no ID token, can read the same details from the userinfo endpoint.

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

The claims appear in the ID token and at the userinfo endpoint, so an app can read them from either. Access tokens last
15 minutes, ID tokens an hour and refresh tokens 30 days from their last use. A refresh token changes every time it is
used, and using an old one signs the person out of that app everywhere.

## Consent and trusted apps

The first time a person uses an app, core asks them what it may see. **Trusted** skips that question and lets the app ask
for `roles`. Keep it for apps you run yourself: a trusted app sees what it asks for without the person being asked.

## Signing out

Sign-out goes two ways, and an app can use either or both.

- **From the app to core.** Add a **post-logout address** and have the app send the person to the `end_session_endpoint`
  from discovery with the `id_token_hint` it received. Core ends the session and returns them there.
- **From core to the app.** Add a **back-channel logout address**. When a person's session on core ends, core posts a
  signed logout token there, carrying `sub` and `sid`. It is sent once and not retried, so the app must also treat its
  own session as over when its tokens stop working.

An address core posts to must be reachable from inside core's container, so behind a proxy the app's public name needs
the same treatment as core's own ([Core must be able to reach its own address](deploying.md#core-must-be-able-to-reach-its-own-address)).

## Finding other people

An app with the `directory` scope can look people up on the instance by name or exact email address. The Directory needs
a token of its own: ask for one with `resource` set to `<SV_URL>/api/v1`, using the refresh token once the person is
signed in. A token asked for that way is for the Directory alone and comes with no ID token, so sign people in as usual
first. The contract is [`spec/core-api/openapi.yaml`](../spec/core-api/openapi.yaml).

## When it does not work

| What happens                                       | Likely cause                                                                                          |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Core shows its own error page, not the app         | The sign-in address does not match exactly. Compare it with what the app sent, character by character |
| Sign-in fails at once, with a PKCE error           | The app is not sending a `code_challenge`, or it uses `plain`                                         |
| The app says the signature or algorithm is wrong   | The app cannot verify EdDSA                                                                           |
| The app says the issuer does not match             | The issuer it was given has a path or a trailing slash, or `SV_URL` is not the address it used        |
| The token request is refused                       | A wrong or old secret, or the app is sending it another way than HTTP Basic                           |
| A person sees no consent screen, or is asked again | **Trusted** apps do not ask. An app asking for a scope the person has not granted asks again          |
| Signing out of core leaves the person in the app   | No back-channel address, or core cannot reach it. Core's logs say so                                  |
