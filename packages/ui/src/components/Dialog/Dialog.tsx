'use client';

import { createContext, type ReactNode, useContext, useEffect, useRef, useState } from 'react';
import { useMountTransition, usePrefersReducedMotion } from '../../motion';
import {
  useOverlayFocusCapture,
  useOverlayKeyboardTrap,
  useOverlayScrollLock,
} from '../../overlay-shell';
import { Icon } from '../Icon/Icon';
import { OverlayHeader } from '../OverlayHeader/OverlayHeader';
import styles from './Dialog.module.css';

// Matches --sv-motion-duration-base (Dialog.module.css) — kept as a plain JS
// constant rather than read from the CSS custom property so the unmount timer
// and the CSS transition duration can't silently drift apart at build time;
// change both together if this value ever changes.
const MOTION_DURATION_MS = 250;

// undefined (the default, outside any Provider) means "no Dialog ancestor" —
// distinct from a real setter function, so useOverlaySecondRow can silently
// no-op when called outside a Dialog instead of throwing.
const OverlaySecondRowContext = createContext<((node: ReactNode | null) => void) | undefined>(
  undefined,
);

/**
 * Lets content deep inside a `Dialog` (e.g. a plugin's own route layout,
 * rendered several levels below wherever the `Dialog` itself is
 * instantiated) supply the second-row content of the Dialog's mobile
 * `OverlayHeader` — typically a tab strip. Solves the "double header"
 * problem: without this, a plugin's own tab strip has no way to reach the
 * Dialog's header and ends up rendered a second time, as its own sticky bar,
 * inside the scrolling content area.
 *
 * A no-op when there is no enclosing `Dialog` (e.g. the same plugin layout
 * also rendered on a plain, non-overlay route) — safe to call unconditionally.
 * Returns whether an enclosing `Dialog` actually received the content, so a
 * caller that also renders its own inline header/tab-strip copy for the
 * no-Dialog case can hide that copy on mobile specifically when this
 * returned `true` (the Dialog's own header is showing it instead there).
 *
 * ```tsx
 * function AccountLayout({ children }) {
 *   const insideOverlay = useOverlaySecondRow(<nav>...tab strip...</nav>);
 *   return <div>{children}</div>;
 * }
 * ```
 */
export function useOverlaySecondRow(node: ReactNode | null): boolean {
  const setSecondRow = useContext(OverlaySecondRowContext);
  useEffect(() => {
    if (!setSecondRow) return;
    setSecondRow(node);
    return () => setSecondRow(null);
  }, [setSecondRow, node]);
  return setSecondRow !== undefined;
}

export type DialogSize = 'sm' | 'md' | 'xl' | 'lg' | 'full';

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
  const reducedMotion = usePrefersReducedMotion();
  const { mounted, phase } = useMountTransition(open, reducedMotion ? 0 : MOTION_DURATION_MS);
  const [secondRow, setSecondRow] = useState<ReactNode | null>(null);

  useOverlayScrollLock(mounted);
  useOverlayFocusCapture(panelRef, open);
  useOverlayKeyboardTrap(panelRef, open, onClose);

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
            desktop via CSS — see .mobileHeader). secondRow is populated by a
            descendant's useOverlaySecondRow call, e.g. a plugin's own tab
            strip — see that hook's doc comment for why. */}
        <OverlayHeader
          title={title}
          onClose={onClose}
          secondRow={secondRow}
          className={styles.mobileHeader}
        />
        {/* Desktop: absolute close button (hidden on mobile via CSS).
            `circle-x`, not a bare "×" glyph — developer-requested, a real
            icon reads as a more deliberate close affordance than a plain
            text character sized up via `font-size`. Platform-wide: every
            `Dialog` consumer gets this, not just the one it was requested
            against — `Dialog` has no per-instance override for its own
            close button. */}
        <button type="button" className={styles.close} aria-label="Close" onClick={onClose}>
          <Icon name="circle-x" size="md" aria-hidden={true} />
        </button>
        {/* The panel is a fixed-size box; only this region scrolls, so the
            panel never resizes with its content and the close button stays
            pinned. */}
        <div className={styles.content}>
          <OverlaySecondRowContext.Provider value={setSecondRow}>
            {children}
          </OverlaySecondRowContext.Provider>
        </div>
      </div>
    </div>
  );
}
