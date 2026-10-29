'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { NavTabs } from '@sovereignfs/ui';

/** The identity pages that exist. A page is added here when it does, never before. */
const PAGES = [
  { label: 'Profile', href: '/profile' },
  { label: 'Security', href: '/security' },
  { label: 'Preferences', href: '/preferences' },
  { label: 'Connected apps', href: '/connected-apps' },
];

export function IdentityNav() {
  const pathname = usePathname();
  return (
    <NavTabs
      aria-label="Your account"
      items={PAGES.map((page) => ({
        ...page,
        active: pathname === page.href || pathname.startsWith(`${page.href}/`),
      }))}
      renderLink={(item, props) => <Link {...props}>{item.label}</Link>}
    />
  );
}
