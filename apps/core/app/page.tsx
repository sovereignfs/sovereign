import { redirect } from 'next/navigation';
import { PageContainer, Typography } from '@sovereignfs/ui';
import { AccountHeader } from './account-header';
import { getSession } from '../src/auth/session';
import { getLauncherApps } from '../src/clients';
import { getShortcutManager } from '../src/shortcuts';
import { formatInstanceDetails, instanceDetails } from '../src/instance/about';
import { can } from '../src/roles/capabilities';
import { getCapabilityMatrix } from '../src/roles/matrix';
import { Launcher } from './launcher';
import styles from './page.module.css';

/**
 * Core's `/` (core-app §3.8): for a signed-in person who may use the launcher, the apps and shortcuts they can open; for
 * anyone else, only the way to their own account. The proxy turns away a request with no session cookie; the
 * check that counts is this one. Someone who may open the Console also has, at the foot, what this instance runs.
 */
export default async function Page() {
  const session = await getSession();
  if (!session) redirect('/sign-in');
  const matrix = await getCapabilityMatrix();
  const launcher = can(session.user.role, 'launcher:access', matrix);
  const canAddApps = can(session.user.role, 'client:manage', matrix);
  const canOpenConsole = can(session.user.role, 'console:access', matrix);
  const apps = launcher ? await getLauncherApps() : [];
  // Those for everyone and the person's own, by the session's id: never anyone else's.
  const shortcuts = launcher
    ? (await (await getShortcutManager()).forLauncher(session.user.id)).map((shortcut) => ({
        id: shortcut.id,
        name: shortcut.name,
        description: shortcut.description,
        url: shortcut.url,
        icon: shortcut.icon,
        own: shortcut.ownerId === session.user.id,
      }))
    : [];

  return (
    <PageContainer maxWidth="lg">
      <div className={styles.page}>
        <AccountHeader />

        {launcher ? (
          <Launcher
            apps={apps}
            shortcuts={shortcuts}
            canAddApps={canAddApps}
            canOpenConsole={canOpenConsole}
            title="Apps"
            subtitle="Choose an app to open it."
          />
        ) : (
          <>
            <h1 className={styles.title}>Apps</h1>
            <p className={styles.text}>You do not have access to the apps on this instance.</p>
          </>
        )}

        {canOpenConsole ? (
          <Typography variant="caption" as="p" className={styles.details}>
            {formatInstanceDetails(instanceDetails())}
          </Typography>
        ) : null}
      </div>
    </PageContainer>
  );
}
