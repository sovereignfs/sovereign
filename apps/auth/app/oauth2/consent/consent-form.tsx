'use client';

import { useState } from 'react';
import { Button } from '@sovereignfs/ui';
import styles from '../../auth.module.css';

export function ConsentForm({ clientName, scopes }: { clientName: string; scopes: string[] }) {
  const [pending, setPending] = useState<'accept' | 'deny' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function respond(accept: boolean): Promise<void> {
    setPending(accept ? 'accept' : 'deny');
    setError(null);
    try {
      const res = await fetch('/api/auth/oauth2/consent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // oauth_query is the exact signed query string /oauth2/authorize
        // redirected here with — the server re-verifies its signature, this
        // page never trusts or re-derives it.
        body: JSON.stringify({ accept, oauth_query: window.location.search.slice(1) }),
      });
      const data = (await res.json().catch(() => null)) as { url?: string } | null;
      if (res.ok && data?.url) {
        window.location.href = data.url;
        return;
      }
      throw new Error('consent request failed');
    } catch {
      setError('Something went wrong completing this request. Please try again.');
      setPending(null);
    }
  }

  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.title}>Authorize {clientName}</h1>
        <p className={styles.subtitle}>
          {clientName} is requesting access to your Sovereign account.
        </p>
        {scopes.length > 0 && (
          <ul>
            {scopes.map((scope) => (
              <li key={scope}>{scope}</li>
            ))}
          </ul>
        )}
        {error ? <p className={styles.error}>{error}</p> : null}
        <div className={styles.form}>
          <Button onClick={() => respond(true)} disabled={pending !== null}>
            {pending === 'accept' ? 'Authorizing…' : 'Allow'}
          </Button>
          <Button variant="secondary" onClick={() => respond(false)} disabled={pending !== null}>
            Deny
          </Button>
        </div>
      </div>
    </main>
  );
}
