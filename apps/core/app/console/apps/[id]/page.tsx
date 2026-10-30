import type { Metadata } from 'next';
import Link from 'next/link';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { CopyButton, StatusBadge } from '@sovereignfs/ui';
import { ClientRegistryError, getClientRegistry } from '../../../../src/clients';
import { requireConsole } from '../../../../src/console/guard';
import { formatTime } from '../../accounts/format';
import { AppForm } from '../app-form';
import styles from '../apps.module.css';
import { AppActions } from './app-actions';

export const metadata: Metadata = { title: 'App' };

export default async function AppPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { session } = await requireConsole('client:manage', { returnTo: `/console/apps/${id}` });
  const registry = await getClientRegistry();
  const actor = { user: session.user, headers: await headers() };
  const [app, managedIds] = await Promise.all([
    registry.get(actor, id).catch((error: unknown) => {
      if (error instanceof ClientRegistryError && error.code === 'not-found') notFound();
      throw error;
    }),
    registry.managedClientIds(actor),
  ]);
  const managed = managedIds.has(id);

  return (
    <div className={styles.page}>
      <Link className={styles.back} href="/console/apps">
        ‹ Apps
      </Link>
      <div className={styles.titleRow}>
        <h1 className={styles.heading}>{app.name}</h1>
        {app.enabled ? (
          <StatusBadge status="synced">On</StatusBadge>
        ) : (
          <StatusBadge status="warning">Switched off</StatusBadge>
        )}
      </div>
      {managed ? (
        <p className={styles.lead}>
          This app is managed from the command line. A change made here is overwritten the next time
          it is deployed. Deleting it works, and the next deployment makes a new one with a new
          secret.
        </p>
      ) : null}
      <dl className={styles.facts}>
        <dt>Client ID</dt>
        <dd>
          <span className={styles.secret}>
            <code className={styles.code}>{app.clientId}</code>
            <CopyButton text={app.clientId} label="Copy" />
          </span>
        </dd>
        <dt>Kind</dt>
        <dd>
          {app.type === 'confidential'
            ? 'Keeps a secret on its own server'
            : 'Runs in the browser or on a device, with no secret'}
        </dd>
        {app.createdAt ? (
          <>
            <dt>Added</dt>
            <dd>{formatTime(app.createdAt.getTime())}</dd>
          </>
        ) : null}
      </dl>
      <AppActions
        id={app.clientId}
        name={app.name}
        enabled={app.enabled}
        confidential={app.type === 'confidential'}
      />
      <h2 className={styles.subheading}>Settings</h2>
      <AppForm id={app.clientId} initial={app} />
    </div>
  );
}
