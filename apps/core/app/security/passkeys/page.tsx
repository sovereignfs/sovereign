import type { Metadata } from 'next';
import Link from 'next/link';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { Card } from '@sovereignfs/ui';
import { getAuth } from '../../../src/auth';
import { getSession } from '../../../src/auth/session';
import styles from '../security.module.css';
import { PasskeyPanel, type PasskeyRow } from './passkey-panel';

export const metadata: Metadata = { title: 'Passkeys' };

export default async function PasskeysPage() {
  // The proxy turns away a request with no session cookie; this is the check that counts.
  const session = await getSession();
  if (!session) redirect('/sign-in?returnTo=%2Fsecurity%2Fpasskeys');
  const found = await (await getAuth()).api.listPasskeys({ headers: await headers() });
  const passkeys: PasskeyRow[] = found.map((passkey) => ({
    id: passkey.id,
    name: passkey.name ?? null,
    createdAt: passkey.createdAt ? new Date(passkey.createdAt).toISOString() : null,
    synced: passkey.backedUp,
  }));

  return (
    <Card padding="lg">
      <div className={styles.content}>
        <h1 className={styles.title}>Passkeys</h1>
        <p className={styles.text}>
          A passkey lets you sign in with your fingerprint, face or device PIN instead of a
          password. Your password keeps working whatever you do here.
        </p>
        <PasskeyPanel passkeys={passkeys} />
        <p className={styles.footer}>
          <Link className={styles.link} href="/">
            Back
          </Link>
        </p>
      </div>
    </Card>
  );
}
