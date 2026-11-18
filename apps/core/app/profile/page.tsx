import type { Metadata } from 'next';
import { Card } from '@sovereignfs/ui';
import { requireSignedIn } from '../../src/auth/require-signed-in';
import styles from '../security/security.module.css';
import { ProfilePanel } from './profile-panel';

export const metadata: Metadata = { title: 'Profile' };

export default async function ProfilePage() {
  // The proxy turns away a request with no session cookie; this is the check that counts.
  const session = await requireSignedIn('/profile');

  return (
    <Card padding="lg">
      <div className={styles.content}>
        <h1 className={styles.title}>Profile</h1>
        <ProfilePanel
          name={session.user.name}
          email={session.user.email}
          image={session.user.image ?? null}
        />
      </div>
    </Card>
  );
}
