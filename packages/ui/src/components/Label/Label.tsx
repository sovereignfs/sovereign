import type { LabelHTMLAttributes } from 'react';
import styles from './Label.module.css';

export interface LabelProps extends LabelHTMLAttributes<HTMLLabelElement> {
  disabled?: boolean;
}

/**
 * Label — standalone accessible form label, independent of `FormField`.
 * Use `FormField` when a control needs hint/error text too; use `Label`
 * directly for a bare label (e.g. next to a `Checkbox` group heading).
 */
export function Label({ disabled, className, children, ...rest }: LabelProps) {
  return (
    <label
      className={[styles.label, disabled ? styles.disabled : '', className]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      {children}
    </label>
  );
}
