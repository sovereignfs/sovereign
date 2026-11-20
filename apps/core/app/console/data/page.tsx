import type { Metadata } from 'next';
import { requireConsole } from '../../../src/console/guard';
import { getInstanceManager } from '../../../src/instance/service';
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
    </div>
  );
}
