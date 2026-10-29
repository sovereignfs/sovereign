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
  // Not better-auth's own redirect: it sends the browser to the address of any `{ redirect, url }` answer by
  // itself, and the forms follow it too (`continuationUrl`), so an app's callback was requested twice with
  // one authorization code and the second request failed. The forms are the only ones that navigate.
  disableDefaultFetchPlugins: true,
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
