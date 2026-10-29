import Link from 'next/link';
import { redirect } from 'next/navigation';
import { PageContainer } from '@sovereignfs/ui';
import { getSession } from '../src/auth/session';
import { getLauncherApps } from '../src/clients';
import { getInstanceIdentity } from '../src/instance/service';
import { can } from '../src/roles/capabilities';
import { getCapabilityMatrix } from '../src/roles/matrix';
import { InstanceLogo } from './instance-logo';
import { Launcher } from './launcher';
import styles from './page.module.css';
import { SignOutButton } from './sign-out-button';

/**
 * Core's `/` (core-app §3.8): for a signed-in person who may use the launcher, the apps they can open; for
 * anyone else, only the way to their own account. The proxy turns away a request with no session cookie; the
 * check that counts is this one.
 */
export default async function Page() {
  const session = await getSession();
  if (!session) redirect('/sign-in');
  const matrix = await getCapabilityMatrix();
  const operator = can(session.user.role, 'console:access', matrix);
  const launcher = can(session.user.role, 'launcher:access', matrix);
  const canAddApps = can(session.user.role, 'client:manage', matrix);
  const [identity, apps] = await Promise.all([
    getInstanceIdentity(),
    launcher ? getLauncherApps() : Promise.resolve([]),
  ]);

  return (
    <PageContainer maxWidth="lg">
      <div className={styles.page}>
        <header className={styles.header}>
          <div className={styles.brand}>
            <InstanceLogo small />
            <span className={styles.brandName}>{identity.name}</span>
          </div>
          <nav className={styles.nav} aria-label="Your account">
            <Link className={styles.link} href="/profile">
              Profile
            </Link>
            <Link className={styles.link} href="/security">
              Security
            </Link>
            <Link className={styles.link} href="/preferences">
              Preferences
            </Link>
            {operator ? (
              <Link className={styles.link} href="/console">
                Console
              </Link>
            ) : null}
            <SignOutButton />
          </nav>
        </header>

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
