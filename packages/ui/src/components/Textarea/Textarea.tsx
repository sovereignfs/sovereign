'use client';

import { useLayoutEffect, useRef } from 'react';
import type { TextareaHTMLAttributes } from 'react';
import styles from './Textarea.module.css';

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  /** Grows the field's own height to fit its content as it's typed, instead
   *  of scrolling internally or leaving the user to drag-resize — e.g. an
   *  editable title that should read as a heading, not a fixed-size form
   *  field. Disables manual resize (`resize: none`) since a height driven by
   *  content and a user-draggable height would fight each other. `rows` is
   *  still honoured as the starting/minimum height. */
  autoGrow?: boolean;
}

/**
 * Textarea — the primitive multi-line text field. Presentational and
 * RSC-safe unless `autoGrow` is used (client-only, needs a layout
 * measurement). Forwards all native textarea props to the underlying
 * `<textarea>`. Styling references `--sv-*` tokens via CSS Modules; there
 * are no hardcoded values.
 */
export function Textarea({ className, rows = 4, autoGrow = false, ...rest }: TextareaProps) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!autoGrow || !el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [autoGrow, rest.value, rest.defaultValue]);

  const classes = [styles.textarea, autoGrow ? styles.textareaAutoGrow : '', className]
    .filter(Boolean)
    .join(' ');
  return <textarea ref={ref} rows={rows} className={classes} {...rest} />;
}
