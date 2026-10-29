'use client';

import { useState } from 'react';
import { Alert, Button } from '@sovereignfs/ui';
import { authClient } from '../../src/auth/client';
import { continuationUrl } from '../../src/auth/oauth-continuation';
import styles from '../(auth)/auth.module.css';
import list from './consent.module.css';

type Props = {
  appName: string | undefined;
  /** The host the answer sends the person to, so a look-alike name is not the only thing to go on. */
  returnHost: string;
  email: string;
  permissions: string[];
  /** What is granted if the person agrees. */
  scopes: string[];
};

/** Asks whether an app may have what it asked for, and answers the provider. */
export function ConsentForm({ appName, returnHost, email, permissions, scopes }: Props) {
  const [pending, setPending] = useState<'allow' | 'deny' | undefined>();
  const [error, setError] = useState<string | undefined>();

  async function answer(accept: boolean) {
    setPending(accept ? 'allow' : 'deny');
    setError(undefined);
    // The signed request in this page's address goes along (`oauthProviderClient`), so the provider knows
    // which request is being answered; the scopes are only what the page offered.
    const result = await authClient.oauth2.consent(
      accept ? { accept: true, scope: scopes.join(' ') } : { accept: false },
    );
    const next = continuationUrl(result.data);
    if (result.error || !next) {
      setPending(undefined);
      setError(
        result.error?.status === 429
          ? 'Too many attempts. Wait a minute, then try again.'
          : 'That could not be done. Go back to the app and sign in again.',
      );
      return;
    }
    // A full navigation: the next page is the app's.
    window.location.assign(next);
  }

  return (
    <>
      <p className={styles.lead}>
        <strong>{appName ?? 'An app'}</strong> wants to sign you in as {email}. It would be able to:
      </p>
      {error ? <Alert variant="error">{error}</Alert> : null}
      <ul className={list.permissions}>
        {permissions.map((permission) => (
          <li key={permission}>{permission}</li>
        ))}
      </ul>
      <p className={styles.footer}>
        If you allow it, you are sent back to {returnHost}. It does not see your password.
      </p>
      <Button
        type="button"
        className={styles.submit}
        loading={pending === 'allow'}
        disabled={pending !== undefined}
        onClick={() => void answer(true)}
      >
        {pending === 'allow' ? 'Allowing…' : 'Allow'}
      </Button>
      <Button
        type="button"
        variant="secondary"
        className={styles.submit}
        loading={pending === 'deny'}
        disabled={pending !== undefined}
        onClick={() => void answer(false)}
      >
        {pending === 'deny' ? 'Going back…' : 'Don’t allow'}
      </Button>
    </>
  );
}
