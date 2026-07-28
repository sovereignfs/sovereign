import type { ReactNode } from 'react';
import { Icon, type IconName } from '../Icon/Icon';
import styles from './Alert.module.css';

export type AlertVariant = 'info' | 'success' | 'warning' | 'error' | 'neutral';

/** Sensible default icon per variant. `neutral` has none — there's no
 * universal "neutral" glyph, so it stays icon-less unless `icon` is set
 * explicitly. */
const DEFAULT_ICON: Record<AlertVariant, IconName | undefined> = {
  info: 'info',
  success: 'circle-check',
  warning: 'alert-triangle',
  error: 'circle-x',
  neutral: undefined,
};

export interface AlertProps {
  variant: AlertVariant;
  heading?: string;
  /** Leading icon next to the heading. Defaults to a per-variant icon (see
   * `DEFAULT_ICON`) — pass an `IconName` to override it, or `false` to
   * suppress the icon entirely. Purely decorative: the variant's colour and
   * `heading`/`children` text already carry the meaning. */
  icon?: IconName | false;
  children: ReactNode;
  id?: string;
  className?: string;
}

/**
 * Alert — inline, non-dismissible banner.
 *
 * Distinct from `Toast` (transient, auto-dismissing) and `SystemBanner`
 * (instance-wide): Alert is for in-context messaging — form-level errors,
 * or explaining an empty/blocked state.
 *
 * `role="alert"` for `error` (interrupts screen readers immediately, since
 * an error demands attention); `role="status"` for the other variants
 * (announced politely, without interrupting).
 */
export function Alert({ variant, heading, icon, children, id, className }: AlertProps) {
  const resolvedIcon = icon === undefined ? DEFAULT_ICON[variant] : icon || undefined;

  return (
    <div
      id={id}
      role={variant === 'error' ? 'alert' : 'status'}
      className={[styles.alert, styles[variant], className].filter(Boolean).join(' ')}
    >
      {resolvedIcon && <Icon name={resolvedIcon} size="sm" className={styles.icon} aria-hidden />}
      <div className={styles.content}>
        {heading && <p className={styles.heading}>{heading}</p>}
        <div className={styles.body}>{children}</div>
      </div>
    </div>
  );
}
