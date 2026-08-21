'use client';

import {
  Children,
  createContext,
  isValidElement,
  type ReactNode,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useMountTransition, usePrefersReducedMotion } from '../../motion';
import {
  useOverlayFocusCapture,
  useOverlayKeyboardTrap,
  useOverlayScrollLock,
} from '../../overlay-shell';
import { Icon } from '../Icon/Icon';
import { OverlayHeader } from '../OverlayHeader/OverlayHeader';
import { DialogBody } from './DialogBody';
import { DialogFooter } from './DialogFooter';
import { DialogHeader } from './DialogHeader';
import styles from './Dialog.module.css';

/**
 * Splits `children` into `DialogHeader`/`DialogBody`/`DialogFooter` (found by
 * element type, wherever they appear as top-level children) plus whatever's
 * left over. `DialogHeader` and `DialogFooter` are optional, fixed
 * (non-scrolling) flex regions; the rest of the content — an explicit
 * `DialogBody`, or, if none was given, everything not recognized as one of
 * the three parts — always becomes the single scrollable region, so a plain,
 * unstructured `children` (no `DialogHeader`/`DialogBody`/`DialogFooter` at
 * all) renders exactly as it always has, just derived here instead of via a
 * separate render branch. `hasHeader` is what gates the built-in close
 * button — see `Dialog`'s own `showCloseButton` doc.
 */
function partitionDialogChildren(children: ReactNode) {
  let header: ReactNode = null;
  let explicitBody: ReactNode = null;
  let footer: ReactNode = null;
  const rest: ReactNode[] = [];

  Children.forEach(children, (child) => {
    if (isValidElement(child)) {
      if (child.type === DialogHeader) {
        header = child;
        return;
      }
      if (child.type === DialogBody) {
        explicitBody = child;
        return;
      }
      if (child.type === DialogFooter) {
        footer = child;
        return;
      }
    }
    rest.push(child);
  });

  const body =
    explicitBody ?? (rest.length > 0 ? <div className={styles.content}>{rest}</div> : null);

  return { header, body, footer, hasHeader: header !== null };
}

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
 * Registration channels for `DialogTitle`/`DialogDescription`'s generated
 * `id`s, so the panel's `aria-labelledby`/`aria-describedby` can reference
 * them — same "descendant registers itself with the nearest Dialog ancestor"
 * shape as `OverlaySecondRowContext` above, and for the same reason: both
 * components are typically nested inside `DialogHeader`, not a direct child
 * of `Dialog` itself, so a children-partition check (like
 * `partitionDialogChildren`'s) can't find them. Not exported from the
 * package's public API — `DialogTitle`/`DialogDescription` are the only
 * intended consumers.
 */
export const DialogTitleIdContext = createContext<((id: string | null) => void) | undefined>(
  undefined,
);
export const DialogDescriptionIdContext = createContext<((id: string | null) => void) | undefined>(
  undefined,
);

/**
 * Lets content deep inside a `Dialog` (e.g. a plugin's own route layout,
 * rendered several levels below wherever the `Dialog` itself is
 * instantiated) supply the second-row content of the Dialog's mobile-only,
 * legacy `title`-driven header bar — typically a tab strip. Only relevant to
 * that legacy path (no `DialogHeader` composed): once a `Dialog` has a real
 * `DialogHeader`, that header renders at every breakpoint on its own and this
 * hook's content has nowhere to go — nest the tab strip inside `DialogHeader`
 * directly instead for a composed Dialog.
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

export type DialogSize = 'sm' | 'md' | 'xl' | 'lg' | 'full' | 'auto';

export interface DialogProps {
  /** Whether the dialog is shown. When false, nothing renders. */
  open: boolean;
  /** Called on Esc, scrim click, or the close button. */
  onClose: () => void;
  /**
   * Panel size on desktop. `sm`/`md`/`xl`/`lg`/`full` are fixed widths (see
   * each size's own comment in Dialog.module.css); `auto` sizes both
   * dimensions to content instead, for a dialog whose size is genuinely
   * driven by what's inside it rather than a fixed preset — still capped so
   * it can't blow out past a reasonable width/height or the viewport. Mobile
   * always renders as a full-screen sheet regardless of `size`.
   */
  size?: DialogSize;
  /**
   * Accessible name for the dialog. Ignored — in favor of `aria-labelledby`
   * pointing at it — when a `DialogTitle` is present anywhere among
   * `children`; falls back to `title` when neither is given. Only needed at
   * all when using the original plain-children API or the mobile top bar
   * (see `title` below) without a `DialogTitle`.
   */
  'aria-label'?: string;
  /**
   * Legacy: shown in a mobile-only top bar alongside the close button (see
   * `useOverlaySecondRow`), for a `Dialog` that doesn't compose a
   * `DialogHeader`. Superseded by `DialogHeader`/`DialogTitle` for any new
   * usage — those render at every breakpoint and are what
   * `showCloseButton`'s default now keys off. Has no effect on the desktop
   * accessible name when a `DialogTitle` is present — that always wins over
   * both `title` and `aria-label` for `aria-labelledby`.
   */
  title?: string;
  /**
   * Whether to render the built-in close affordance (a bare "×"). Three-state:
   * left unset (the default), it shows **only when a `DialogHeader` is
   * present** among `children` — a `Dialog` with no header has nothing to
   * hang a close affordance on, so it relies on Esc/scrim-click/a footer
   * action instead. Pass `true`/`false` explicitly to override that default
   * in either direction — e.g. `true` for a `Dialog` that supplies its own
   * per-breakpoint header treatment without a literal `DialogHeader` (the
   * legacy `title` prop path), or `false` to suppress it even with a
   * `DialogHeader` present (the caller provides its own dismiss action).
   */
  showCloseButton?: boolean;
  /**
   * A composition of `DialogHeader` (optional), `DialogBody`, and
   * `DialogFooter` (optional), or plain content — see `DialogHeader`'s doc
   * comment for the full contract. Plain content (no `DialogHeader`/
   * `DialogBody`/`DialogFooter` at all) still renders as a single scrollable
   * region, unchanged from the original API — but see `showCloseButton`:
   * without a `DialogHeader`, that region no longer gets a close button by
   * default.
   */
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
  showCloseButton,
  children,
}: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const reducedMotion = usePrefersReducedMotion();
  const { mounted, phase } = useMountTransition(open, reducedMotion ? 0 : MOTION_DURATION_MS);
  const [secondRow, setSecondRow] = useState<ReactNode | null>(null);
  const [titleId, setTitleId] = useState<string | null>(null);
  const [descriptionId, setDescriptionId] = useState<string | null>(null);

  useOverlayScrollLock(mounted);
  useOverlayFocusCapture(panelRef, open);
  useOverlayKeyboardTrap(panelRef, open, onClose);

  if (!mounted) return null;
  const isOpenPhase = phase === 'open';
  const { header, body, footer, hasHeader } = partitionDialogChildren(children);
  // See DialogProps.showCloseButton: unset follows hasHeader; true/false overrides it.
  const closeButtonVisible = showCloseButton ?? hasHeader;

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
        aria-labelledby={titleId ?? undefined}
        aria-label={titleId ? undefined : (ariaLabel ?? title)}
        aria-describedby={descriptionId ?? undefined}
        tabIndex={-1}
        className={[styles.panel, styles[size], isOpenPhase ? styles.panelOpen : '']
          .filter(Boolean)
          .join(' ')}
      >
        {/* Legacy mobile-only bar (title/secondRow, no DialogHeader): once a
            real DialogHeader is composed, it already renders at every
            breakpoint on its own, so this bar would be a redundant second
            header — skip it entirely in that case. */}
        {!hasHeader && (
          <OverlayHeader
            title={title}
            onClose={onClose}
            showCloseButton={closeButtonVisible}
            secondRow={secondRow}
            className={styles.mobileHeader}
          />
        )}
        {/* The close affordance (bare "×"). Floats top-right on desktop
            always; on mobile it's hidden only in the legacy (!hasHeader)
            case, where OverlayHeader's own close button (row above) already
            covers mobile — a composed DialogHeader has no mobile-specific
            substitute, so this same button stays visible there too. */}
        {closeButtonVisible && (
          <button
            type="button"
            className={[styles.close, !hasHeader ? styles.closeHiddenOnLegacyMobileBar : '']
              .filter(Boolean)
              .join(' ')}
            aria-label="Close"
            onClick={onClose}
          >
            <Icon name="x" size="md" aria-hidden={true} />
          </button>
        )}
        <OverlaySecondRowContext.Provider value={setSecondRow}>
          <DialogTitleIdContext.Provider value={setTitleId}>
            <DialogDescriptionIdContext.Provider value={setDescriptionId}>
              {header}
              {body}
              {footer}
            </DialogDescriptionIdContext.Provider>
          </DialogTitleIdContext.Provider>
        </OverlaySecondRowContext.Provider>
      </div>
    </div>
  );
}
