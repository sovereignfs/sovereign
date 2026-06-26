import type { ReactNode } from 'react';
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
  return (
    <div className={styles.account}>
      <header className={styles.header}>
        <h1 className={styles.title}>Account</h1>
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
      </header>
      <div className={styles.body}>{children}</div>
    </div>
  );
}
