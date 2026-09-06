import type { ReactNode } from 'react';
import styles from '../console.module.css';

/**
 * The page header every Console section shares — the pattern Overview,
 * Users and Groups established: a small-caps section title, an optional
 * count beside the primary action, and an optional lede underneath.
 * RSC-safe (no state), so a Server Component page can render it directly
 * and pass a client `Dialog` trigger as `action`.
 */
export function ConsolePageHeader({
  title,
  count,
  action,
  description,
}: {
  title: string;
  /** e.g. "12 members" — rendered muted, left of the action. */
  count?: string;
  action?: ReactNode;
  description?: ReactNode;
}) {
  return (
    <>
      <div className={[styles.pageHeader, description ? styles.pageHeaderTight : ''].join(' ')}>
        <h2 className={styles.overviewSectionTitle}>{title}</h2>
        {(count || action) && (
          <div className={styles.pageHeaderActions}>
            {count && <span className={styles.memberCount}>{count}</span>}
            {action}
          </div>
        )}
      </div>
      {description && <p className={styles.lede}>{description}</p>}
    </>
  );
}
