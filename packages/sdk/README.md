# @sovereignfs/sdk

How a JavaScript app's **server** talks to the Sovereign server it signs people in with. It wraps the generated
[`@sovereignfs/api-client`](../api-client) with what is tedious to do by hand: tokens, failure, and version support. What it
promises is in [`docs/specs/sdk.md`](../../docs/specs/sdk.md); the contract it never goes beyond is
[`spec/core-api/openapi.yaml`](../../spec/core-api/openapi.yaml).

> Not published yet. Signing in (`sv.auth`) and the Next.js adapter come next.

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
- **Server only.** Importing it in a browser throws.

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
```

## Licence

MPL-2.0, so an app under any licence can use it.
