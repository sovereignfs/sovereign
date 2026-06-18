import type { ReactNode } from 'react';
import Link from 'next/link';
import styles from './console.module.css';

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
  { href: '/console/plugins', label: 'Plugins' },
  { href: '/console/settings', label: 'Settings' },
  { href: '/console/health', label: 'Health' },
  { href: '/console/activity', label: 'Activity' },
];

export default function ConsoleLayout({ children }: { children: ReactNode }) {
  return (
    <div className={styles.console}>
      <header className={styles.header}>
        <h1 className={styles.title}>Console</h1>
        <nav className={styles.nav} aria-label="Console sections">
          {sections.map((section) => (
            // `replace` (not push) so switching sections inside the overlay
            // dialog doesn't stack history entries — closing then dismisses in
            // one step.
            <Link key={section.href} href={section.href} replace className={styles.navLink}>
              {section.label}
            </Link>
          ))}
        </nav>
      </header>
      <div className={styles.body}>{children}</div>
    </div>
  );
}
