'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { NavList, OfflineGate, PageContainer, useOverlaySecondRow } from '@sovereignfs/ui';
import type { NavListGroup } from '@sovereignfs/ui';
import styles from './account.module.css';
import { ActiveNavLink } from './_components/ActiveNavLink';

const SECTIONS = [
  { id: 'profile', label: 'Profile', href: '/account/profile', icon: 'user' },
  { id: 'security', label: 'Security', href: '/account/security', icon: 'shield' },
  {
    id: 'preferences',
    label: 'Preferences',
    href: '/account/preferences',
    icon: 'sliders-horizontal',
  },
  { id: 'notifications', label: 'Notifications', href: '/account/notifications', icon: 'bell' },
  { id: 'billing', label: 'Billing', href: '/account/billing', icon: 'credit-card' },
  { id: 'data', label: 'Data', href: '/account/data', icon: 'lock' },
  { id: 'activity', label: 'Activity', href: '/account/activity', icon: 'activity' },
] as const;

function isSectionActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function AccountLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  const tabStrip = (
    <nav className={styles.tabs} aria-label="Account sections">
      {SECTIONS.map((section) => (
        <ActiveNavLink
          key={section.href}
          href={section.href}
          className={styles.tab}
          activeClassName={`${styles.tab} ${styles.tabActive}`}
        >
          {section.label}
        </ActiveNavLink>
      ))}
    </nav>
  );

  // Hands the tab strip up to the enclosing Dialog's mobile OverlayHeader
  // (soft-navigated overlay case) — a no-op, returning false, on the
  // standalone hard-navigation route, which has no Dialog ancestor and must
  // keep rendering its own header below at every width.
  const insideOverlay = useOverlaySecondRow(tabStrip);

  const navGroups: NavListGroup[] = [
    {
      id: 'account',
      items: SECTIONS.map((section) => ({
        id: section.id,
        label: section.label,
        href: section.href,
        icon: section.icon,
        active: isSectionActive(pathname, section.href),
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
          not JS-forked, so useOverlaySecondRow above always has the tab strip
          to hand up to the Dialog's mobile OverlayHeader regardless of the
          viewport NavList would otherwise show at. */}
      <header
        className={[styles.mobileHeader, insideOverlay ? styles.headerHiddenOnMobile : '']
          .filter(Boolean)
          .join(' ')}
      >
        <h1 className={styles.title}>Account</h1>
        {tabStrip}
      </header>

      {/* Desktop only — vertical rail nav (epic task 14.5, re-derived from
          RFC 0085). Renders identically inside the Dialog overlay and on the
          standalone hard-navigation route, since this split is purely
          viewport-width-driven (account.module.css), not overlay-context-
          driven. Mobile keeps the horizontal strip above, unchanged. */}
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
