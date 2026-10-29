import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Card, EmptyState } from '@sovereignfs/ui';
import { getSession } from '../../src/auth/session';
import { getDatabase } from '../../src/database';
import { listConnectedApps } from '../../src/oauth/connected';
import styles from '../security/security.module.css';
import { ConnectedAppsList } from './connected-apps-list';

export const metadata: Metadata = { title: 'Connected apps' };

export default async function ConnectedAppsPage() {
  // The proxy turns away a request with no session cookie; this is the check that counts.
  const session = await getSession();
  if (!session) redirect('/sign-in?returnTo=%2Fconnected-apps');
  // The account is the session's, never a name in the request.
  const apps = await listConnectedApps(await getDatabase(), session.user.id);

  return (
    <Card padding="lg">
      <div className={styles.content}>
        <h1 className={styles.title}>Connected apps</h1>
        <p className={styles.text}>
          These apps can use your account because you allowed them. Remove one and it stops working
          for you at once.
        </p>
        {apps.length === 0 ? (
          <EmptyState
            icon="layout-grid"
            heading="No apps have asked you yet"
            description="When an app asks to use your account and you allow it, it is listed here. An app run by whoever manages this instance may sign you in without asking, and is not listed."
          />
        ) : (
          <ConnectedAppsList apps={apps} />
        )}
        <p className={styles.footer}>
          <Link className={styles.link} href="/">
            Back
          </Link>
        </p>
      </div>
    </Card>
  );
}
