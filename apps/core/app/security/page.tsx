import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Card } from '@sovereignfs/ui';
import { getAuth } from '../../src/auth';
import { getSession } from '../../src/auth/session';
import { getDatabase } from '../../src/database';
import { listSessions } from '../../src/sessions/sessions';
import { ChangePasswordForm } from './change-password-form';
import { SessionsPanel } from './sessions-panel';
import styles from './security.module.css';
import { headers } from 'next/headers';

export const metadata: Metadata = { title: 'Security' };

export default async function SecurityPage() {
  // The proxy turns away a request with no session cookie; this is the check that counts.
  const session = await getSession();
  if (!session) redirect('/sign-in?returnTo=%2Fsecurity');
  const [sessions, passkeys] = await Promise.all([
    getDatabase().then((database) => listSessions(database, session.user.id, session.session.id)),
    getAuth().then(async (auth) => auth.api.listPasskeys({ headers: await headers() })),
  ]);

  return (
    <div className={styles.content}>
      <Card padding="lg">
        <div className={styles.content}>
          <h1 className={styles.title}>Security</h1>
          <h2 className={styles.heading}>Password</h2>
          <ChangePasswordForm />
        </div>
      </Card>
      <Card padding="lg">
        <div className={styles.content}>
          <h2 className={styles.heading}>Two-factor sign-in</h2>
          <p className={styles.text}>
            {session.user.twoFactorEnabled
              ? 'On. Signing in asks for a code from your authenticator app.'
              : 'Off. Signing in asks only for your password or a passkey.'}
          </p>
          <p className={styles.footer}>
            <Link className={styles.link} href="/security/two-factor">
              {session.user.twoFactorEnabled
                ? 'Manage two-factor sign-in'
                : 'Set up two-factor sign-in'}
            </Link>
          </p>
        </div>
      </Card>
      <Card padding="lg">
        <div className={styles.content}>
          <h2 className={styles.heading}>Passkeys</h2>
          <p className={styles.text}>
            {passkeys.length === 0
              ? 'You have no passkeys.'
              : `You have ${passkeys.length} ${passkeys.length === 1 ? 'passkey' : 'passkeys'}.`}
          </p>
          <p className={styles.footer}>
            <Link className={styles.link} href="/security/passkeys">
              Manage passkeys
            </Link>
          </p>
        </div>
      </Card>
      <Card padding="lg">
        <div className={styles.content}>
          <h2 className={styles.heading}>Where you are signed in</h2>
          <SessionsPanel sessions={sessions} />
        </div>
      </Card>
    </div>
  );
}
