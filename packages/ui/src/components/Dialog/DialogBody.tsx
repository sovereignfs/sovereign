import type { ReactNode } from 'react';
import styles from './DialogParts.module.css';

export interface DialogBodyProps {
  children: ReactNode;
  className?: string;
}

/**
 * DialogBody — the scrollable region of a `Dialog`, and the one required
 * part of the `DialogHeader`/`DialogBody`/`DialogFooter` composition (see
 * `DialogHeader`'s doc comment for how `Dialog` detects and lays out the
 * three parts). Carries the padding/scrollbar treatment `Dialog`'s own
 * `.content` region normally provides, so this is the direct replacement for
 * "just pass children" once a consumer also wants a `DialogHeader` and/or
 * `DialogFooter` alongside it.
 */
export function DialogBody({ children, className }: DialogBodyProps) {
  return <div className={[styles.body, className].filter(Boolean).join(' ')}>{children}</div>;
}
