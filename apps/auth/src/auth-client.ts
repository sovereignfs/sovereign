import { createAuthClient } from 'better-auth/react';
import type { BetterAuthClientPlugin } from 'better-auth/client';
import { twoFactorClient } from 'better-auth/client/plugins';
import { passkeyClient } from '@better-auth/passkey/client';

// Same-origin: the client talks to this app's own /api/auth routes.
export const authClient = createAuthClient({
  plugins: [
    // Redirect to /login/2fa when a sign-in requires two-factor verification.
    twoFactorClient({ twoFactorPage: '/login/2fa' }),
    // Passkey sign-in and management (RFC 0012).
    // Cast to BetterAuthClientPlugin to silence the minor peer-version type
    // mismatch between @better-auth/passkey and better-auth (runtime-compatible).
    passkeyClient() as unknown as BetterAuthClientPlugin,
  ],
});
