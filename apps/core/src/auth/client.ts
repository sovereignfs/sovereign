import { createAuthClient } from 'better-auth/react';

/**
 * The browser's client for core's own sign-in. It talks to the same origin, so it needs no
 * address: core's pages are served from the address better-auth was configured with.
 */
export const authClient = createAuthClient();
