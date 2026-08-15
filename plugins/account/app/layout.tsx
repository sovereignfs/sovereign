'use client';

import type { ReactNode } from 'react';
import { OfflineGate, PageContainer, useOverlaySecondRow } from '@sovereignfs/ui';
import styles from './account.module.css';
import { ActiveNavLink } from './_components/ActiveNavLink';

const tabs = [
  { href: '/account/profile', label: 'Profile' },
  { href: '/account/security', label: 'Security' },
  { href: '/account/preferences', label: 'Preferences' },
  { href: '/account/notifications', label: 'Notifications' },
  { href: '/account/billing', label: 'Billing' },
  { href: '/account/data', label: 'Data' },
  { href: '/account/activity', label: 'Activity' },
];

export default function AccountLayout({ children }: { children: ReactNode }) {
  const tabStrip = (
    <nav className={styles.tabs} aria-label="Account sections">
      {tabs.map((tab) => (
        <ActiveNavLink
          key={tab.href}
          href={tab.href}
          className={styles.tab}
          activeClassName={`${styles.tab} ${styles.tabActive}`}
        >
          {tab.label}
        </ActiveNavLink>
      ))}
    </nav>
  );

  // Hands the tab strip up to the enclosing Dialog's mobile OverlayHeader
  // (soft-navigated overlay case) — a no-op, returning false, on the
  // standalone hard-navigation route, which has no Dialog ancestor and must
  // keep rendering its own header below at every width.
  const insideOverlay = useOverlaySecondRow(tabStrip);

  return (
    // PageContainer is the plugin's root, not just a wrapper around the body:
    // it supplies this page's four-sided gutter (the runtime shell no longer
    // does — task 9.25), so the header has to sit inside it too.
    <PageContainer maxWidth="full" className={styles.account}>
      <header
        className={[styles.header, insideOverlay ? styles.headerHiddenOnMobile : '']
          .filter(Boolean)
          .join(' ')}
      >
        <h1 className={styles.title}>Account</h1>
        {tabStrip}
      </header>
      {/* Plain wrapper, deliberately: OfflineGate renders a fragment while
          online, so without this each page's own children would become
          separate flex items under .account's column gap. */}
      <div>
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
