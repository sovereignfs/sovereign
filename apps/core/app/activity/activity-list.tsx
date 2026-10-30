'use client';

import { startTransition, useActionState, useEffect, useState } from 'react';
import { Alert, Button, ConfirmDialog } from '@sovereignfs/ui';
import { deleteActivityAction, deleteAllActivityAction, type ActivityResult } from './actions';
import styles from '../security/security.module.css';
import listStyles from './activity.module.css';

/** An entry as the page gets it: the time is already written out in the person's own time zone. */
export type ActivityRow = {
  id: string;
  appName: string;
  summary: string;
  link: string | null;
  when: string;
};

/** What the person's record holds, each entry with a way to delete it, and a way to delete many at once (core-app §4.3). */
export function ActivityList({
  entries,
  scope,
}: {
  entries: ActivityRow[];
  /** When the page is limited to one app: its id and name, so "Delete all" can mean that app's. */
  scope: { clientId: string; name: string } | undefined;
}) {
  return (
    <>
      <ul className={styles.passkeys} aria-label="Your activity">
        {entries.map((entry) => (
          <ActivityItem key={entry.id} entry={entry} />
        ))}
      </ul>
      <DeleteAll scope={scope} />
    </>
  );
}

function ActivityItem({ entry }: { entry: ActivityRow }) {
  const [state, remove, pending] = useActionState<ActivityResult | null, null>(
    () => deleteActivityAction(entry.id),
    null,
  );
  return (
    <li className={styles.passkey}>
      <div>
        <p className={styles.passkeyName}>{entry.appName}</p>
        <p className={listStyles.summary}>{entry.summary}</p>
        <p className={listStyles.when}>
          {entry.when}
          {entry.link ? (
            <>
              {' · '}
              <a className={styles.link} href={entry.link} rel="noopener noreferrer">
                Open
              </a>
            </>
          ) : null}
        </p>
      </div>
      {state && !state.ok ? <Alert variant="error">{state.error}</Alert> : null}
      <Button
        type="button"
        variant="secondary"
        disabled={pending}
        aria-label={`Delete: ${entry.summary}`}
        onClick={() => startTransition(() => remove(null))}
      >
        {pending ? 'Deleting…' : 'Delete'}
      </Button>
    </li>
  );
}

function DeleteAll({ scope }: { scope: { clientId: string; name: string } | undefined }) {
  const [open, setOpen] = useState(false);
  const [state, removeAll, pending] = useActionState<ActivityResult | null, null>(
    () => deleteAllActivityAction(scope?.clientId),
    null,
  );

  useEffect(() => {
    if (state?.ok) setOpen(false);
  }, [state]);

  const what = scope ? `everything ${scope.name} recorded` : 'all of your activity';
  return (
    <div className={listStyles.actions}>
      <Button type="button" variant="secondary" onClick={() => setOpen(true)}>
        {scope ? `Delete all from ${scope.name}` : 'Delete all'}
      </Button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        title={scope ? `Delete what ${scope.name} recorded?` : 'Delete all of your activity?'}
        message={`This deletes ${what}. It cannot be undone, and it does not stop an app from recording more.`}
        confirmLabel={pending ? 'Deleting…' : 'Delete'}
        destructive
        pending={pending}
        error={state && !state.ok ? state.error : undefined}
        onConfirm={() => startTransition(() => removeAll(null))}
      />
    </div>
  );
}
