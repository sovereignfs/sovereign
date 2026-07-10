'use client';

import { type ReactNode, useEffect, useRef } from 'react';
import { lockBodyScroll, unlockBodyScroll } from '../../scroll-lock';
import { useMountTransition, usePrefersReducedMotion } from '../../motion';
import { OverlayHeader } from '../OverlayHeader/OverlayHeader';
import styles from './Dialog.module.css';

// Matches --sv-motion-duration-base (Dialog.module.css) — kept as a plain JS
// constant rather than read from the CSS custom property so the unmount timer
// and the CSS transition duration can't silently drift apart at build time;
// change both together if this value ever changes.
const MOTION_DURATION_MS = 250;

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
  /** On mobile: shown in the top bar alongside the close button so the title
   *  and dismiss affordance occupy the same row instead of stacking. */
  title?: string;
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
 *
 * Animated open/close: fade + scale on desktop, slide-up on mobile (matching
 * the "feels like a page push" framing of the mobile sheet). The `open`/
 * `onClose` API is unchanged — closing still stays mounted internally for the
 * exit transition before actually unmounting; `prefers-reduced-motion: reduce`
 * collapses both to near-instant.
 */
export function Dialog({
  open,
  onClose,
  size = 'lg',
  'aria-label': ariaLabel,
  title,
  children,
}: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const reducedMotion = usePrefersReducedMotion();
  const { mounted, phase } = useMountTransition(open, reducedMotion ? 0 : MOTION_DURATION_MS);

  // Prevent document-level scroll for the whole mounted lifetime, including
  // the exit animation — not just while `open` — so the background can't
  // scroll while the panel is still visibly sliding/fading away. Ref-counted
  // so nested overlays (e.g. a confirmation dialog inside an overlay plugin)
  // don't release the lock while a sibling is still open.
  useEffect(() => {
    if (!mounted) return;
    lockBodyScroll();
    return unlockBodyScroll;
  }, [mounted]);

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

  if (!mounted) return null;
  const isOpenPhase = phase === 'open';

  return (
    // role="presentation" removes the scrim from the AT (it is purely visual).
    // e.target check lets clicks inside the panel bubble without triggering dismiss.
    <div
      className={[styles.scrim, isOpenPhase ? styles.scrimOpen : ''].filter(Boolean).join(' ')}
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
        aria-label={ariaLabel ?? title}
        tabIndex={-1}
        className={[styles.panel, styles[size], isOpenPhase ? styles.panelOpen : '']
          .filter(Boolean)
          .join(' ')}
      >
        {/* Mobile: shared OverlayHeader (title + close in one row, hidden on
            desktop via CSS — see .mobileHeader). */}
        <OverlayHeader title={title} onClose={onClose} className={styles.mobileHeader} />
        {/* Desktop: absolute close button (hidden on mobile via CSS). */}
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
