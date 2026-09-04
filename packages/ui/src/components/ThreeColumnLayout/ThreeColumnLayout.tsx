'use client';

import { Children } from 'react';
import type { ReactNode } from 'react';
import styles from './ThreeColumnLayout.module.css';

export interface ThreeColumnLayoutProps {
  /**
   * Exactly 2 (sidebar, main) or 3 (sidebar, main, detail) elements. Omit
   * the third child entirely to render two columns — e.g.
   * `{selected && <Detail />}` — React.Children.toArray drops falsy
   * children, so no separate `detail` prop is needed to make that
   * conditional.
   */
  children: ReactNode;
  /** px. Fixed width of the first (leftmost) column. Default 280. */
  sidebarWidth?: number;
  /** px. Fixed width of the third column, when present. Default 360. */
  detailWidth?: number;
  /**
   * Hides the sidebar column entirely — no width, no border, no layout box
   * — while keeping it mounted and every sibling in its own stable position.
   *
   * Prefer this over conditionally omitting the sidebar child, or swapping
   * to a different wrapper when collapsed. Omitting it shifts `main` into
   * the sidebar slot, and swapping the surrounding element type unmounts
   * `main`'s entire subtree — silently discarding its React state (a live
   * stream, unsent composer text, an in-memory-only conversation) on every
   * collapse toggle. Found live in Warden, whose chat column lost all of
   * that each time the sidebar was shown or hidden.
   */
  sidebarHidden?: boolean;
  className?: string;
}

/**
 * ThreeColumnLayout — sidebar + main + optional detail column, for the
 * common "list app" shape (a list sidebar, a primary content list, and a
 * detail pane that only takes up space once something is selected).
 *
 * Purely positional and structural — it has no awareness of what's inside
 * each slot (no injected landmarks/labels; those belong to the children
 * themselves) and no responsive behavior of its own. Collapsing further at
 * narrow desktop/tablet widths (e.g. swapping the detail column for an
 * overlay) is the consuming plugin's decision; below the mobile breakpoint,
 * compose with ResponsiveSurface to fork to a different tree entirely.
 */
export function ThreeColumnLayout({
  children,
  sidebarWidth = 280,
  detailWidth = 360,
  sidebarHidden = false,
  className,
}: ThreeColumnLayoutProps) {
  const items = Children.toArray(children);

  if (process.env.NODE_ENV !== 'production' && (items.length < 2 || items.length > 3)) {
    console.warn(
      `[ThreeColumnLayout] Expects 2 or 3 children (sidebar, main, optional detail); received ${items.length}.`,
    );
  }

  const [sidebar, main, detail] = items;

  return (
    <div className={[styles.shell, className].filter(Boolean).join(' ')}>
      {/* `hidden` (not just the class) so the column leaves the
          accessibility tree and the tab order too, rather than staying
          reachable by keyboard while invisible. */}
      <div
        className={[styles.sidebar, sidebarHidden && styles.sidebarHidden]
          .filter(Boolean)
          .join(' ')}
        style={sidebarHidden ? undefined : { width: sidebarWidth }}
        hidden={sidebarHidden}
      >
        {sidebar}
      </div>
      <div className={styles.main}>{main}</div>
      {detail && (
        <div className={styles.detail} style={{ width: detailWidth }}>
          {detail}
        </div>
      )}
    </div>
  );
}
