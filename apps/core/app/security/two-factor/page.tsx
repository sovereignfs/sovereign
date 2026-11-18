import type { Metadata } from 'next';
import Link from 'next/link';
import { Card } from '@sovereignfs/ui';
import { requireSignedIn } from '../../../src/auth/require-signed-in';
import { getSettings, SETTINGS } from '../../../src/settings';
import styles from '../security.module.css';
import { TwoFactorPanel } from './two-factor-panel';

export const metadata: Metadata = { title: 'Two-factor sign-in' };

export default async function TwoFactorSettingsPage() {
  // The proxy turns away a request with no session cookie; this is the check that counts.
  const session = await requireSignedIn('/security/two-factor');
  const name = (await (await getSettings()).value(SETTINGS.instanceName)) ?? 'Sovereign';

  return (
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
          address={session.user.email}
        />
        <p className={styles.footer}>
          <Link className={styles.link} href="/security">
            Back to security
          </Link>
        </p>
      </div>
    </Card>
  );
}
