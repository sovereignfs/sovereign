import type { ReactNode } from 'react';
import styles from './Badge.module.css';

export type BadgeVariant = 'role' | 'status' | 'mono';
export type BadgeSize = 'sm' | 'md' | 'lg';
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
  /** 'sm' | 'md' (default) | 'lg'. 'md' is the badge's original — and until
   * now, only — size, so the default renders unchanged. */
  size?: BadgeSize;
  /** Only relevant when variant="status" — determines the dot colour. */
  status?: BadgeStatus;
  /** Forces ALL CAPS display regardless of the case `children` is passed
   * in. Defaults to `true` — every existing badge in the app relies on
   * this. Set `false` for a title-case badge that renders exactly the text
   * passed in (e.g. "Owner" instead of "OWNER"). */
  uppercase?: boolean;
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

const STATUS_CHIP_CLASS: Record<BadgeStatus, string> = {
  active: styles.chipGreen as string,
  enabled: styles.chipGreen as string,
  deactivated: styles.chipRed as string,
  failed: styles.chipRed as string,
  invited: styles.chipAmber as string,
  pending: styles.chipAmber as string,
  neutral: styles.chipNeutral as string,
};

/**
 * Badge — compact label for roles, lifecycle states, and type/version tags.
 *
 * - `role`   neutral surface + border, semibold — for Owner / Admin / User
 * - `status` tinted chip with leading colour dot — for Active / Deactivated / etc.
 * - `mono`   monospace font, neutral surface — for platform / community / v0.1.0
 *
 * Three sizes (`sm`/`md`/`lg`, default `md`). ALL CAPS by default
 * (`uppercase`) — set `uppercase={false}` for a title-case badge instead.
 */
export function Badge({
  variant = 'role',
  size = 'md',
  status = 'neutral',
  uppercase = true,
  children,
}: BadgeProps) {
  const isStatus = variant === 'status';
  const dotClass = isStatus ? STATUS_DOT_CLASS[status] : undefined;
  const chipClass = isStatus ? STATUS_CHIP_CLASS[status] : undefined;

  return (
    <span
      className={[
        styles.badge,
        styles[variant],
        styles[size],
        chipClass,
        uppercase && styles.uppercase,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {isStatus && <span className={[styles.dot, dotClass].join(' ')} aria-hidden />}
      {children}
    </span>
  );
}
