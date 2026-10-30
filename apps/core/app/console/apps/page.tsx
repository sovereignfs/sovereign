import type { Metadata } from 'next';
import Link from 'next/link';
import { headers } from 'next/headers';
import {
  ButtonLink,
  EmptyState,
  StatusBadge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from '@sovereignfs/ui';
import { getClientRegistry } from '../../../src/clients';
import { requireConsole } from '../../../src/console/guard';
import { formatTime } from '../accounts/format';
import styles from './apps.module.css';

export const metadata: Metadata = { title: 'Apps' };

function AddAppLink() {
  return (
    <ButtonLink href="/console/apps/new" renderLink={(props) => <Link {...props} />}>
      Add an app
    </ButtonLink>
  );
}

export default async function AppsPage() {
  const { session } = await requireConsole('client:manage', { returnTo: '/console/apps' });
  const registry = await getClientRegistry();
  const actor = { user: session.user, headers: await headers() };
  const apps = await registry.list(actor);
  const managed = await registry.managedClientIds(actor);

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.heading}>Apps</h1>
        <AddAppLink />
      </div>
      <p className={styles.lead}>
        The apps people can sign in to with this instance. Add one here, then give the app its
        details so it can sign people in through you.
      </p>
      {apps.length === 0 ? (
        <EmptyState
          icon="layout-grid"
          heading="No apps yet"
          description="When you add an app, it is listed here, and appears in the launcher for the people who can use it."
          action={<AddAppLink />}
        />
      ) : (
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>Name</TableHeaderCell>
              <TableHeaderCell>Status</TableHeaderCell>
              <TableHeaderCell>In the launcher</TableHeaderCell>
              <TableHeaderCell>Added</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {apps.map((app) => (
              <TableRow key={app.clientId}>
                <TableCell>
                  <Link className={styles.name} href={`/console/apps/${app.clientId}`}>
                    {app.name}
                  </Link>
                  {managed.has(app.clientId) ? (
                    <span className={styles.muted}> · managed from the command line</span>
                  ) : null}
                </TableCell>
                <TableCell>
                  {app.enabled ? (
                    <StatusBadge status="synced">On</StatusBadge>
                  ) : (
                    <StatusBadge status="warning">Switched off</StatusBadge>
                  )}
                </TableCell>
                <TableCell>
                  <span className={styles.muted}>
                    {app.enabled && app.launcher.show && app.launcher.launchUrl ? 'Yes' : 'No'}
                  </span>
                </TableCell>
                <TableCell>
                  <span className={styles.muted}>
                    {app.createdAt ? formatTime(app.createdAt.getTime()) : ''}
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
