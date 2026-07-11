'use client';

import type { ReactNode } from 'react';
import { useOverlaySecondRow } from '@sovereignfs/ui';
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
    <div className={styles.account}>
      <header
        className={[styles.header, insideOverlay ? styles.headerHiddenOnMobile : '']
          .filter(Boolean)
          .join(' ')}
      >
        <h1 className={styles.title}>Account</h1>
        {tabStrip}
      </header>
      <div className={styles.body}>{children}</div>
    </div>
  );
}
