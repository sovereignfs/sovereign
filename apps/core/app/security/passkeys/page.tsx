import type { Metadata } from 'next';
import Link from 'next/link';
import { headers } from 'next/headers';
import { Card } from '@sovereignfs/ui';
import { getAuth, getAuthSettings } from '../../../src/auth';
import { getDatabase } from '../../../src/database';
import { KeyVault } from '../../../src/keys/vault';
import { requireSignedIn } from '../../../src/auth/require-signed-in';
import styles from '../security.module.css';
import { PasskeyPanel, type PasskeyRow } from './passkey-panel';

export const metadata: Metadata = { title: 'Passkeys' };

export default async function PasskeysPage() {
  // The proxy turns away a request with no session cookie; this is the check that counts.
  const session = await requireSignedIn('/security/passkeys');
  const found = await (await getAuth()).api.listPasskeys({ headers: await headers() });
  // Which passkeys unlock (core-app §5.5): those with a way into the person's keys. The session's own account, never another.
  const vault = await new KeyVault(await getDatabase()).read(session.user.id);
  const unlocking = new Set(
    vault.waysIn.filter((wayIn) => wayIn.way === 'passkey').map((wayIn) => wayIn.id),
  );
  const passkeys: PasskeyRow[] = found.map((passkey) => ({
    id: passkey.id,
    credentialId: passkey.credentialID,
    name: passkey.name ?? null,
    createdAt: passkey.createdAt ? new Date(passkey.createdAt).toISOString() : null,
    synced: passkey.backedUp,
    unlocks: unlocking.has(passkey.credentialID),
  }));

  return (
    <Card padding="lg">
      <div className={styles.content}>
        <h1 className={styles.title}>Passkeys</h1>
        <p className={styles.text}>
          A passkey lets you sign in with your fingerprint, face or device PIN instead of a
          password. Your password keeps working whatever you do here.
        </p>
        <PasskeyPanel
          passkeys={passkeys}
          timeZone={session.user.timezone}
          keys={
            vault.account
              ? { rpId: getAuthSettings().webauthn.rpId, email: session.user.email }
              : undefined
          }
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
