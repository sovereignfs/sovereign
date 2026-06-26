import type { SelectHTMLAttributes } from 'react';
import styles from './Select.module.css';

export type SelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'> & {
  /** Visual size variant. 'sm' reduces height/padding for compact table-cell usage. */
  size?: 'sm' | 'md';
};

/**
 * Select — styled wrapper around the native `<select>`. Inherits the same
 * height, border, radius, and focus ring as `Input` for visual consistency.
 * Uses the native picker on mobile — no custom dropdown, maximum a11y coverage.
 *
 * RSC-safe: presentational, no hooks, forwards all native select props.
 */
export function Select({ className, size, children, ...rest }: SelectProps) {
  const sizeClass = size === 'sm' ? styles.sm : undefined;
  return (
    <div className={[styles.wrapper, sizeClass].filter(Boolean).join(' ')}>
      <select className={[styles.select, className].filter(Boolean).join(' ')} {...rest}>
        {children}
      </select>
      {/* Custom chevron — CSS-drawn so no icon dependency */}
      <span className={styles.chevron} aria-hidden />
    </div>
  );
}
