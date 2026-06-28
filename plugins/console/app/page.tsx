import Link from 'next/link';
import { redirect } from 'next/navigation';
import styles from './console.module.css';

const VALID_TABS = new Set(['users', 'plugins', 'settings', 'health', 'activity', 'identity']);

/**
 * Console home — an overview that links to each management area. Accepts a
 * `?tab=` param and redirects to the matching sub-page. Going through the root
 * first ensures the `(.)console` intercepting-route layout is initialised in
 * the client router tree before navigating to the sub-page — a direct soft-nav
 * to `/console/plugins` cold-starts the intercepting route and can fail in
 * Next.js 15 App Router.
 */
const areas = [
  {
    href: '/console/users',
    title: 'Users',
    description: 'Invite people, change roles, deactivate accounts.',
  },
  {
    href: '/console/plugins',
    title: 'Plugins',
    description: 'View installed plugins and enable or disable them.',
  },
  {
    href: '/console/settings',
    title: 'Settings',
    description: 'Tenant name, invite-only registration, and the root plugin.',
  },
  {
    href: '/console/health',
    title: 'Health',
    description: 'Runtime version, database status, and system diagnostics.',
  },
];

export default async function ConsoleHome({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  if (tab && VALID_TABS.has(tab)) {
    redirect(`/console/${tab}`);
  }
  return (
    <div>
      <p className={styles.lede}>
        Administer the platform — manage users, control installed plugins, and review system health.
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
