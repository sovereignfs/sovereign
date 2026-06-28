import Link from 'next/link';
import styles from './console.module.css';

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

export default function ConsoleHome() {
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
