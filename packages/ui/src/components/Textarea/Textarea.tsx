import type { TextareaHTMLAttributes } from 'react';
import styles from './Textarea.module.css';

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

/**
 * Textarea — the primitive multi-line text field. Presentational and
 * RSC-safe: it forwards all native textarea props to the underlying
 * `<textarea>`. Styling references `--sv-*` tokens via CSS Modules; there
 * are no hardcoded values.
 */
export function Textarea({ className, rows = 4, ...rest }: TextareaProps) {
  const classes = [styles.textarea, className].filter(Boolean).join(' ');
  return <textarea rows={rows} className={classes} {...rest} />;
}
