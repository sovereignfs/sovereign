import type { ReactNode } from 'react';
import { Icon } from '../Icon/Icon';
import styles from './OverlayHeader.module.css';

export interface OverlayHeaderProps {
  /** Overlay title, shown between the optional back button and the trailing
   *  slots. Optional — some consumers (e.g. `Dialog`'s mobile bar) need the
   *  row's close button present even when no title applies. */
  title?: string;
  /** Always renders a close button; called on click. */
  onClose: () => void;
  /** When provided, renders a back-chevron button before the title (for
   *  hierarchical navigation within a single overlay — going back without
   *  fully closing it). Omit for a flat overlay that only ever closes. */
  onBack?: () => void;
  /** Trailing slot next to the close button — e.g. a "Save" action. */
  action?: ReactNode;
  /** A second row below the title row — e.g. a tab strip. */
  secondRow?: ReactNode;
  className?: string;
  /** Override the title row's own className (e.g. tighter padding to match
   *  a consumer's own compact header elsewhere in the same surface) — the
   *  row keeps its standard title/back/action/close layout, just restyled.
   *  For a genuinely different shape, don't use `OverlayHeader` at all (see
   *  this component's own doc comment). */
  rowClassName?: string;
  /** Override the title text's own className (e.g. a smaller font size to
   *  match a consumer's own compact header elsewhere in the same surface). */
  titleClassName?: string;
}

/**
 * OverlayHeader — the shared fixed secondary header for `Dialog`'s mobile
 * mode, `Sheet`, and `Drawer`: title + close (+ optional back button /
 * trailing action / tab-strip row). Not itself `position: sticky` or
 * `position: fixed` — it stays visually pinned because the consuming overlay
 * renders it as a non-scrolling flex sibling before its own scrollable
 * content region, the same technique `Dialog`'s `.mobileBar` already used
 * before this component existed to generalize it.
 *
 * Content that needs a fully custom header (e.g. an editable title, or
 * controls that aren't a simple title/back/action shape) should not use this
 * component — render its own header row instead; `Sheet`'s `title` prop is
 * optional specifically to leave that escape hatch open.
 */
export function OverlayHeader({
  title,
  onClose,
  onBack,
  action,
  secondRow,
  className,
  rowClassName,
  titleClassName,
}: OverlayHeaderProps) {
  return (
    <div className={[styles.header, className].filter(Boolean).join(' ')}>
      <div className={[styles.row, rowClassName].filter(Boolean).join(' ')}>
        {onBack && (
          <button type="button" className={styles.backButton} aria-label="Back" onClick={onBack}>
            <Icon name="chevron-left" size="md" aria-hidden />
          </button>
        )}
        <span className={[styles.title, titleClassName].filter(Boolean).join(' ')}>{title}</span>
        {action && <div className={styles.action}>{action}</div>}
        <button type="button" className={styles.closeButton} aria-label="Close" onClick={onClose}>
          <Icon name="x" size="sm" aria-hidden />
        </button>
      </div>
      {secondRow && <div className={styles.secondRow}>{secondRow}</div>}
    </div>
  );
}
