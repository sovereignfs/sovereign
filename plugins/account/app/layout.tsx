import type { ReactNode } from 'react';
import Link from 'next/link';
import styles from './account.module.css';

const tabs = [
  { href: '/account/profile', label: 'Profile' },
  { href: '/account/security', label: 'Security' },
  { href: '/account/preferences', label: 'Preferences' },
];

export default function AccountLayout({ children }: { children: ReactNode }) {
  return (
    <div className={styles.account}>
      <header className={styles.header}>
        <h1 className={styles.title}>Account</h1>
        <nav className={styles.tabs} aria-label="Account sections">
          {tabs.map((tab) => (
            // `replace` (not push) so switching tabs inside the overlay dialog
            // doesn't stack history entries — closing then dismisses in one step.
            <Link key={tab.href} href={tab.href} replace className={styles.tab}>
              {tab.label}
            </Link>
          ))}
        </nav>
      </header>
      <div className={styles.body}>{children}</div>
    </div>
  );
}
