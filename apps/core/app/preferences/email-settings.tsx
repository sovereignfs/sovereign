'use client';

import { useState, useTransition } from 'react';
import { Alert, Toggle } from '@sovereignfs/ui';
import styles from '../security/security.module.css';
import { setAppEmailAction } from './email-actions';

type App = { clientId: string; name: string; enabled: boolean };

/**
 * Which apps may email the person, with a switch for each (on unless they turn it off) (core-app §4.2). An app they have not used,
 * or that cannot email, is not listed.
 */
export function EmailSettings({ apps }: { apps: App[] }) {
  const [enabled, setEnabled] = useState(
    () => new Map(apps.map((app) => [app.clientId, app.enabled])),
  );
  const [error, setError] = useState<string | undefined>();
  const [pending, start] = useTransition();

  function toggle(clientId: string, on: boolean) {
    setEnabled((before) => new Map(before).set(clientId, on));
    setError(undefined);
    start(async () => {
      const result = await setAppEmailAction(clientId, on);
      if (!result.ok) {
        // Put the switch back where it was.
        setEnabled((before) => new Map(before).set(clientId, !on));
        setError(result.error);
      }
    });
  }

  return (
    <section aria-labelledby="email-heading" className={styles.form}>
      <h2 id="email-heading" className={styles.heading}>
        Email from apps
      </h2>
      <p>
        These apps can email you through this instance, without knowing your address. Switch one off
        to stop its emails.
      </p>
      <ul aria-label="Apps that can email you" className={styles.passkeys}>
        {apps.map((app) => (
          <li key={app.clientId} className={styles.row}>
            <span className={styles.key}>{app.name}</span>
            <Toggle
              aria-label={`Email from ${app.name}`}
              checked={enabled.get(app.clientId) ?? true}
              disabled={pending}
              onChange={(on) => toggle(app.clientId, on)}
            />
          </li>
        ))}
      </ul>
      {error ? <Alert variant="error">{error}</Alert> : null}
    </section>
  );
}
