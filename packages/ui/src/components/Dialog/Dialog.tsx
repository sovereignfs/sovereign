'use client';

import { type ReactNode, useEffect, useRef } from 'react';
import styles from './Dialog.module.css';

export type DialogSize = 'sm' | 'md' | 'lg' | 'full';

export interface DialogProps {
  /** Whether the dialog is shown. When false, nothing renders. */
  open: boolean;
  /** Called on Esc, scrim click, or the close button. */
  onClose: () => void;
  /** Panel size on desktop. Mobile always renders as a full-screen sheet. */
  size?: DialogSize;
  /** Accessible name for the dialog (sets `aria-label` on the panel). */
  'aria-label'?: string;
  children: ReactNode;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Dialog — a modal surface (scrim + panel) for overlay-shell plugins and any
 * plugin that needs a dismissable layer. Router-agnostic: the caller decides
 * what `onClose` does (the runtime's `@modal` slot wires it to `router.back()`).
 *
 * Behaviour: Esc and scrim-click dismiss; focus moves into the panel on open and
 * is restored to the previously-focused element on close; Tab is trapped within
 * the panel. Styling references `--sv-*` tokens only; on mobile the panel becomes
 * a full-screen sheet regardless of `size`.
 */
export function Dialog({
  open,
  onClose,
  size = 'lg',
  'aria-label': ariaLabel,
  children,
}: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  // Capture focus on open; restore it on close/unmount.
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
        className={[styles.panel, styles[size]].join(' ')}
      >
        <button type="button" className={styles.close} aria-label="Close" onClick={onClose}>
          ×
        </button>
        {/* The panel is a fixed-size box; only this region scrolls, so the
            panel never resizes with its content and the close button stays
            pinned. */}
        <div className={styles.content}>{children}</div>
      </div>
    </div>
  );
}
