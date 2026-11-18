import type { Metadata } from 'next';
import Link from 'next/link';
import { Card } from '@sovereignfs/ui';
import { getAuth } from '../../src/auth';
import { requireSignedIn } from '../../src/auth/require-signed-in';
import { getAuthSettings } from '../../src/auth/settings';
import { getDatabase } from '../../src/database';
import { KeyVault } from '../../src/keys/vault';
import { listSessions } from '../../src/sessions/sessions';
import { getSettings, SETTINGS } from '../../src/settings';
import { ChangePasswordForm } from './change-password-form';
import { SessionsPanel } from './sessions-panel';
import styles from './security.module.css';
import { headers } from 'next/headers';

export const metadata: Metadata = { title: 'Security' };

export default async function SecurityPage() {
  // The proxy turns away a request with no session cookie; this is the check that counts.
  const session = await requireSignedIn('/security');
  const [sessions, passkeys, vault, escrowLine] = await Promise.all([
    getDatabase().then((database) => listSessions(database, session.user.id, session.session.id)),
    getAuth().then(async (auth) => auth.api.listPasskeys({ headers: await headers() })),
    getDatabase().then((database) => new KeyVault(database).read(session.user.id)),
    getSettings().then((settings) => settings.value(SETTINGS.escrowPublicKey)),
  ]);
  // Who can open the person's encrypted data (core-app §5.3, §5.8), said only to someone who has some.
  const escrowId = escrowLine?.split('.')[1];
  const covered = vault.waysIn.some((wayIn) => wayIn.way === 'escrow' && wayIn.id === escrowId);

  return (
    <div className={styles.content}>
      <Card padding="lg">
        <div className={styles.content}>
          <h1 className={styles.title}>Security</h1>
          <h2 className={styles.heading}>Password</h2>
          <ChangePasswordForm
            address={session.user.email}
            policy={getAuthSettings().passwordPolicy}
          />
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
      {vault.account ? (
        <Card padding="lg">
          <div className={styles.content}>
            <h2 className={styles.heading}>Encrypted data</h2>
            <p className={styles.text}>
              What apps keep encrypted for you opens with your password, a passkey that unlocks, or
              your recovery kit.
              {vault.account.kitConfirmed
                ? ''
                : ' You’ll be shown your recovery kit the first time you open an app that uses encryption.'}
            </p>
            <p className={styles.text}>
              {escrowId
                ? covered
                  ? 'Recovery is on: the owner of this instance can recover your encrypted data if you lose all of these.'
                  : 'Recovery is on: the next time you open an app that uses encryption, you’ll be told, and from then the owner of this instance can recover your encrypted data.'
                : 'Recovery is off: if you lose your password, your passkeys and your recovery kit, nobody can open your encrypted data, not even the owner of this instance.'}
            </p>
          </div>
        </Card>
      ) : null}
      <Card padding="lg">
        <div className={styles.content}>
          <h2 className={styles.heading}>Where you are signed in</h2>
          <SessionsPanel sessions={sessions} />
        </div>
      </Card>
    </div>
  );
}
