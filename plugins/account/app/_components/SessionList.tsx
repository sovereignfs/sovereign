import type { ActiveSession } from '@sovereignfs/sdk';
import { deviceHint } from '../_lib/device-hint';
import { RevokeSessionButton } from './RevokeSessionButton';
import styles from '../account.module.css';

function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return 'Just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function isMobileUA(ua?: string | null): boolean {
  if (!ua) return false;
  return /mobile|android|iphone|ipad/i.test(ua);
}

function DesktopIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect width="20" height="14" x="2" y="3" rx="2" />
      <line x1="8" x2="16" y1="21" y2="21" />
      <line x1="12" x2="12" y1="17" y2="21" />
    </svg>
  );
}

function MobileIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect width="14" height="20" x="5" y="2" rx="2" />
      <line x1="12" x2="12.01" y1="18" y2="18" />
    </svg>
  );
}

export function SessionList({ sessions }: { sessions: ActiveSession[] }) {
  if (sessions.length === 0) {
    return <p className={styles.help}>No active sessions.</p>;
  }

  return (
    <ul className={styles.sessionGroup}>
      {sessions.map((session) => (
        <li key={session.token} className={styles.sessionRow}>
          <div className={styles.sessionIconWrap}>
            {isMobileUA(session.userAgent) ? <MobileIcon /> : <DesktopIcon />}
          </div>
          <div className={styles.sessionInfo}>
            <span className={styles.sessionDevice}>{deviceHint(session.userAgent)}</span>
            <span className={styles.sessionMeta}>
              {session.ipAddress ?? 'Unknown IP'} ·{' '}
              {session.current ? 'Current session' : `Last seen ${timeAgo(session.updatedAt)}`}
            </span>
          </div>
          {session.current ? (
            <span className={styles.activeBadge}>
              <span className={styles.activeDot} aria-hidden="true" />
              Active
            </span>
          ) : (
            <RevokeSessionButton token={session.token} />
          )}
        </li>
      ))}
    </ul>
  );
}
