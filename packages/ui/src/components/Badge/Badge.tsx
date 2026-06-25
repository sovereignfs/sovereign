import type { ReactNode } from 'react';
import styles from './Badge.module.css';

export type BadgeVariant = 'role' | 'status' | 'mono';
export type BadgeStatus =
  | 'active'
  | 'enabled'
  | 'deactivated'
  | 'failed'
  | 'invited'
  | 'pending'
  | 'neutral';

export interface BadgeProps {
  variant?: BadgeVariant;
  /** Only relevant when variant="status" — determines the dot colour. */
  status?: BadgeStatus;
  children: ReactNode;
}

const STATUS_DOT_CLASS: Record<BadgeStatus, string> = {
  active: styles.dotGreen as string,
  enabled: styles.dotGreen as string,
  deactivated: styles.dotRed as string,
  failed: styles.dotRed as string,
  invited: styles.dotAmber as string,
  pending: styles.dotAmber as string,
  neutral: styles.dotGrey as string,
};

/**
 * Badge — compact label for roles, lifecycle states, and type/version tags.
 *
 * - `role`   neutral surface + border, semibold caps — for Owner / Admin / User
 * - `status` leading colour dot + muted label — for Active / Deactivated / etc.
 * - `mono`   monospace font, neutral surface — for platform / community / v0.1.0
 */
export function Badge({ variant = 'role', status = 'neutral', children }: BadgeProps) {
  const isStatus = variant === 'status';
  const dotClass = isStatus ? STATUS_DOT_CLASS[status] : undefined;

  return (
    <span className={[styles.badge, styles[variant]].join(' ')}>
      {isStatus && <span className={[styles.dot, dotClass].join(' ')} aria-hidden />}
      {children}
    </span>
  );
}
