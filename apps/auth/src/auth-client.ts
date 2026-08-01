import { createAuthClient } from 'better-auth/react';
import type { BetterAuthClientPlugin } from 'better-auth/client';
import { twoFactorClient } from 'better-auth/client/plugins';
import { passkeyClient } from '@better-auth/passkey/client';
import { sanitizeRedirectPath } from './post-login-redirect';

// Same-origin: the client talks to this app's own /api/auth routes.
export const authClient = createAuthClient({
  plugins: [
    // Redirect to /login/2fa when a sign-in requires two-factor verification.
    // twoFactorPage does a bare window.location.href with no way to carry
    // query params — build the URL ourselves so the returnUrl from /login
    // survives the hop to /login/2fa.
    twoFactorClient({
      onTwoFactorRedirect: async () => {
        const returnUrl = sanitizeRedirectPath(
          new URLSearchParams(window.location.search).get('returnUrl'),
        );
        window.location.href = returnUrl
          ? `/login/2fa?returnUrl=${encodeURIComponent(returnUrl)}`
          : '/login/2fa';
      },
    }),
    // Passkey sign-in and management (RFC 0012).
    // Cast to BetterAuthClientPlugin to silence the minor peer-version type
    // mismatch between @better-auth/passkey and better-auth (runtime-compatible).
    passkeyClient() as unknown as BetterAuthClientPlugin,
  ],
});
