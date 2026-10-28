'use client';

import { useActionState } from 'react';
import { Alert, Button } from '@sovereignfs/ui';
import type { SessionSummary } from '../../src/sessions/sessions';
import { endOtherSessionsAction, endSessionAction, type ActionResult } from './actions';
import styles from './security.module.css';

/** The person's open sessions, with a way to end any of them, or all but this one. */
export function SessionsPanel({ sessions }: { sessions: SessionSummary[] }) {
  const [others, endOthers, endingOthers] = useActionState<ActionResult | null, FormData>(
    endOtherSessionsAction,
    null,
  );
  const hasOthers = sessions.some((session) => !session.current);

  return (
    <div className={styles.form}>
      <ul className={styles.passkeys}>
        {sessions.map((session) => (
          <SessionItem key={session.id} session={session} />
        ))}
      </ul>
      {others?.ok && others.message ? <Alert variant="success">{others.message}</Alert> : null}
      {others && !others.ok ? <Alert variant="error">{others.error}</Alert> : null}
      {hasOthers ? (
        <form action={endOthers}>
          <Button type="submit" variant="secondary" loading={endingOthers}>
            {endingOthers ? 'Signing out…' : 'Sign out everywhere else'}
          </Button>
        </form>
      ) : null}
    </div>
  );
}

function SessionItem({ session }: { session: SessionSummary }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(
    endSessionAction.bind(null, session.id),
    null,
  );
  return (
    <li className={styles.passkey}>
      <div>
        <p className={styles.passkeyName}>
          {session.device}
          {session.current ? ' (this device)' : ''}
        </p>
        <p className={styles.footer}>
          {session.ipAddress ? `${session.ipAddress}. ` : ''}Signed in {when(session.signedInAt)}
          {session.current ? '' : `. Last active ${when(session.lastActiveAt)}`}.
        </p>
      </div>
      {state && !state.ok ? <Alert variant="error">{state.error}</Alert> : null}
      <form action={action}>
        <Button type="submit" variant="secondary" loading={pending}>
          {pending ? 'Signing out…' : session.current ? 'Sign out of this device' : 'Sign out'}
        </Button>
      </form>
    </li>
  );
}

/** A moment for people, in the browser's language: the day and the time. */
function when(milliseconds: number): string {
  return new Date(milliseconds).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}
