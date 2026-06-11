import type { InputHTMLAttributes } from 'react';
import styles from './Input.module.css';

export type InputProps = InputHTMLAttributes<HTMLInputElement>;

/**
 * Input — the primitive text field. Presentational and RSC-safe: it forwards
 * all native input props to the underlying `<input>`. Styling references
 * `--sv-*` tokens via CSS Modules; there are no hardcoded values.
 */
export function Input({ type = 'text', className, ...rest }: InputProps) {
  const classes = [styles.input, className].filter(Boolean).join(' ');
  return <input type={type} className={classes} {...rest} />;
}
