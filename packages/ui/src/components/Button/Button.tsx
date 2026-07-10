import type { ButtonHTMLAttributes, ReactNode } from 'react';
import styles from './Button.module.css';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive';
export type ButtonSize = 'sm' | 'md';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner and disables the button while an async action is pending. */
  loading?: boolean;
  children: ReactNode;
}

/**
 * Button — the primitive interactive control. Presentational and RSC-safe: it
 * holds no state and simply forwards props to the underlying `<button>`, so it
 * renders in both Server and Client Components. All styling references `--sv-*`
 * tokens via CSS Modules; there are no hardcoded values.
 */
export function Button({
  variant = 'primary',
  size = 'md',
  type = 'button',
  loading = false,
  disabled,
  className,
  children,
  ...rest
}: ButtonProps) {
  const classes = [styles.button, styles[variant], styles[size], className]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      type={type}
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading && (
        // aria-hidden: the button's own accessible name (its visible children,
        // unchanged below) plus aria-busy already communicate the pending
        // state — an unhidden Spinner-style status region would double-narrate it.
        <span className={styles.spinner} aria-hidden="true" />
      )}
      {children}
    </button>
  );
}
