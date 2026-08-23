'use client';

import { Children } from 'react';
import type { ReactNode } from 'react';
import { HeaderFooterLayout } from '../HeaderFooterLayout/HeaderFooterLayout';
import { ResponsiveSurface } from '../ResponsiveSurface/ResponsiveSurface';
import { ThreeColumnLayout } from '../ThreeColumnLayout/ThreeColumnLayout';
import styles from './RootLayout.module.css';

export type RootLayoutVariant = 'plain' | 'sidebar' | 'header' | 'shell';

export interface RootLayoutProps {
  /**
   * Which chrome shape this page uses. Children are positional and their
   * count is fixed per variant:
   *  - `'plain'` — 1 child: `[main]`. No chrome on either breakpoint.
   *  - `'sidebar'` — 2 children: `[sidebar, main]`. Sidebar + main on web
   *    only — on mobile, sidebar is dropped and only main renders.
   *  - `'header'` — 2 children: `[header, main]`. Header + main on both
   *    breakpoints — same structure, but the header's own height differs
   *    per breakpoint (`headerHeight` on web, `mobileHeaderHeight` on
   *    mobile), matching how real `shell: minimal` plugins actually do
   *    this (a compact web top bar vs. the platform's mobile chrome
   *    height).
   *  - `'shell'` — 3 children: `[header, main, footer]`. Header + main +
   *    footer on mobile only — on web, header/footer are dropped and only
   *    main renders.
   * Default `'plain'`.
   */
  variant?: RootLayoutVariant;
  children: ReactNode;
  /** px. Default 64 — matches the platform's own persistent nav rail
   *  (`--sv-shell-sidebar-width`, runtime/app/(platform)/shell.module.css).
   *  Only used by `'sidebar'`. */
  sidebarWidth?: number;
  /** px. Default 48 — matches a real `shell: minimal` plugin's own compact
   *  web header (e.g. Kanban's `KanbanHeader`, deliberately not the
   *  platform's 60px shell header since a `shell: minimal` plugin owns its
   *  whole viewport). Web only — used by `'header'` on web. */
  headerHeight?: number;
  /** px. Default 60 — matches the platform's own mobile chrome
   *  (`--sv-shell-header-height`, `MobileHeader`'s default). Mobile only —
   *  used by `'header'` and `'shell'` on mobile. */
  mobileHeaderHeight?: number;
  /** px. Default 60 — matches the platform's own mobile chrome
   *  (`--sv-shell-footer-height`, `MobileFooter`'s default). Mobile only —
   *  used by `'shell'`. */
  footerHeight?: number;
  className?: string;
}

const EXPECTED_CHILD_COUNT: Record<RootLayoutVariant, number> = {
  plain: 1,
  sidebar: 2,
  header: 2,
  shell: 3,
};

interface RootLayoutWebProps {
  variant: RootLayoutVariant;
  items: ReactNode[];
  sidebarWidth: number;
  headerHeight: number;
}

// internal — not exported
function RootLayoutWeb({ variant, items, sidebarWidth, headerHeight }: RootLayoutWebProps) {
  if (variant === 'sidebar') {
    const [sidebar, main] = items;
    return (
      <ThreeColumnLayout sidebarWidth={sidebarWidth}>
        {sidebar}
        {main}
      </ThreeColumnLayout>
    );
  }
  if (variant === 'header') {
    const [header, main] = items;
    return (
      <HeaderFooterLayout header={header} headerHeight={headerHeight}>
        {main}
      </HeaderFooterLayout>
    );
  }
  // 'plain' and 'shell' both render plain on web — shell's chrome is mobile-only.
  const main = variant === 'shell' ? items[1] : items[0];
  return <>{main}</>;
}

interface RootLayoutMobileProps {
  variant: RootLayoutVariant;
  items: ReactNode[];
  mobileHeaderHeight: number;
  footerHeight: number;
}

// internal — not exported
function RootLayoutMobile({
  variant,
  items,
  mobileHeaderHeight,
  footerHeight,
}: RootLayoutMobileProps) {
  if (variant === 'header') {
    const [header, main] = items;
    return (
      <HeaderFooterLayout header={header} headerHeight={mobileHeaderHeight}>
        {main}
      </HeaderFooterLayout>
    );
  }
  if (variant === 'shell') {
    const [header, main, footer] = items;
    return (
      <HeaderFooterLayout
        header={header}
        footer={footer}
        headerHeight={mobileHeaderHeight}
        footerHeight={footerHeight}
      >
        {main}
      </HeaderFooterLayout>
    );
  }
  // 'plain' and 'sidebar' both render plain on mobile — sidebar's chrome is web-only.
  const main = variant === 'sidebar' ? items[1] : items[0];
  return <>{main}</>;
}

/**
 * RootLayout — the root-level layout a plugin's page tree sits in. Enforces
 * only structure and dimensions (`width: 100%; height: 100%`, filling
 * whatever real height the platform shell's own ancestor chain already
 * establishes — not viewport units, since a plugin isn't alone on the
 * page). A definite height, not min-height: ThreeColumnLayout/
 * HeaderFooterLayout's own .shell need one to resolve their own height:
 * 100% against (see RootLayout.module.css's comment). All content comes
 * from children; RootLayout has no opinion on what's inside any region.
 *
 * The web/mobile fork is `ResponsiveSurface` — only one of
 * `RootLayoutWeb`/`RootLayoutMobile` is ever mounted, never a CSS squeeze of
 * the same tree. Each variant's actual shape is delegated entirely to
 * `ThreeColumnLayout`/`HeaderFooterLayout`; RootLayout itself contains no
 * media queries.
 */
export function RootLayout({
  variant = 'plain',
  children,
  sidebarWidth = 64,
  headerHeight = 48,
  mobileHeaderHeight = 60,
  footerHeight = 60,
  className,
}: RootLayoutProps) {
  const items = Children.toArray(children);

  if (process.env.NODE_ENV !== 'production' && items.length !== EXPECTED_CHILD_COUNT[variant]) {
    console.warn(
      `[RootLayout] variant="${variant}" expects ${EXPECTED_CHILD_COUNT[variant]} children; received ${items.length}.`,
    );
  }

  return (
    <div className={[styles.root, className].filter(Boolean).join(' ')}>
      <ResponsiveSurface
        web={
          <RootLayoutWeb
            variant={variant}
            items={items}
            sidebarWidth={sidebarWidth}
            headerHeight={headerHeight}
          />
        }
        mobile={
          <RootLayoutMobile
            variant={variant}
            items={items}
            mobileHeaderHeight={mobileHeaderHeight}
            footerHeight={footerHeight}
          />
        }
      />
    </div>
  );
}
