'use client';

import { type ReactNode, useEffect, useRef } from 'react';
import { lockBodyScroll, unlockBodyScroll } from '../../scroll-lock';
import { useMountTransition, usePrefersReducedMotion } from '../../motion';
import { OverlayHeader } from '../OverlayHeader/OverlayHeader';
import styles from './Sheet.module.css';

export interface SheetProps {
  /** Whether the sheet is shown. When false, nothing renders. */
  open: boolean;
  /** Called on Esc, or the built-in `OverlayHeader`'s close button. There is
   *  no scrim to tap — a Sheet replaces the content area it fills, not a
   *  layer floating above it (see the component doc comment). */
  onClose: () => void;
  /** Accessible name for the sheet. Defaults to `title` when omitted. */
  'aria-label'?: string;
  /** Renders a built-in `OverlayHeader` (title + close, optional back button
   *  and trailing action). Omit when the content supplies its own header —
   *  e.g. a form whose title doubles as an editable field. */
  title?: string;
  /** Forwarded to `OverlayHeader` — see its own `onBack` doc. Has no effect
   *  without `title`. */
  onBack?: () => void;
  /** Forwarded to `OverlayHeader`'s trailing-action slot. Has no effect
   *  without `title`. */
  headerAction?: ReactNode;
  /**
   * Which edge the panel slides in from. Defaults to `'bottom'` (detail
   * views, forms — content the user is reaching down into). `'top'` suits a
   * short options/actions menu opened from a header button near the top of
   * the screen, where sliding up from the bottom would travel past empty
   * space before reaching content that visually belongs near the trigger.
   */
  slideFrom?: 'bottom' | 'top';
  children: ReactNode;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Matches --sv-motion-duration-base (Sheet.module.css) — see Dialog.tsx's
// identical constant for why this stays a plain JS number.
const MOTION_DURATION_MS = 250;

/**
 * Sheet — a full-page overlay that replaces a plugin's content area between
 * the shell's fixed header and footer (RFC 0013's mobile chrome stays visible
 * and interactive around it), sliding in from an edge instead of centering
 * like `Dialog`. Promoted from the tasks plugin's `MobileFullPageOverlay`
 * (now the reference pattern for this component). Desktop has no equivalent
 * presentation — a desktop layout shows the same content inline (columns,
 * panes) instead of mounting a `Sheet` at all; this component is for the
 * mobile case specifically.
 *
 * Unlike `Dialog`/`Drawer` there is no scrim: a Sheet visually *replaces* the
 * region it covers rather than floating a layer above it, so there is no
 * "outside" to tap-dismiss. Behaviour: Esc dismisses; focus moves into the
 * panel on open and is restored on close; Tab is trapped within the panel;
 * animated open/close via the same two-phase mount as `Dialog`/`Drawer`,
 * respecting `prefers-reduced-motion`.
 */
export function Sheet({
  open,
  onClose,
  'aria-label': ariaLabel,
  title,
  onBack,
  headerAction,
  slideFrom = 'bottom',
  children,
}: SheetProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const reducedMotion = usePrefersReducedMotion();
  const { mounted, phase } = useMountTransition(open, reducedMotion ? 0 : MOTION_DURATION_MS);

  useEffect(() => {
    if (!mounted) return;
    lockBodyScroll();
    return unlockBodyScroll;
  }, [mounted]);

  useEffect(() => {
    if (!mounted) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const first = panel?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? panel)?.focus();
    return () => previouslyFocused.current?.focus();
  }, [mounted]);

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

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel ?? title}
      tabIndex={-1}
      className={[
        styles.panel,
        slideFrom === 'top' ? styles.panelFromTop : '',
        phase === 'open' ? styles.panelOpen : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {title && (
        <OverlayHeader title={title} onClose={onClose} onBack={onBack} action={headerAction} />
      )}
      {/* Content is always the scroll container — with or without a header —
          so a header's sibling stays fixed and any content-owned internal
          sticky positioning (e.g. a form's own sub-header) resolves against
          this same scrolling ancestor either way. */}
      <div className={styles.content}>{children}</div>
    </div>
  );
}
