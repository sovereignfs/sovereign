import type { ReactNode } from 'react';
import styles from './DialogParts.module.css';

export interface DialogFooterProps {
  children: ReactNode;
  className?: string;
}

/**
 * DialogFooter — an optional fixed (non-scrolling) region at the bottom of a
 * `Dialog`'s panel, typically the action-button row (Cancel/Confirm). A
 * sibling of `DialogHeader` (optional) and `DialogBody` (required) — see
 * `DialogHeader`'s doc comment for the composition rules. Right-aligns its
 * children by default (the common case for action buttons); override with
 * `className` for a different layout.
 */
export function DialogFooter({ children, className }: DialogFooterProps) {
  return <div className={[styles.footer, className].filter(Boolean).join(' ')}>{children}</div>;
}
