import type { ActiveSession } from '@sovereignfs/sdk';
import { deviceHint } from '../_lib/device-hint';
import { RevokeSessionButton } from './RevokeSessionButton';
import styles from '../account.module.css';

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString();
}

export function SessionList({ sessions }: { sessions: ActiveSession[] }) {
  if (sessions.length === 0) {
    return <p className={styles.help}>No active sessions.</p>;
  }

  return (
    <ul className={styles.sessionList}>
      {sessions.map((session) => (
        <li key={session.token} className={styles.sessionRow}>
          <div className={styles.sessionInfo}>
            <span className={styles.sessionDevice}>
              {deviceHint(session.userAgent)}
              {session.current && <span className={styles.currentBadge}>This session</span>}
            </span>
            <span className={styles.sessionMeta}>
              {session.ipAddress ?? 'unknown IP'} · last active {formatDate(session.updatedAt)}
            </span>
          </div>
          {session.current ? (
            // The current session can't be revoked via ACC-06; logging out ends
            // it instead. Plain form POST to the runtime logout route so it
            // works without JS (it clears the session-cache cookies + redirects).
            <form action="/api/account/logout" method="post">
              <button type="submit" className={styles.revokeButton}>
                Log out
              </button>
            </form>
          ) : (
            <RevokeSessionButton token={session.token} />
          )}
        </li>
      ))}
    </ul>
  );
}
