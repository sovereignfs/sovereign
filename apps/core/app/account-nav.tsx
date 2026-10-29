'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './account-header.module.css';

/** Where the signed-in header leads, and the paths that count as being there. */
const IDENTITY = ['/profile', '/security', '/preferences', '/connected-apps', '/delete-account'];

/** The signed-in header's links, with the one for the page the person is on marked as current. */
export function AccountNav({ operator }: { operator: boolean }) {
  const pathname = usePathname();
  const items = [
    { label: 'Apps', href: '/', current: pathname === '/' },
    {
      label: 'Account',
      href: '/profile',
      current: IDENTITY.some((path) => pathname === path || pathname.startsWith(`${path}/`)),
    },
    ...(operator
      ? [{ label: 'Console', href: '/console', current: pathname.startsWith('/console') }]
      : []),
  ];
  return (
    <nav className={styles.nav} aria-label="Main">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={item.current ? `${styles.link} ${styles.current}` : styles.link}
          aria-current={item.current ? 'page' : undefined}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
