import type { ReactNode } from 'react';
import styles from './StatusBadge.module.css';

export type StatusBadgeStatus =
  | 'unmodified'
  | 'draft'
  | 'committed'
  | 'conflict'
  | 'pending-delete'
  | 'synced'
  | 'warning'
  | 'error';

export interface StatusBadgeProps {
  status: StatusBadgeStatus;
  children?: ReactNode;
  /** Accessible label when the visible text is abbreviated or contextual. */
  'aria-label'?: string;
  className?: string;
}

const STATUS_CLASS: Record<StatusBadgeStatus, string> = {
  unmodified: styles.neutral as string,
  draft: styles.info as string,
  committed: styles.success as string,
  conflict: styles.error as string,
  'pending-delete': styles.warning as string,
  synced: styles.success as string,
  warning: styles.warning as string,
  error: styles.error as string,
};

const STATUS_LABEL: Record<StatusBadgeStatus, string> = {
  unmodified: 'Unmodified',
  draft: 'Draft',
  committed: 'Committed',
  conflict: 'Conflict',
  'pending-delete': 'Pending delete',
  synced: 'Synced',
  warning: 'Warning',
  error: 'Error',
};

/**
 * StatusBadge — compact inline status indicator for editor lists, draft
 * workflows, and sync states.
 */
export function StatusBadge({
  status,
  children,
  className,
  'aria-label': ariaLabel,
}: StatusBadgeProps) {
  const label = children ?? STATUS_LABEL[status];

  return (
    <span
      className={[styles.badge, STATUS_CLASS[status], className].filter(Boolean).join(' ')}
      aria-label={ariaLabel}
    >
      <span className={styles.dot} aria-hidden="true" />
      <span className={styles.label}>{label}</span>
    </span>
  );
}
