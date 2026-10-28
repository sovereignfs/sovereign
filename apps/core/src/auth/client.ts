import { createAuthClient } from 'better-auth/react';
import { inferAdditionalFields } from 'better-auth/client/plugins';

/**
 * The browser's client for core's own sign-in. It talks to the same origin, so it needs no
 * address: core's pages are served from the address better-auth was configured with.
 *
 * The two fields a person sends at sign-up are declared so the client accepts them; the server
 * decides what to do with them (`terms.ts`).
 */
export const authClient = createAuthClient({
  plugins: [
    inferAdditionalFields({
      user: {
        timezone: { type: 'string', required: false },
        agreedToTerms: { type: 'boolean', required: false },
      },
    }),
  ],
});
