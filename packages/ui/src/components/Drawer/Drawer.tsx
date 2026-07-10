'use client';

import { type PointerEvent as ReactPointerEvent, type ReactNode, useEffect, useRef } from 'react';
import { lockBodyScroll, unlockBodyScroll } from '../../scroll-lock';
import { useMountTransition, usePrefersReducedMotion } from '../../motion';
import styles from './Drawer.module.css';

// Matches --sv-motion-duration-base (Drawer.module.css) — see Dialog.tsx's
// identical constant for why this stays a plain JS number instead of being
// read from the CSS custom property.
const MOTION_DURATION_MS = 250;

export interface DrawerProps {
  /** Whether the drawer is shown. When false, nothing renders. */
  open: boolean;
  /** Called on Esc, scrim click, or a swipe-down past the dismiss threshold. */
  onClose: () => void;
  /** Accessible name for the drawer panel (sets `aria-label`). */
  'aria-label'?: string;
  /** `'content'` (default) sizes to content, capped at 80dvh. `'half'` fixes
   *  the panel to 50dvh regardless of content — per the design-system's
   *  "half screen or less" convention for Drawer, this is the only other
   *  supported size; taller content should use `Sheet` instead. */
  snapHeight?: 'content' | 'half';
  children: ReactNode;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Downward drag distance (px) past which releasing dismisses the drawer
// instead of snapping back open. Distance-only, no velocity tracking — matches
// the swipe-to-reveal gesture already established in consuming plugins (see
// the mobile design-system plan), not a separate technique invented here.
const SWIPE_DISMISS_THRESHOLD_PX = 100;

/**
 * Drawer — a dismissable bottom-sheet panel. Used by the mobile shell for
 * plugin navigation; also available to plugins for any bottom-up surface.
 *
 * Behaviour: Esc, scrim click, or dragging the grab handle down past
 * `SWIPE_DISMISS_THRESHOLD_PX` all dismiss; focus moves to the first
 * focusable element on open and is restored on close; Tab is trapped within
 * the panel. The panel respects `env(safe-area-inset-bottom)` so it clears
 * the home indicator in standalone/fullscreen mode. Shares dismissal
 * conventions and tokens (`--sv-color-scrim`, `--sv-shadow-overlay`) with
 * `Dialog`.
 *
 * Animated open/close: slides up from the bottom, scrim fades. The `open`/
 * `onClose` API is unchanged — closing stays mounted internally for the exit
 * transition before actually unmounting; `prefers-reduced-motion: reduce`
 * collapses it to near-instant.
 *
 * The grab handle is the *only* drag-initiation region (not the whole panel)
 * — dragging from body content would fight that content's own internal
 * scroll, the same reasoning behind the tasks plugin's edge-zone-only
 * swipe-to-reveal technique.
 */
export function Drawer({
  open,
  onClose,
  'aria-label': ariaLabel,
  snapHeight = 'content',
  children,
}: DrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const reducedMotion = usePrefersReducedMotion();
  const { mounted, phase } = useMountTransition(open, reducedMotion ? 0 : MOTION_DURATION_MS);
  // Tracks an in-progress handle drag. Kept in a ref (not state) so pointermove
  // updates the DOM directly at 60fps instead of re-rendering on every event —
  // same technique as the tasks plugin's swipe-to-reveal rows.
  const dragStartY = useRef<number | null>(null);

  // Locked for the whole mounted lifetime (including the exit animation), not
  // just while `open` — see Dialog.tsx's identical comment for why.
  useEffect(() => {
    if (!mounted) return;
    lockBodyScroll();
    return unlockBodyScroll;
  }, [mounted]);

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

  // Swipe-down-to-dismiss, initiated only from the grab handle (see the
  // component doc comment for why not the whole panel). Drags the panel
  // directly via inline style while active (transition: none, so it tracks
  // the finger 1:1 with no lag) and lets go on release: clearing the inline
  // transform in the same commit that re-enables the CSS transition makes
  // the panel animate from wherever the drag ended to its resolved position
  // — open (snap back) or closed (the exit transition, same as a
  // programmatic close) — rather than jump-cutting there. Same technique as
  // the tasks plugin's row swipe-to-reveal.
  function handleHandlePointerDown(e: ReactPointerEvent) {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragStartY.current = e.clientY;
  }

  function handleHandlePointerMove(e: ReactPointerEvent) {
    const startY = dragStartY.current;
    if (startY === null) return;
    const dy = Math.max(0, e.clientY - startY); // upward drag has no effect — already fully open
    const panel = panelRef.current;
    if (!panel) return;
    panel.style.transition = 'none';
    panel.style.transform = `translateY(${dy}px)`;
  }

  // Releases the drag and resolves it to open (snap back) or closed, based on
  // distance. Shared by pointerup (a completed gesture) and pointercancel
  // (the browser took the gesture away, e.g. for a system gesture) — cancel
  // always snaps back rather than honoring the distance, since it wasn't a
  // deliberate release.
  function releaseDrag(e: ReactPointerEvent, honorDistance: boolean) {
    const startY = dragStartY.current;
    dragStartY.current = null;
    if (startY === null) return;
    const dy = Math.max(0, e.clientY - startY);
    const panel = panelRef.current;
    if (panel) {
      panel.style.transform = '';
      panel.style.transition = '';
    }
    if (honorDistance && dy > SWIPE_DISMISS_THRESHOLD_PX) onClose();
  }

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
        aria-label={ariaLabel}
        tabIndex={-1}
        className={[
          styles.panel,
          snapHeight === 'half' ? styles.panelHalf : '',
          isOpenPhase ? styles.panelOpen : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {/* The only drag-initiation region for swipe-down-to-dismiss — see the
            component doc comment for why not the whole panel. Decorative +
            functional, so no aria-label of its own; Esc and the scrim remain
            the accessible dismiss paths. */}
        <div
          className={styles.handle}
          aria-hidden="true"
          onPointerDown={handleHandlePointerDown}
          onPointerMove={handleHandlePointerMove}
          onPointerUp={(e) => releaseDrag(e, true)}
          onPointerCancel={(e) => releaseDrag(e, false)}
        />
        {children}
      </div>
    </div>
  );
}
