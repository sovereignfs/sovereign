import { oauthProviderClient } from '@better-auth/oauth-provider/client';
import { createAuthClient } from 'better-auth/react';
import { passkeyClient } from '@better-auth/passkey/client';
import { inferAdditionalFields, twoFactorClient } from 'better-auth/client/plugins';

/**
 * The browser's client for core's own sign-in. It talks to the same origin, so it needs no
 * address: core's pages are served from the address better-auth was configured with.
 *
 * The two fields a person sends at sign-up are declared so the client accepts them; the server
 * decides what to do with them (`terms.ts`).
 */
export const authClient = createAuthClient({
  plugins: [
    twoFactorClient(),
    passkeyClient(),
    // Adds the app's signed request to a sign-in step made on a page the provider sent the person to, so
    // the provider carries on with it afterwards; on any other page it adds nothing.
    oauthProviderClient(),
    inferAdditionalFields({
      user: {
        timezone: { type: 'string', required: false },
        locale: { type: 'string', required: false },
        agreedToTerms: { type: 'boolean', required: false },
      },
    }),
  ],
});
