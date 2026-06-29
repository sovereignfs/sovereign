// Import only from 'use client' components — createAuthClient uses browser APIs.
import { createAuthClient } from 'better-auth/react';
import type { BetterAuthClientPlugin } from 'better-auth/client';
import { twoFactorClient } from 'better-auth/client/plugins';
import { passkeyClient } from '@better-auth/passkey/client';

// No baseURL: calls /api/auth/* on the runtime's own origin.
// runtime/app/api/auth/[...path]/route.ts proxies these to the auth server,
// keeping the entire sign-in/sign-up flow on the runtime's origin so iOS PWA
// standalone mode never breaks out to Safari on a cross-origin redirect.
export const authClient = createAuthClient({
  plugins: [
    twoFactorClient({ twoFactorPage: '/login/2fa' }),
    passkeyClient() as unknown as BetterAuthClientPlugin,
  ],
});
