import { redirect } from 'next/navigation';
import { PageContainer } from '@sovereignfs/ui';
import { AccountHeader } from './account-header';
import { getSession } from '../src/auth/session';
import { getLauncherApps } from '../src/clients';
import { can } from '../src/roles/capabilities';
import { getCapabilityMatrix } from '../src/roles/matrix';
import { Launcher } from './launcher';
import styles from './page.module.css';

/**
 * Core's `/` (core-app §3.8): for a signed-in person who may use the launcher, the apps they can open; for
 * anyone else, only the way to their own account. The proxy turns away a request with no session cookie; the
 * check that counts is this one.
 */
export default async function Page() {
  const session = await getSession();
  if (!session) redirect('/sign-in');
  const matrix = await getCapabilityMatrix();
  const launcher = can(session.user.role, 'launcher:access', matrix);
  const canAddApps = can(session.user.role, 'client:manage', matrix);
  const apps = launcher ? await getLauncherApps() : [];

  return (
    <PageContainer maxWidth="lg">
      <div className={styles.page}>
        <AccountHeader />

        <h1 className={styles.title}>Apps</h1>
        <p className={styles.text}>
          {launcher
            ? `You are signed in as ${session.user.name}. Choose an app to open it.`
            : `You are signed in as ${session.user.name}. You do not have access to the apps on this instance.`}
        </p>
        {launcher ? <Launcher apps={apps} canAddApps={canAddApps} /> : null}
      </div>
    </PageContainer>
  );
}
