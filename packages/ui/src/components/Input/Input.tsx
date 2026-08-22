import type { InputHTMLAttributes, Ref } from 'react';
import styles from './Input.module.css';

export type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  /** React 19 ref-as-prop — no `forwardRef` needed. Not part of
   *  `InputHTMLAttributes` (refs aren't a DOM attribute), so it's added
   *  explicitly here; left out of the destructure below so it flows through
   *  `...rest` straight onto the underlying `<input>`. */
  ref?: Ref<HTMLInputElement>;
};

/**
 * Input — the primitive text field. Presentational and RSC-safe: it forwards
 * all native input props to the underlying `<input>`. Styling references
 * `--sv-*` tokens via CSS Modules; there are no hardcoded values.
 */
export function Input({ type = 'text', className, ...rest }: InputProps) {
  const classes = [styles.input, className].filter(Boolean).join(' ');
  return <input type={type} className={classes} {...rest} />;
}
