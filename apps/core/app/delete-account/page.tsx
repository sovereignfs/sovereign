import type { Metadata } from 'next';
import Link from 'next/link';
import { Alert, Card } from '@sovereignfs/ui';
import { requireSignedIn } from '../../src/auth/require-signed-in';
import { ROLE_OWNER } from '../../src/auth/roles';
import styles from '../security/security.module.css';
import { DeleteForm } from './delete-form';

export const metadata: Metadata = { title: 'Delete account' };

export default async function DeleteAccountPage() {
  // The proxy turns away a request with no session cookie; this is the check that counts.
  const session = await requireSignedIn('/delete-account');
  const owner = session.user.role === ROLE_OWNER;

  return (
    <Card padding="lg">
      <div className={styles.content}>
        <h1 className={styles.title}>Delete account</h1>
        <p className={styles.text}>
          This deletes your account and everything that signs you in: your password, passkeys and
          two-factor sign-in. You are signed out everywhere, and every app you have allowed loses
          what it was given. It cannot be undone, and nobody can restore it.
        </p>
        {owner ? (
          <Alert variant="warning">
            You own this instance, so you cannot delete your account yet. Hand it to another admin
            first. You can do that in the{' '}
            <Link className={styles.link} href="/console/ownership">
              Console
            </Link>
            .
          </Alert>
        ) : (
          <DeleteForm address={session.user.email} />
        )}
      </div>
    </Card>
  );
}
