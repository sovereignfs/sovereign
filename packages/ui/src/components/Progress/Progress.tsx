import styles from './Progress.module.css';

export interface ProgressProps {
  /** 0–100. Values outside that range are clamped. */
  value: number;
  /** Accessible name — Progress has no visible text of its own. */
  label?: string;
  id?: string;
  className?: string;
}

/**
 * Progress — determinate bar.
 *
 * `role="progressbar"` with `aria-valuenow`/`aria-valuemin`/`aria-valuemax`
 * so screen readers announce the current value. Indeterminate state is out
 * of scope until a consumer needs it.
 */
export function Progress({ value, label, id, className }: ProgressProps) {
  const clamped = Math.min(100, Math.max(0, value));

  return (
    <div
      id={id}
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      className={[styles.track, className].filter(Boolean).join(' ')}
    >
      <div className={styles.fill} style={{ width: `${clamped}%` }} />
    </div>
  );
}
