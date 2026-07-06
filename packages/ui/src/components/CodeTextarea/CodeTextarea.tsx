import type { TextareaHTMLAttributes } from 'react';
import styles from './CodeTextarea.module.css';

export interface CodeTextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

/**
 * CodeTextarea — monospace textarea for Markdown, YAML, JSON, and other
 * whitespace-sensitive content. Pair with FormField for labels, hints, and
 * validation text.
 */
export function CodeTextarea({
  className,
  rows = 12,
  spellCheck = false,
  wrap = 'off',
  invalid = false,
  'aria-invalid': ariaInvalid,
  ...rest
}: CodeTextareaProps) {
  const classes = [styles.textarea, invalid ? styles.invalid : undefined, className]
    .filter(Boolean)
    .join(' ');

  return (
    <textarea
      rows={rows}
      spellCheck={spellCheck}
      wrap={wrap}
      className={classes}
      aria-invalid={ariaInvalid ?? (invalid || undefined)}
      {...rest}
    />
  );
}
