# @sovereignfs/api-client

A typed client for the Sovereign Core API. It is **generated** from the contract, `spec/core-api/openapi.yaml`, so it
cannot describe anything the contract does not.

```ts
import { createCoreClient, CoreApiError } from '@sovereignfs/api-client';

const core = createCoreClient({
  baseUrl: 'https://core.example.com',
  // The access token Core issued to your app, asked for with `resource=https://core.example.com/api/v1`.
  token: () => currentAccessToken(),
});

const { users } = await core.searchDirectoryUsers({ query: { q: 'ada', limit: 5 } });
const branding = await core.getInstanceBranding(); // public: needs no token

try {
  await core.findDirectoryUserByEmail({ query: { email: 'ada@example.com' } });
} catch (error) {
  if (error instanceof CoreApiError && error.status === 429) wait(error.retryAfter);
}
```

Every failure is a `CoreApiError` carrying the contract's error body (`status`, `code`, `message`).

Do not edit `src/generated/`. Change the contract and run `pnpm generate:api-client`; a test fails when the two
disagree.
