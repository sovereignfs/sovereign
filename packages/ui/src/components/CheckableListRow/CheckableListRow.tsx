'use client';

import type { KeyboardEvent, ReactNode } from 'react';
import styles from './CheckableListRow.module.css';

export interface CheckableListRowProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: string;
  /** Leading icon, e.g. a per-item `<Icon>`. */
  icon?: ReactNode;
  /** Trailing content, e.g. a quantity, a `QuantityStepper`, or a badge. */
  trailing?: ReactNode;
  disabled?: boolean;
  className?: string;
}

/**
 * CheckableListRow — a whole-row tap target that toggles a checked state,
 * with strike-through on the label when checked. Built for "tap the row to
 * mark it done" lists (Sovereign Shopper's tap-to-buy, SHP-07) where the
 * checkbox itself is too small a target on mobile and the row already has
 * nothing else competing for the tap.
 *
 * Renders as `role="checkbox"` on the row itself rather than composing
 * `Checkbox`'s native `<input>` — nesting a real checkbox input inside the
 * row's own click handler would mean two overlapping interactive elements
 * (invalid HTML, and the input's own click would double-fire the row's
 * toggle). The visual box matches `Checkbox`'s styling for consistency.
 *
 * `trailing` content (e.g. a `QuantityStepper`) is rendered outside the
 * `role="checkbox"` element so its own interactive controls (+/- buttons)
 * don't sit inside another interactive element either — clicking those
 * doesn't toggle the row.
 */
export function CheckableListRow({
  checked,
  onCheckedChange,
  label,
  icon,
  trailing,
  disabled = false,
  className,
}: CheckableListRowProps) {
  function toggle() {
    if (!disabled) onCheckedChange(!checked);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      toggle();
    }
  }

  return (
    <div className={[styles.row, className].filter(Boolean).join(' ')}>
      <div
        role="checkbox"
        aria-checked={checked}
        aria-label={label}
        aria-disabled={disabled || undefined}
        tabIndex={disabled ? -1 : 0}
        className={styles.tapTarget}
        onClick={toggle}
        onKeyDown={handleKeyDown}
      >
        <span className={[styles.box, checked ? styles.checked : ''].filter(Boolean).join(' ')}>
          {checked && (
            <svg className={styles.tick} viewBox="0 0 10 8" fill="none" aria-hidden="true">
              <path
                d="M1 4l3 3 5-6"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </span>
        {icon && <span className={styles.icon}>{icon}</span>}
        <span className={[styles.label, checked ? styles.struck : ''].filter(Boolean).join(' ')}>
          {label}
        </span>
      </div>
      {trailing && <span className={styles.trailing}>{trailing}</span>}
    </div>
  );
}
