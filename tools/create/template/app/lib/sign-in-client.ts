'use client';

import {
  saltReader,
  SIGN_IN_CLIENT,
  SIGN_IN_USER_FIELDS,
  signInClientPlugins,
  signInDerivation,
} from '@sovereignfs/auth/client';
import { inferAdditionalFields } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';

/** The browser's client for the app's sign-in (auth.md §2): better-auth's, with the package's plugins. */
export const authClient = createAuthClient({
  ...SIGN_IN_CLIENT,
  plugins: [...signInClientPlugins(), inferAdditionalFields({ user: { ...SIGN_IN_USER_FIELDS } })],
});

/** The sign-in value, made in the page from the password, the address and the app's salt: the password never leaves the browser. */
export const { deriveForSignIn, signInValue } = signInDerivation(
  saltReader('/api/sign-in-salt', 'vaultId'),
);
