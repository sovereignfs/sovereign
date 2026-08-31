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

// Matches --sv-motion-duration-base (Dialog/Drawer/Sheet's own .module.css
// files) — kept as a plain JS constant rather than read from the CSS custom
// property so the unmount timer and the CSS transition duration can't
// silently drift apart at build time; change both together if this value
// ever changes. Single shared export (not one copy per component) so a
// future edit to one component's own local copy can't silently desync from
// the other two — previously hand-copied identically into all three files.
export const OVERLAY_MOTION_DURATION_MS = 250;

// A LIFO stack of currently-open overlay ids, used only to decide which
// overlay's Escape handler should act when more than one is open at once —
// e.g. a ConfirmDialog opened from inside a Dialog. Module-level, not React
// state: precedence is a synchronous fact resolved at keydown time, not
// something that needs to trigger a render. Every overlay that wants a say
// in Escape precedence registers here, including ConfirmDialog (native
// `<dialog>`, not built on `useOverlayKeyboardTrap` — see this file's own
// top comment) — it participates in this stack purely so a `Dialog`
// underneath it knows to defer, without adopting any of the other hooks.
let openOverlayIds: string[] = [];
let nextOverlayId = 0;

/** Call on open; returns an id to pass to `unregisterOpenOverlay`. */
export function registerOpenOverlay(): string {
  const id = `overlay-${nextOverlayId++}`;
  openOverlayIds.push(id);
  return id;
}

/** Call on close/unmount, with the id `registerOpenOverlay` returned. */
export function unregisterOpenOverlay(id: string): void {
  openOverlayIds = openOverlayIds.filter((existing) => existing !== id);
}

/** Whether `id` is the most-recently-registered still-open overlay. */
export function isTopmostOpenOverlay(id: string): boolean {
  return openOverlayIds.at(-1) === id;
}

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
 *
 * Registers with the module's open-overlay stack (see above) for the
 * lifetime of `open`, and only actually calls `onClose` on Escape when this
 * overlay is the topmost one. Without this, a Dialog whose descendant opens
 * its own nested overlay (a ConfirmDialog, another Dialog) would react to
 * every Escape press itself — closing the wrong, outer surface, and doing so
 * before the actually-topmost overlay (e.g. a native `<dialog>`, whose own
 * Escape handling is asynchronous per spec) gets a chance to process the key
 * itself. Registration is a separate effect keyed only on `open`, not on
 * `onClose`/`panelRef` — those change identity on unrelated re-renders, and
 * re-registering on every one of them would keep bumping this overlay to the
 * top of the stack, which is wrong when nothing about its open/closed state
 * actually changed.
 */
export function useOverlayKeyboardTrap(
  panelRef: RefObject<HTMLElement | null>,
  open: boolean,
  onClose: () => void,
): void {
  const overlayIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const id = registerOpenOverlay();
    overlayIdRef.current = id;
    return () => {
      unregisterOpenOverlay(id);
      overlayIdRef.current = null;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        const id = overlayIdRef.current;
        if (id !== null && !isTopmostOpenOverlay(id)) return;
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
