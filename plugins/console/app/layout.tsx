'use client';

import type { ReactNode } from 'react';
import { useOverlaySecondRow } from '@sovereignfs/ui';
import styles from './console.module.css';
import { ConsoleNavLink } from './_components/ConsoleNavLink';

/**
 * Console shell layout — the plugin's own sub-navigation, nested inside the
 * platform sidebar (the runtime composes this plugin under the `(platform)`
 * route group, so the shell chrome wraps it automatically).
 *
 * The section links below point at routes filled in by later tasks
 * (users → 0.4.02, plugins → 0.4.03, settings/health → 0.4.04).
 */
const sections = [
  { href: '/console', label: 'Overview' },
  { href: '/console/users', label: 'Users' },
  { href: '/console/groups', label: 'Groups' },
  { href: '/console/plugins', label: 'Plugins' },
  { href: '/console/entitlements', label: 'Entitlements' },
  { href: '/console/settings', label: 'Settings' },
  { href: '/console/identity', label: 'Identity' },
  { href: '/console/health', label: 'Health' },
  { href: '/console/activity', label: 'Activity' },
  { href: '/console/broadcast', label: 'Broadcast' },
];

export default function ConsoleLayout({ children }: { children: ReactNode }) {
  const navStrip = (
    <nav className={styles.nav} aria-label="Console sections">
      {sections.map((section) => (
        <ConsoleNavLink
          key={section.href}
          href={section.href}
          className={styles.navLink}
          activeClassName={`${styles.navLink} ${styles.navLinkActive}`}
        >
          {section.label}
        </ConsoleNavLink>
      ))}
    </nav>
  );

  // Hands the section nav up to the enclosing Dialog's mobile OverlayHeader
  // (soft-navigated overlay case) — a no-op, returning false, on the
  // standalone hard-navigation route, which has no Dialog ancestor and must
  // keep rendering its own header below at every width.
  const insideOverlay = useOverlaySecondRow(navStrip);

  return (
    <div className={styles.console}>
      <header
        className={[styles.header, insideOverlay ? styles.headerHiddenOnMobile : '']
          .filter(Boolean)
          .join(' ')}
      >
        <h1 className={styles.title}>Console</h1>
        {navStrip}
      </header>
      <div className={styles.body}>{children}</div>
    </div>
  );
}
