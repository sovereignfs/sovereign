'use client';

import { type ReactNode, useEffect, useRef } from 'react';
import { lockBodyScroll, unlockBodyScroll } from '../../scroll-lock';
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
    lockBodyScroll();
    return unlockBodyScroll;
  }, [open]);

  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const first = panel?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? panel)?.focus();
    return () => previouslyFocused.current?.focus();
  }, [open]);

  // Keyboard handling: Escape closes, Tab cycles within the panel (focus trap).
  // Attached at document level so no keyboard listener is needed on the dialog
  // div itself (which would trigger jsx-a11y/no-noninteractive-element-interactions).
  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const panel = panelRef.current;
      if (!panel) return;
      const focusable = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)];
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) {
        e.preventDefault();
        return;
      }
      const active = document.activeElement;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    // role="presentation" removes the scrim from the AT (it is purely visual).
    // e.target check lets clicks inside the panel bubble without triggering dismiss.
    <div
      className={styles.scrim}
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        tabIndex={-1}
        className={styles.panel}
      >
        {children}
      </div>
    </div>
  );
}
