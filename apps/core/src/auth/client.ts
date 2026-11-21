import { oauthProviderClient } from '@better-auth/oauth-provider/client';
import { SIGN_IN_CLIENT, SIGN_IN_USER_FIELDS, signInClientPlugins } from '@sovereignfs/auth/client';
import { inferAdditionalFields } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';

/**
 * The browser's client for core's own sign-in: the sign-in package's (auth.md §2, `./client`), with the OIDC provider's client, which
 * adds the app's signed request to a sign-in step made on a page the provider sent the person to, so the provider carries on with it
 * afterwards; on any other page it adds nothing. Sign-up may also send that the terms were accepted, which the server records
 * (`terms.ts`).
 */
export const authClient = createAuthClient({
  ...SIGN_IN_CLIENT,
  plugins: [
    ...signInClientPlugins(),
    oauthProviderClient(),
    inferAdditionalFields({
      user: { ...SIGN_IN_USER_FIELDS, agreedToTerms: { type: 'boolean', required: false } },
    }),
  ],
});
