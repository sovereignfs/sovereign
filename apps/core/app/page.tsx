import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Card, PageContainer, StatusBadge } from '@sovereignfs/ui';
import { getSession } from '../src/auth/session';
import { can } from '../src/roles/capabilities';
import { getCapabilityMatrix } from '../src/roles/matrix';
import styles from './page.module.css';
import { SignOutButton } from './sign-out-button';

export default async function Page() {
  // The proxy turns away a request with no session cookie; this is the check that counts.
  const session = await getSession();
  if (!session) redirect('/sign-in');
  const operator = can(session.user.role, 'console:access', await getCapabilityMatrix());

  return (
    <PageContainer maxWidth="sm">
      <Card padding="lg">
        <div className={styles.content}>
          <h1 className={styles.title}>Sovereign Core</h1>
          <p className={styles.text}>
            You are signed in as {session.user.name} ({session.user.email}). The Console and the app
            launcher arrive in later releases.
          </p>
          <div>
            <StatusBadge status="synced">Running</StatusBadge>
          </div>
          <div>
            <Link className={styles.link} href="/profile">
              Profile
            </Link>
          </div>
          <div>
            <Link className={styles.link} href="/security">
              Security
            </Link>
          </div>
          <div>
            <Link className={styles.link} href="/preferences">
              Preferences
            </Link>
          </div>
          {operator ? (
            <div>
              <Link className={styles.link} href="/console">
                Console
              </Link>
            </div>
          ) : null}
          <div>
            <SignOutButton />
          </div>
        </div>
      </Card>
    </PageContainer>
  );
}
