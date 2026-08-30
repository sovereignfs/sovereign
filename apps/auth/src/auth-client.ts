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

// `authClient`'s inferred type loses `twoFactorClient`/`passkeyClient`'s own
// method signatures because passkeyClient() above is itself cast to silence
// a peer-version mismatch — every call site that reaches `signIn.passkey()`
// or `twoFactor.*` would otherwise need its own untyped `as any` cast to
// compile. Fixed once here instead: the intersection adds only the methods
// missing from the inferred type, so every other member of `authClient`
// (signIn.email, sendVerificationEmail, ...) keeps its real inferred type.
export type AuthClientWithPlugins = typeof authClient & {
  signIn: {
    passkey: () => Promise<{ data: unknown; error: { message?: string } | null }>;
  };
  twoFactor: {
    verifyTotp: (opts: {
      code: string;
    }) => Promise<{ data: unknown; error: { message?: string } | null }>;
    verifyBackupCode: (opts: {
      code: string;
    }) => Promise<{ data: unknown; error: { message?: string } | null }>;
  };
};

export const typedAuthClient = authClient as AuthClientWithPlugins;
