import type { ReactNode } from 'react';
import styles from './DialogParts.module.css';

export interface DialogHeaderProps {
  children: ReactNode;
  className?: string;
}

/**
 * DialogHeader — an optional fixed (non-scrolling) region at the top of a
 * `Dialog`'s panel, a sibling of `DialogBody` (required) and `DialogFooter`
 * (optional). Composing `Dialog` from these parts is opt-in: `Dialog` only
 * switches to this fixed-header/scrollable-body/fixed-footer layout when it
 * finds a `DialogBody` among its children — plain, unstructured `children`
 * (the original API) keep behaving exactly as before.
 *
 * Distinct from `Dialog`'s own built-in mobile title bar and desktop close
 * button, which render independently of this component — use `Dialog`'s
 * `title`/`showCloseButton` props for those. `DialogHeader` is a plain content
 * slot for whatever else a header row needs (a custom title treatment,
 * leading icon, tabs, etc.), styled with a bottom border and padding to read
 * as a header. On desktop it also reserves space at its trailing edge so its
 * content doesn't run under `Dialog`'s floating close button.
 */
export function DialogHeader({ children, className }: DialogHeaderProps) {
  return <div className={[styles.header, className].filter(Boolean).join(' ')}>{children}</div>;
}
