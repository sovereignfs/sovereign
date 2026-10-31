# @sovereignfs/sdk

How a JavaScript app's **server** talks to the Sovereign server it signs people in with. It wraps the generated
[`@sovereignfs/api-client`](../api-client) with what is tedious to do by hand: tokens, failure, and version support. What it
promises is in [`docs/specs/sdk.md`](../../docs/specs/sdk.md); the contract it never goes beyond is
[`spec/core-api/openapi.yaml`](../../spec/core-api/openapi.yaml).

> Not published yet.

```ts
import { createSovereign } from '@sovereignfs/sdk';

// Reads NOTES_URL, NOTES_CORE_URL, NOTES_CORE_CLIENT_ID and NOTES_CORE_CLIENT_SECRET (or its _FILE form).
// Makes no network call, so the app starts while core is down.
export const sv = createSovereign({ prefix: 'NOTES', tokenStore });

const { users } = await sv.as(person).directory.searchUsers({ q: 'ada' }); // as a person
const branding = await sv.instance.getBranding(); // public, so no actor
```

- **Actors.** Every call names who it is made as: `sv.as(person)`, `sv.app`, or `sv.instance` for public calls. A method exists
  only on an actor that can use it, and the SDK never falls back from one to another.
- **Tokens.** An app never handles an access token. Access tokens are cached in memory until 30 seconds before they expire. A
  person's refresh token is kept in a **token store** the app gives (`read`, and a conditional `write`); core rotates it on every
  use and takes one used twice for theft, so refreshes run one at a time for each person, and an app that runs more than one
  process gives its store a `lock`.
- **Failure.** Every call can fail, as one of `CoreApiError`, `CoreUnavailableError`, `SessionEndedError`, `NotSupportedError` or
  `ConfigurationError`. Requests time out (5 seconds), safe ones are retried, and nothing logs a token or a person's details.
- **Version support.** The SDK reads the instance document and raises `NotSupportedError` for a capability this core lacks,
  without sending the call.
- **Signing in.** `sv.auth` signs people in through core with [`openid-client`](https://github.com/panva/openid-client) (PKCE `S256`,
  `state`, `nonce`), keeps the sessions in a **session store** the app gives, and ends them on sign-out and on core's back-channel
  logout notice, which it verifies (signature, issuer, audience, age, event, `jti`, and no `nonce`). The session cookie is host-only
  (`__Host-`, `Secure`, `HttpOnly`) over https. `getSession` makes no call to core.
- **Server only.** Importing it in a browser throws.

## In Next.js

```ts
// app/auth/[action]/route.ts: /auth/login, /auth/callback, /auth/logout (POST) and /auth/backchannel-logout (POST)
import { nextAuth } from '@sovereignfs/sdk/next';
export const { GET, POST } = nextAuth(sv).handlers;

// A Server Component:
const session = await nextAuth(sv).requireSession('/notes'); // sends a person to sign in, and back
```

Register `https://notes.example.test/auth/callback` as the app's sign-in address, `https://notes.example.test/` as its address after
sign-out, and `https://notes.example.test/auth/backchannel-logout` as its back-channel logout address. `next` is an optional peer
dependency, and nothing outside `/next` needs it.

## Testing an app

`@sovereignfs/sdk/testing` is a core that needs no server:

```ts
import { createFakeCore } from '@sovereignfs/sdk/testing';

const core = createFakeCore();
core.addPerson({ sub: 'u1', name: 'Ada Lovelace' });
const sv = createSovereign({
  appUrl: 'https://notes.example.test',
  coreUrl: core.url,
  ...core.credentials,
  tokenStore,
  fetch: core.fetch,
});
await tokenStore.write('u1', core.signIn('u1'), undefined);

core.fail({ kind: 'down' }); // or 'timeout', 'lost-answer', or { kind: 'status', status: 503 }

// Signing in: the person agrees at core, and core can send a logout notice, wrong in any way you want to test.
const back = core.authorize((await sv.auth.beginSignIn()).url, 'u1');
const notice = await core.logoutToken({ sub: 'u1' }, { wrong: 'expired' });
```

`memorySessionStore()` is a session store for tests.

## Core versions

This release supports core `>=0.46.0` (`sovereign.core` in `package.json`). A core too old to say what it serves is treated as
serving the Directory and the instance document, and nothing else. The guide for an app's developer is
[Using the SDK](../../docs/using-the-sdk.md).

## Which exports are stable

`createSovereign` and the error types are **stable** and change only in a major version; everything else is **experimental** and may
change in a minor version ([`src/stability.ts`](src/stability.ts) lists both).

## Versions

This SDK starts at `2.0.0`. Versions up to `1.25.0` of `@sovereignfs/sdk` are the legacy SDK, which ran inside the old platform and is
not an earlier release of this one.

## Licence

MPL-2.0, so an app under any licence can use it.
