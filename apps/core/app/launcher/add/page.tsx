import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { AppTile, CardTileGrid, Icon, PageContainer } from '@sovereignfs/ui';
import { getSession } from '../../../src/auth/session';
import { can } from '../../../src/roles/capabilities';
import { getCapabilityMatrix } from '../../../src/roles/matrix';
import { AccountHeader } from '../../account-header';
import styles from '../../page.module.css';

export const metadata: Metadata = { title: 'Add' };

/**
 * What the launcher's "Add" tile leads an operator to (core-app §3.8.1): a shortcut of their own, a shortcut for
 * everyone, or an app that signs people in. Someone who may not add for everyone goes from the tile straight to a
 * shortcut of their own, so this page is for those who may (`client:manage`) and is not there for anyone else.
 */
export default async function AddPage() {
  const session = await getSession();
  if (!session) redirect('/sign-in?returnTo=%2Flauncher%2Fadd');
  const matrix = await getCapabilityMatrix();
  if (
    !can(session.user.role, 'launcher:access', matrix) ||
    !can(session.user.role, 'client:manage', matrix)
  ) {
    notFound();
  }

  return (
    <PageContainer maxWidth="lg">
      <div className={styles.page}>
        <AccountHeader />
        <div>
          <Link href="/" className={styles.back}>
            <Icon name="chevron-left" size="sm" aria-hidden={true} />
            Apps
          </Link>
        </div>
        <h1 className={styles.title}>What do you want to add?</h1>
        <CardTileGrid minTileWidth={260}>
          <AppTile
            href="/shortcuts/new"
            name="A shortcut for you"
            description="A site you open from your launcher. Only you see it."
            icon={<Icon name="link" size="lg" aria-hidden={true} />}
          />
          <AppTile
            href="/console/apps/shortcuts/new"
            name="A shortcut for everyone"
            description="A site everyone who uses the launcher sees."
            icon={<Icon name="users" size="lg" aria-hidden={true} />}
          />
          <AppTile
            href="/console/apps/new"
            name="An app that signs in here"
            description="An app that signs people in with this instance."
            icon={<Icon name="layout-grid" size="lg" aria-hidden={true} />}
          />
        </CardTileGrid>
      </div>
    </PageContainer>
  );
}
