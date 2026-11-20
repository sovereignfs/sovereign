import type { Metadata } from 'next';
import { requireConsole } from '../../../src/console/guard';
import { getInstanceManager } from '../../../src/instance/service';
import { getExportJobs } from '../../../src/exports/service';
import { viewOf } from '@sovereignfs/export';
import { ExportPanel } from '../../export-panel';
import { startInstanceExportAction } from './export-actions';
import styles from './data.module.css';
import { KeysForm } from './keys-form';

export const metadata: Metadata = { title: 'Data' };

/**
 * The owner's export of core's data (core-app §4.7.1): the keys it is encrypted to, and the export itself. The owner's alone
 * (`instance:export`); anyone else gets a page that is not there.
 */
export default async function DataPage() {
  const { session } = await requireConsole('instance:export', { returnTo: '/console/data' });
  const recipients = await (await getInstanceManager()).exportRecipients(session.user);
  const view = viewOf(await (await getExportJobs()).latest('instance'), session.session.id);

  return (
    <div className={styles.page}>
      <h1 className={styles.heading}>Data</h1>
      <p className={styles.lead}>
        Download a copy of everything this instance holds: accounts, apps, settings and people’s
        files. It is a copy to keep, not a backup: restoring the instance is done with sv backup and
        sv restore.
      </p>

      <section className={styles.section} aria-labelledby="keys-heading">
        <h2 id="keys-heading" className={styles.subheading}>
          Encryption
        </h2>
        <KeysForm recipients={recipients} />
      </section>

      <section className={styles.section} aria-labelledby="export-heading">
        <h2 id="export-heading" className={styles.subheading}>
          Export
        </h2>
        <p className={styles.hint}>
          The export holds every account as it is now (with no passwords, passkeys or two-factor
          secrets), the apps, their consents, the settings, notifications, activity, the encrypted
          data people keep, still encrypted, and everyone’s files. It is encrypted to the keys above
          as it is made: the server cannot read it. Open it with sv export open.
        </p>
        <ExportPanel
          view={view}
          address={session.user.email}
          kind="instance"
          action={startInstanceExportAction}
          {...(recipients.length === 0
            ? { disabledReason: 'Save a key above before taking an export.' }
            : {})}
          confirmTitle="Export the instance’s data?"
          confirmMessage="The export holds everyone’s data as it is now. It does not restore the instance: sv backup does. It is ready to download once, within the hour."
          startLabel="Export"
        />
      </section>
    </div>
  );
}
