import type { Metadata } from 'next';
import Link from 'next/link';
import { Icon } from '@sovereignfs/ui';
import { ROLE_OWNER } from '../../src/auth/roles';
import { requireConsole } from '../../src/console/guard';
import styles from './console.module.css';

export const metadata: Metadata = { title: 'Console' };

export default async function ConsolePage() {
  const { session, sections } = await requireConsole();
  const others = sections.filter((section) => section.href !== '/console');
  const role = session.user.role === ROLE_OWNER ? 'the owner' : 'an admin';

  return (
    <div className={styles.page}>
      <h1 className={styles.heading}>Console</h1>
      <p className={styles.lead}>You manage this instance as {role}.</p>
      {others.length > 0 ? (
        <ul className={styles.sections}>
          {others.map((section) => (
            <li key={section.id}>
              <Link href={section.href} className={styles.section}>
                <Icon name={section.icon} size="md" aria-hidden />
                {section.label}
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.lead}>There is nothing to manage here yet.</p>
      )}
    </div>
  );
}
