'use client';

import { type ReactNode, useCallback, useEffect, useRef } from 'react';
import styles from './Drawer.module.css';

export interface DrawerProps {
  /** Whether the drawer is shown. When false, nothing renders. */
  open: boolean;
  /** Called on Esc or scrim click. */
  onClose: () => void;
  /** Accessible name for the drawer panel (sets `aria-label`). */
  'aria-label'?: string;
  children: ReactNode;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Drawer — a dismissable bottom-sheet panel. Used by the mobile shell for
 * plugin navigation; also available to plugins for any bottom-up surface.
 *
 * Behaviour: Esc and scrim-click dismiss; focus moves to the first focusable
 * element on open and is restored on close; Tab is trapped within the panel.
 * The panel respects `env(safe-area-inset-bottom)` so it clears the home
 * indicator in standalone/fullscreen mode. Shares dismissal conventions and
 * tokens (`--sv-color-scrim`, `--sv-shadow-overlay`) with `Dialog`.
 */
export function Drawer({ open, onClose, 'aria-label': ariaLabel, children }: DrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const first = panel?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? panel)?.focus();
    return () => previouslyFocused.current?.focus();
  }, [open]);

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const panel = panelRef.current;
      if (!panel) return;
      const focusable = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)];
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) {
        event.preventDefault();
        return;
      }
      const active = document.activeElement;
      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    },
    [onClose],
  );

  if (!open) return null;

  return (
    <div className={styles.scrim} onClick={onClose}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        tabIndex={-1}
        className={styles.panel}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        {children}
      </div>
    </div>
  );
}
