'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon, NavList, OfflineGate, PageContainer, useOverlaySecondRow } from '@sovereignfs/ui';
import type { NavListGroup } from '@sovereignfs/ui';
import styles from './account.module.css';
import { ACCOUNT_SECTIONS, activeAccountSectionId } from './_lib/sections';

export default function AccountLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isIndex = pathname === '/account';
  const activeId = activeAccountSectionId(pathname);

  const backOrTitle = isIndex ? (
    <h1 className={styles.title}>Account</h1>
  ) : (
    // replace, not push: this Link lives inside an overlay Dialog dismissed
    // via router.back() — push-based navigation would stack history so a
    // single back only returns to the index, not close the dialog
    // (CLAUDE.md's overlay-navigation rule) — same reasoning as the rail's
    // own links below.
    <Link href="/account" replace className={styles.backLink}>
      <Icon name="chevron-left" size="sm" aria-hidden />
      Account
    </Link>
  );

  // Hands the title/back-link up to the enclosing Dialog's mobile
  // OverlayHeader (soft-navigated overlay case) — a no-op, returning false,
  // on the standalone hard-navigation route, which has no Dialog ancestor
  // and must keep rendering its own header below at every width. On the
  // index route this hands up `null`: Dialog's own OverlayHeader already
  // shows "Account" as its row-1 title (from the plugin manifest name), so
  // a second "Account" heading here would just duplicate it.
  const insideOverlay = useOverlaySecondRow(isIndex ? null : backOrTitle);

  const navGroups: NavListGroup[] = [
    {
      id: 'account',
      items: ACCOUNT_SECTIONS.map((section) => ({
        ...section,
        active: section.id === activeId,
      })),
    },
  ];

  return (
    // PageContainer is the plugin's root, not just a wrapper around the body:
    // it supplies this page's four-sided gutter (the runtime shell no longer
    // does — task 9.25), so both the mobile header and the desktop rail have
    // to sit inside it too.
    <PageContainer maxWidth="full" className={styles.account}>
      {/* Mobile only (account.module.css's grid-template-areas swap below) —
          desktop renders the vertical rail instead. Rendered unconditionally,
          not JS-forked, so useOverlaySecondRow above always has backOrTitle
          to hand up to the Dialog's mobile OverlayHeader regardless of the
          viewport NavList would otherwise show at. */}
      <header
        className={[styles.mobileHeader, insideOverlay ? styles.headerHiddenOnMobile : '']
          .filter(Boolean)
          .join(' ')}
      >
        {backOrTitle}
      </header>

      {/* Desktop only — vertical rail nav (epic task 14.5, re-derived from
          RFC 0085). Renders identically inside the Dialog overlay and on the
          standalone hard-navigation route, since this split is purely
          viewport-width-driven (account.module.css), not overlay-context-
          driven. Mobile instead gets the title-or-back-link above plus, at
          the bare index route, a drill-down list (task 14.6, page.tsx). */}
      <div className={styles.rail}>
        <h1 className={styles.railTitle}>Account</h1>
        <NavList
          groups={navGroups}
          variant="static"
          aria-label="Account sections"
          renderLink={(item, linkProps) => (
            // replace, not push: this Link lives inside an overlay Dialog
            // dismissed via router.back() — push-based navigation would stack
            // history so a single back only closes one section, not the
            // dialog (CLAUDE.md's overlay-navigation rule).
            <Link
              href={item.href}
              replace
              className={linkProps.className}
              aria-current={linkProps['aria-current']}
            >
              {linkProps.children}
            </Link>
          )}
        />
      </div>

      <div className={styles.content}>
        {/* Account is the platform's settings surface — security, billing,
            and data pages reflect a point-in-time snapshot with no way to
            signal a cached copy may be stale (research 0012, epic task 2.32).
            Block the body, not the nav, so it's still clear where you are
            while reconnecting. */}
        <OfflineGate surfaceName="Account">{children}</OfflineGate>
      </div>
    </PageContainer>
  );
}
