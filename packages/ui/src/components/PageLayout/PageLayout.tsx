'use client';

import type { ReactNode } from 'react';
import styles from './PageLayout.module.css';

export type PageLayoutPadding = 'none' | 'sm' | 'md' | 'lg';

export interface PageLayoutProps {
  /**
   * A page-specific header — e.g. a board title + search/share toolbar.
   * Not the app-level header (that's `RootLayout`'s `header`/`shell`
   * variants) — this is a second, contextual row scoped to this one page.
   * Renders edge-to-edge above the padded content, outside `padding`.
   */
  header?: ReactNode;
  /** The page gutter. Default `'none'` — unlike `PageContainer`, a bare
   *  `PageLayout` applies no padding at all; opt in per page. Same four-step
   *  scale and `--sv-page-gutter` stand-down hook as `PageContainer` (steps
   *  down at the same 768px breakpoint `Dialog`/`MobileHeader` use). */
  padding?: PageLayoutPadding;
  children: ReactNode;
  className?: string;
}

const paddingClass: Record<PageLayoutPadding, string> = {
  none: styles.padNone as string,
  sm: styles.padSm as string,
  md: styles.padMd as string,
  lg: styles.padLg as string,
};

/**
 * PageLayout — a single page's content area within a plugin (nested inside
 * `RootLayout`'s `main` slot, not a replacement for it). Enforces only
 * structure and dimensions; content always comes from props/children.
 *
 * `min-width: 100%; min-height: 100%` — safe here (unlike `RootLayout`'s own
 * root) because `PageLayout` is always nested inside an already
 * flex-stretched region (`ThreeColumnLayout`/`HeaderFooterLayout`'s
 * `.main`), and a stretched flex item's cross-size is definite for its
 * descendants' percentage resolution, so no separate height-cascading fix
 * is needed the way `RootLayout`'s root required one.
 */
export function PageLayout({ header, padding = 'none', children, className }: PageLayoutProps) {
  return (
    <div className={[styles.root, className].filter(Boolean).join(' ')}>
      {header && <div className={styles.header}>{header}</div>}
      <div className={[styles.content, paddingClass[padding]].join(' ')}>{children}</div>
    </div>
  );
}
