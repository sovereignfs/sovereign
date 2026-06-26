import type { SelectHTMLAttributes } from 'react';
import styles from './Select.module.css';

export type SelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'> & {
  /** 'md' (default) — standard form field height. 'sm' — compact for table cells and inline controls. */
  size?: 'sm' | 'md';
};

/**
 * Select — styled wrapper around the native `<select>`. Inherits the same
 * height, border, radius, and focus ring as `Input` for visual consistency.
 * Uses the native picker on mobile — no custom dropdown, maximum a11y coverage.
 *
 * RSC-safe: presentational, no hooks, forwards all native select props.
 */
export function Select({ className, size = 'md', children, ...rest }: SelectProps) {
  return (
    <div
      className={[styles.wrapper, size === 'sm' ? styles.sm : undefined].filter(Boolean).join(' ')}
    >
      <select className={[styles.select, className].filter(Boolean).join(' ')} {...rest}>
        {children}
      </select>
      <svg
        className={styles.chevron}
        aria-hidden="true"
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <polyline points="6 9 12 15 18 9" />
      </svg>
    </div>
  );
}
