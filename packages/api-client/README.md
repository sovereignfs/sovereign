# @sovereignfs/api-client

A typed client for the Sovereign API. It is **generated** from the contract, `contracts/core-api/openapi.yaml`, so it
cannot describe anything the contract does not.

```ts
import { createCoreClient, CoreApiError } from '@sovereignfs/api-client';

const core = createCoreClient({
  baseUrl: 'https://core.sovereign.local',
  // The access token Core issued to your app, asked for with `resource=https://core.sovereign.local/api/v1`.
  token: () => currentAccessToken(),
});

const { users } = await core.searchDirectoryUsers({ query: { q: 'ada', limit: 5 } });
const branding = await core.getInstanceBranding(); // public: needs no token

try {
  await core.findDirectoryUserByEmail({ query: { email: 'ada@sovereign.local' } });
} catch (error) {
  if (error instanceof CoreApiError && error.status === 429) wait(error.retryAfter);
}
```

Every failure is a `CoreApiError` carrying the contract's error body (`status`, `code`, `message`).

Do not edit `src/generated/`. Change the contract and run `pnpm generate:api-client`; a test fails when the two
disagree.
