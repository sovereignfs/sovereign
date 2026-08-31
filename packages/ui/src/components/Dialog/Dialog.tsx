'use client';

import { createContext, type ReactNode, useContext, useEffect, useRef, useState } from 'react';
import { useMountTransition, usePrefersReducedMotion } from '../../motion';
import {
  OVERLAY_MOTION_DURATION_MS,
  useOverlayFocusCapture,
  useOverlayKeyboardTrap,
  useOverlayScrollLock,
} from '../../overlay-shell';
import { Icon } from '../Icon/Icon';
import { OverlayHeader } from '../OverlayHeader/OverlayHeader';
import styles from './Dialog.module.css';

// undefined (the default, outside any Provider) means "no Dialog ancestor" —
// distinct from a real setter function, so useOverlaySecondRow can silently
// no-op when called outside a Dialog instead of throwing.
const OverlaySecondRowContext = createContext<((node: ReactNode | null) => void) | undefined>(
  undefined,
);

/**
 * Lets content deep inside a `Dialog` (e.g. a plugin's own route layout,
 * rendered several levels below wherever the `Dialog` itself is
 * instantiated) supply the second-row content of the Dialog's `OverlayHeader`
 * — typically a tab strip. Solves the "double header" problem: without this,
 * a plugin's own tab strip has no way to reach the Dialog's header and ends
 * up rendered a second time, as its own sticky bar, inside the scrolling
 * content area. Reaches the header regardless of whether it's showing via
 * the `header` prop (both breakpoints) or the default `title`-driven mobile
 * bar (mobile only) — see `DialogProps.header`'s own doc comment.
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

// `full` is CSS-identical to `lg` (both a true fixed 100%/100% box, see
// Dialog.module.css's `.lg, .full` rule) — a deliberate alias, not dead code
// left behind by oversight. Removing it outright would be a breaking type
// change for zero runtime benefit: the sole call site in this repo,
// CardDetailOverlay.tsx's `size={isMobile ? 'full' : 'xl'}`, lives in a
// gitignored `.local` plugin clone outside this repo's ownership, whose own
// separate build would start failing against a future bump with no local
// way to catch it first. Kept for that consumer; every new consumer should
// prefer `lg` directly.
export type DialogSize = 'sm' | 'md' | 'xl' | 'lg' | 'full';

export interface DialogProps {
  /** Whether the dialog is shown. When false, nothing renders. */
  open: boolean;
  /** Called on Esc, scrim click, or the close button. */
  onClose: () => void;
  /** Panel size on desktop. Mobile always renders as a full-screen sheet. */
  size?: DialogSize;
  /** Accessible name for the dialog (sets `aria-label` on the panel). Falls
   *  back to `title` when omitted — this still applies even when `header` is
   *  used instead of `title` for the visible header (see `header`'s own doc
   *  comment), so pass `aria-label` explicitly in that case if `title` is
   *  also omitted. */
  'aria-label'?: string;
  /** Shown in the top bar alongside the close button, on mobile only —
   *  desktop has no header row by default (see `header` for that). Ignored
   *  as visible content when `header` is provided; still used as the
   *  `aria-label` fallback either way. */
  title?: string;
  /** Renders a persistent header row (via the same `OverlayHeader` component
   *  `title` alone only shows on mobile) on **both** desktop and mobile —
   *  the "Header + Body" / "Header + Body + Footer" shapes. Supersedes
   *  `title` for visible content when provided; `title` remains the
   *  `aria-label` fallback if `aria-label` is also omitted. Omitting both
   *  `header` and `footer` is "Body only" — today's default, unchanged. */
  header?: ReactNode;
  /** Renders a persistent footer row below the scrollable body — pinned on
   *  both desktop and mobile the same way `header`/the mobile title bar are
   *  (a non-scrolling flex sibling, not `position: sticky`): only the region
   *  between header and footer scrolls. Typically action buttons (Save/
   *  Cancel). Omit for no footer — today's default, where any actions live
   *  inside `children` and scroll with the rest of the body. Layout-agnostic
   *  (no built-in button alignment) — arrange the footer's own content as
   *  needed, same as `children`. */
  footer?: ReactNode;
  /** Forwarded to the active `OverlayHeader` instance's own `rowClassName`
   *  (whichever is showing — `header` or the mobile `title` bar) — restyle
   *  the title row (e.g. tighter padding to match a consumer's own compact
   *  header elsewhere) without changing its title/close layout. */
  rowClassName?: string;
  /** Forwarded to the active `OverlayHeader` instance's own `titleClassName`
   *  — restyle the title text (e.g. a smaller font size to match a
   *  consumer's own compact header elsewhere). */
  titleClassName?: string;
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
 *
 * Three composition shapes, chosen by which of `header`/`footer` are passed:
 * Body only (both omitted — today's default), Header + Body (`header` only),
 * Header + Body + Footer (`header` and `footer`). Whichever of header/footer
 * are present render as non-scrolling flex siblings around `.content`, which
 * stays the only scrollable region in every shape.
 */
export function Dialog({
  open,
  onClose,
  size = 'lg',
  'aria-label': ariaLabel,
  title,
  header,
  footer,
  rowClassName,
  titleClassName,
  children,
}: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const reducedMotion = usePrefersReducedMotion();
  const { mounted, phase } = useMountTransition(
    open,
    reducedMotion ? 0 : OVERLAY_MOTION_DURATION_MS,
  );
  const [secondRow, setSecondRow] = useState<ReactNode | null>(null);

  useOverlayScrollLock(mounted);
  useOverlayFocusCapture(panelRef, open);
  useOverlayKeyboardTrap(panelRef, open, onClose);

  if (!mounted) return null;
  const isOpenPhase = phase === 'open';

  return (
    // role="presentation" removes the scrim from the AT (it is purely visual).
    // e.target check lets clicks inside the panel bubble without triggering dismiss.
    // No onKeyDown here — useOverlayKeyboardTrap above already owns Escape via a
    // document-level listener; a second handler here used to double-fire onClose
    // per keypress (the keydown bubbles through this element on its way to
    // document), which is exactly the kind of bug that turns a single Escape
    // press into two router.back() calls for @modal-driven consumers.
    <div
      className={[styles.scrim, isOpenPhase ? styles.scrimOpen : ''].filter(Boolean).join(' ')}
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
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
        {header ? (
          /* header supersedes the mobile-only title bar below — OverlayHeader
             itself has no internal breakpoint gating (see its own module
             CSS), so rendering it with no Dialog-level display-toggling
             className, as here, is what makes it show on both desktop and
             mobile. It carries its own close button, so the separate
             desktop-only .close button below is skipped entirely in this
             branch — never render both at once. */
          <OverlayHeader
            title={header}
            onClose={onClose}
            secondRow={secondRow}
            rowClassName={rowClassName}
            titleClassName={titleClassName}
          />
        ) : (
          <>
            {/* Mobile: shared OverlayHeader (title + close in one row, hidden
                on desktop via CSS — see .mobileHeader). secondRow is
                populated by a descendant's useOverlaySecondRow call, e.g. a
                plugin's own tab strip — see that hook's doc comment for why. */}
            <OverlayHeader
              title={title}
              onClose={onClose}
              secondRow={secondRow}
              className={styles.mobileHeader}
              rowClassName={rowClassName}
              titleClassName={titleClassName}
            />
            {/* Desktop: absolute close button (hidden on mobile via CSS).
                Plain `x`, matching the mobile OverlayHeader's own close icon
                above it (OverlayHeader.tsx) — a single consistent close
                affordance across breakpoints instead of desktop's own
                separate `circle-x` glyph (the previous choice here).
                Platform-wide: every `Dialog` consumer without a `header`
                gets this, not just the one it was requested against —
                `Dialog` has no per-instance override for its own close
                button. */}
            <button type="button" className={styles.close} aria-label="Close" onClick={onClose}>
              <Icon name="x" size="md" aria-hidden={true} />
            </button>
          </>
        )}
        {/* The panel is a fixed-size box; only this region scrolls, so the
            panel never resizes with its content and the header/close button
            and footer (if present) stay pinned. */}
        <div className={styles.content}>
          <OverlaySecondRowContext.Provider value={setSecondRow}>
            {children}
          </OverlaySecondRowContext.Provider>
        </div>
        {footer && <div className={styles.footer}>{footer}</div>}
      </div>
    </div>
  );
}
