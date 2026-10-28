import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Card, PageContainer } from '@sovereignfs/ui';
import { getSession } from '../../../src/auth/session';
import { getSettings, SETTINGS } from '../../../src/settings';
import styles from '../security.module.css';
import { TwoFactorPanel } from './two-factor-panel';

export const metadata: Metadata = { title: 'Two-factor sign-in' };

export default async function TwoFactorSettingsPage() {
  // The proxy turns away a request with no session cookie; this is the check that counts.
  const session = await getSession();
  if (!session) redirect('/sign-in?returnTo=%2Fsecurity%2Ftwo-factor');
  const name = (await (await getSettings()).value(SETTINGS.instanceName)) ?? 'Sovereign';

  return (
    <PageContainer maxWidth="sm">
      <Card padding="lg">
        <div className={styles.content}>
          <h1 className={styles.title}>Two-factor sign-in</h1>
          <p className={styles.text}>
            Add a second step to signing in: a code from an authenticator app on your phone, as well
            as your password.
          </p>
          <TwoFactorPanel
            enabled={session.user.twoFactorEnabled === true}
            issuer={name}
            verified={session.user.emailVerified}
          />
          <p className={styles.footer}>
            <Link className={styles.link} href="/">
              Back
            </Link>
          </p>
        </div>
      </Card>
    </PageContainer>
  );
}
