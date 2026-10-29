'use client';

import { startTransition, useActionState, useEffect, useState } from 'react';
import { Alert, Button, ConfirmDialog } from '@sovereignfs/ui';
import type { ConnectedApp } from '../../src/oauth/connected';
import { removeAccessAction, type RemoveResult } from './actions';
import styles from '../security/security.module.css';
import listStyles from './connected-apps.module.css';

const when = (time: number | undefined) =>
  time === undefined
    ? ''
    : new Date(time).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });

/** The apps a person has allowed, each with what it can do and a way to take its access away. */
export function ConnectedAppsList({ apps }: { apps: ConnectedApp[] }) {
  return (
    <ul className={styles.passkeys}>
      {apps.map((app) => (
        <ConnectedAppItem key={app.clientId} app={app} />
      ))}
    </ul>
  );
}

function ConnectedAppItem({ app }: { app: ConnectedApp }) {
  const [open, setOpen] = useState(false);
  const [state, remove, pending] = useActionState<RemoveResult | null, null>(
    (previous) => removeAccessAction(app.clientId, previous),
    null,
  );

  useEffect(() => {
    if (state?.ok) setOpen(false);
  }, [state]);

  return (
    <li className={styles.passkey}>
      <div>
        <p className={styles.passkeyName}>{app.name}</p>
        {app.permissions.length > 0 ? (
          <ul className={listStyles.permissions}>
            {app.permissions.map((permission) => (
              <li key={permission}>{permission}</li>
            ))}
          </ul>
        ) : null}
        {app.since !== undefined ? (
          <p className={styles.footer}>Allowed on {when(app.since)}.</p>
        ) : null}
      </div>
      {state?.ok ? <Alert variant="success">{state.message}</Alert> : null}
      <Button type="button" variant="secondary" onClick={() => setOpen(true)}>
        Remove access
      </Button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        title={`Remove ${app.name}’s access?`}
        message={`${app.name} stops being able to use your account at once, wherever you are signed in to it. The next time you open it, it asks you to allow it again.`}
        confirmLabel={pending ? 'Removing…' : 'Remove access'}
        destructive
        pending={pending}
        error={state && !state.ok ? state.error : undefined}
        onConfirm={() => startTransition(() => remove(null))}
      />
    </li>
  );
}
