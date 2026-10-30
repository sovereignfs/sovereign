'use client';

import { useState, useTransition } from 'react';
import { Alert, Button, Toggle } from '@sovereignfs/ui';
import styles from '../security/security.module.css';
import { clearNotificationsAction, setAppNotificationsAction } from './notification-actions';

type App = { clientId: string; name: string; enabled: boolean };

/**
 * Which apps may tell the person things, with a switch for each (on unless they turn it off), and a way to clear what they have
 * (core-app §4.1). An app they have not used, or that cannot send, is not listed.
 */
export function NotificationSettings({ apps }: { apps: App[] }) {
  const [enabled, setEnabled] = useState(
    () => new Map(apps.map((app) => [app.clientId, app.enabled])),
  );
  const [message, setMessage] = useState<{ ok: boolean; text: string } | undefined>();
  const [pending, start] = useTransition();

  function toggle(clientId: string, on: boolean) {
    setEnabled((before) => new Map(before).set(clientId, on));
    setMessage(undefined);
    start(async () => {
      const result = await setAppNotificationsAction(clientId, on);
      if (!result.ok) {
        // Put the switch back where it was.
        setEnabled((before) => new Map(before).set(clientId, !on));
        setMessage({ ok: false, text: result.error });
      }
    });
  }

  function clear() {
    setMessage(undefined);
    start(async () => {
      const result = await clearNotificationsAction();
      setMessage(
        result.ok ? { ok: true, text: result.message } : { ok: false, text: result.error },
      );
    });
  }

  return (
    <section aria-labelledby="notifications-heading" className={styles.form}>
      <h2 id="notifications-heading" className={styles.heading}>
        Notifications
      </h2>
      {apps.length === 0 ? (
        <p>No app you use can send you notifications.</p>
      ) : (
        <>
          <p>These apps can send you notifications. Switch one off to stop them.</p>
          <ul aria-label="Apps that can send you notifications" className={styles.passkeys}>
            {apps.map((app) => (
              <li key={app.clientId} className={styles.row}>
                <span className={styles.key}>{app.name}</span>
                <Toggle
                  aria-label={`Notifications from ${app.name}`}
                  checked={enabled.get(app.clientId) ?? true}
                  disabled={pending}
                  onChange={(on) => toggle(app.clientId, on)}
                />
              </li>
            ))}
          </ul>
        </>
      )}
      <div>
        <Button type="button" variant="secondary" disabled={pending} onClick={clear}>
          Clear all notifications
        </Button>
      </div>
      {message ? <Alert variant={message.ok ? 'success' : 'error'}>{message.text}</Alert> : null}
    </section>
  );
}
