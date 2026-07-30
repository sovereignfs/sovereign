'use client';

import { type RefObject, useEffect, useRef } from 'react';
import { lockBodyScroll, unlockBodyScroll } from './scroll-lock';

// Internal to the design system — not exported from `index.ts`. Shared by
// Dialog, Drawer, and Sheet, which independently implemented identical
// scrim/focus-trap/Escape/scroll-lock logic before this consolidation
// (RFC 0079, epic task 9.19). ConfirmDialog is deliberately not migrated
// here — it stays on the native `<dialog>` element, which already provides
// equivalent focus-trap/backdrop semantics more reliably for its use case.

export const OVERLAY_FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Locks document scroll for the whole mounted lifetime of an overlay
 * (including its exit animation), not just while `open` — so the background
 * can't scroll while the panel is still visibly sliding/fading away.
 * Ref-counted via `scroll-lock.ts` so nested overlays (e.g. a confirmation
 * dialog inside an overlay-shell plugin) don't release the lock while a
 * sibling is still open.
 */
export function useOverlayScrollLock(mounted: boolean): void {
  useEffect(() => {
    if (!mounted) return;
    lockBodyScroll();
    return unlockBodyScroll;
  }, [mounted]);
}

/**
 * Captures the element focused before the overlay opened, moves focus into
 * the panel when `active` becomes true, and restores the original focus on
 * cleanup. Callers pass whichever prop should trigger the capture — `open`
 * for Dialog/Drawer, `mounted` for Sheet (which restores focus on unmount
 * rather than on the raw `open` transition).
 */
export function useOverlayFocusCapture(
  panelRef: RefObject<HTMLElement | null>,
  active: boolean,
): void {
  const previouslyFocused = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!active) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const first = panel?.querySelector<HTMLElement>(OVERLAY_FOCUSABLE_SELECTOR);
    (first ?? panel)?.focus();
    return () => previouslyFocused.current?.focus();
  }, [active, panelRef]);
}

/**
 * Escape-to-close plus a Tab focus trap cycling within the panel. Attached
 * at `document` level so no keyboard listener is needed on the overlay's own
 * element (which would trigger `jsx-a11y/no-noninteractive-element-interactions`).
 */
export function useOverlayKeyboardTrap(
  panelRef: RefObject<HTMLElement | null>,
  open: boolean,
  onClose: () => void,
): void {
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
      const focusable = [...panel.querySelectorAll<HTMLElement>(OVERLAY_FOCUSABLE_SELECTOR)];
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
  }, [open, onClose, panelRef]);
}
