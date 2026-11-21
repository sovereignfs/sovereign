import { useActionState } from 'react';
import { Alert } from '../Alert/Alert';
import { Button } from '../Button/Button';
import type { ActionResult, PanelAction } from './ActionResult';
import styles from './Account.module.css';

/** One of the person's sessions, as the panel shows it. It never carries the session's token. */
export interface SessionRow {
  id: string;
  /** The session this very browser is using. */
  current: boolean;
  /** "Chrome on macOS". */
  device: string;
  ipAddress: string | null;
  signedInAt: number;
  lastActiveAt: number;
}

export interface SessionsPanelProps {
  sessions: SessionRow[];
  /** Ends one session, by its id: the app's server action, which checks it is the person's own. */
  endSession: (id: string, previous: ActionResult | null, form: FormData) => Promise<ActionResult>;
  /** Ends every session but this one. */
  endOthers: PanelAction;
  /**
   * The time zone the times are written in: the person's own, where the app knows it. Default UTC. Times are written the same way on
   * the server and in the browser, so the page the server sent is the page the browser shows.
   */
  timeZone?: string;
}

/** The person's open sessions, with a way to end any of them, or all but this one (auth.md §7). */
export function SessionsPanel({
  sessions,
  endSession,
  endOthers,
  timeZone = 'UTC',
}: SessionsPanelProps) {
  const [others, endAllOthers, endingOthers] = useActionState<ActionResult | null, FormData>(
    endOthers,
    null,
  );
  const hasOthers = sessions.some((session) => !session.current);

  return (
    <div className={styles.form}>
      <ul className={styles.list}>
        {sessions.map((session) => (
          <SessionItem
            key={session.id}
            session={session}
            endSession={endSession}
            timeZone={timeZone}
          />
        ))}
      </ul>
      {others?.ok && others.message ? <Alert variant="success">{others.message}</Alert> : null}
      {others && !others.ok ? <Alert variant="error">{others.error}</Alert> : null}
      {hasOthers ? (
        <form action={endAllOthers}>
          <Button type="submit" variant="secondary" loading={endingOthers}>
            {endingOthers ? 'Signing out…' : 'Sign out everywhere else'}
          </Button>
        </form>
      ) : null}
    </div>
  );
}

function SessionItem({
  session,
  endSession,
  timeZone,
}: {
  session: SessionRow;
  endSession: SessionsPanelProps['endSession'];
  timeZone: string;
}) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(
    endSession.bind(null, session.id),
    null,
  );
  return (
    <li className={styles.item}>
      <div>
        <p className={styles.itemName}>
          {session.device}
          {session.current ? ' (this device)' : ''}
        </p>
        <p className={styles.footer}>
          {session.ipAddress ? `${session.ipAddress}. ` : ''}Signed in{' '}
          {when(session.signedInAt, timeZone)}
          {session.current ? '' : `. Last active ${when(session.lastActiveAt, timeZone)}`}.
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

/**
 * A moment for people: the day and the time, in the given zone (UTC for a zone this runtime does not know). Never in the runtime's own
 * language or zone, which differ between the server and the browser and would make the two disagree.
 */
function when(milliseconds: number, timeZone: string): string {
  const format = (zone: string) =>
    new Intl.DateTimeFormat('en-GB', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: zone,
    }).format(milliseconds);
  try {
    return format(timeZone);
  } catch {
    return format('UTC');
  }
}
