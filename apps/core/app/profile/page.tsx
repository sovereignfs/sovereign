import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Card } from '@sovereignfs/ui';
import { getSession } from '../../src/auth/session';
import styles from '../security/security.module.css';
import { ProfilePanel } from './profile-panel';

export const metadata: Metadata = { title: 'Profile' };

export default async function ProfilePage() {
  // The proxy turns away a request with no session cookie; this is the check that counts.
  const session = await getSession();
  if (!session) redirect('/sign-in?returnTo=%2Fprofile');

  return (
    <Card padding="lg">
      <div className={styles.content}>
        <h1 className={styles.title}>Profile</h1>
        <ProfilePanel
          name={session.user.name}
          email={session.user.email}
          image={session.user.image ?? null}
        />
        <p className={styles.footer}>
          <Link className={styles.link} href="/">
            Back
          </Link>
        </p>
      </div>
    </Card>
  );
}
