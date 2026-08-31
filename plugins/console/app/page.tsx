'use client';

import Link from 'next/link';
import { NavList, ResponsiveSurface } from '@sovereignfs/ui';
import { CONSOLE_SECTIONS } from './_lib/sections';
import styles from './console.module.css';

const areas = [
  {
    href: '/console/users',
    title: 'Users',
    description: 'Invite people, change roles, deactivate accounts.',
  },
  {
    href: '/console/groups',
    title: 'Groups',
    description: 'Define reusable audiences for app access policies.',
  },
  {
    href: '/console/plugins',
    title: 'Apps',
    description: 'View installed apps and enable or disable them.',
  },
  {
    href: '/console/entitlements',
    title: 'Entitlements',
    description: 'Manage per-app licenses and generate signed entitlement keys.',
  },
  {
    href: '/console/oauth-clients',
    title: 'External clients',
    description: 'Register and manage external OAuth clients for third-party sign-in.',
  },
  {
    href: '/console/settings',
    title: 'Settings',
    description: 'Tenant name, invite-only registration, and the root app.',
  },
  {
    href: '/console/identity',
    title: 'Identity',
    description: 'Instance name, logo, accent colour, and branding.',
  },
  {
    href: '/console/health',
    title: 'Health',
    description: 'Runtime version, database status, and system diagnostics.',
  },
  {
    href: '/console/activity',
    title: 'Activity',
    description: 'Search and review the platform-wide audit log.',
  },
  {
    href: '/console/broadcast',
    title: 'Broadcast',
    description: 'Send an announcement notification to one or more users.',
  },
];

function DesktopDashboard() {
  return (
    <div>
      <p className={styles.lede}>
        Administer the platform — manage users, control installed apps, and review system health.
      </p>
      <ul className={styles.cards}>
        {areas.map((area) => (
          <li key={area.href}>
            <Link href={area.href} className={styles.card}>
              <span className={styles.cardTitle}>{area.title}</span>
              <span className={styles.cardDesc}>{area.description}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Mobile has no persistent sidebar — the bare `/console` route is the
 *  drill-down index itself (see `layout.tsx`'s doc comment). */
function MobileIndex() {
  return (
    <NavList
      groups={CONSOLE_SECTIONS}
      variant="drilldown"
      aria-label="Console sections"
      renderLink={(item, linkProps) => (
        <Link
          href={item.href}
          className={linkProps.className}
          aria-current={linkProps['aria-current']}
        >
          {linkProps.children}
        </Link>
      )}
    />
  );
}

export default function ConsoleHome() {
  return <ResponsiveSurface web={<DesktopDashboard />} mobile={<MobileIndex />} />;
}
