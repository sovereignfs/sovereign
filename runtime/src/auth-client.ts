// Import only from 'use client' components — createAuthClient uses browser APIs.
import { createAuthClient } from 'better-auth/react';
import type { BetterAuthClientPlugin } from 'better-auth/client';
import { twoFactorClient } from 'better-auth/client/plugins';
import { passkeyClient } from '@better-auth/passkey/client';
import { sanitizeRedirectPath } from './post-login-redirect';

// No baseURL: calls /api/auth/* on the runtime's own origin.
// runtime/app/api/auth/[...path]/route.ts proxies these to the auth server,
// keeping the entire sign-in/sign-up flow on the runtime's origin so iOS PWA
// standalone mode never breaks out to Safari on a cross-origin redirect.
export const authClient = createAuthClient({
  plugins: [
    twoFactorClient({
      // twoFactorPage does a bare window.location.href with no way to carry
      // query params — build the URL ourselves so the returnUrl from /login
      // survives the hop to /login/2fa.
      onTwoFactorRedirect: async () => {
        const returnUrl = sanitizeRedirectPath(
          new URLSearchParams(window.location.search).get('returnUrl'),
        );
        window.location.href = returnUrl
          ? `/login/2fa?returnUrl=${encodeURIComponent(returnUrl)}`
          : '/login/2fa';
      },
    }),
    passkeyClient() as unknown as BetterAuthClientPlugin,
  ],
});
