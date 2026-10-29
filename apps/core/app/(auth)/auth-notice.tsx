import type { ReactNode } from 'react';
import styles from './auth.module.css';

/** Something the person is told, on a quiet background; `warning` when it is not as they expect. */
export function AuthNotice({
  tone = 'neutral',
  children,
}: {
  tone?: 'neutral' | 'warning';
  children: ReactNode;
}) {
  return (
    <div
      className={tone === 'warning' ? `${styles.notice} ${styles.warning}` : styles.notice}
      role="status"
    >
      <p className={styles.noticeText}>{children}</p>
    </div>
  );
}

/** What went wrong with what they just did, in red, announced to a screen reader. */
export function AuthError({ children }: { children: ReactNode }) {
  return (
    <p className={styles.error} role="alert">
      {children}
    </p>
  );
}
