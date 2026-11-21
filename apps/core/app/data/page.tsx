import type { Metadata } from 'next';
import { Card } from '@sovereignfs/ui';
import { requireSignedIn } from '../../src/auth/require-signed-in';
import { getExportJobs } from '../../src/exports/service';
import { viewOf } from '@sovereignfs/export';
import { ExportPanel } from '../export-panel';
import styles from '../security/security.module.css';
import { startPersonExportAction } from './actions';

export const metadata: Metadata = { title: 'Your data' };

/** A person's own export (core-app §4.7.2): everything of theirs, from core and from the apps they use, downloaded once. */
export default async function DataPage() {
  const session = await requireSignedIn('/data');
  const view = viewOf(
    await (await getExportJobs()).latest('person', session.user.id),
    session.session.id,
  );
  return (
    <Card padding="lg">
      <div className={styles.content}>
        <h1 className={styles.title}>Your data</h1>
        <p className={styles.text}>
          Download a copy of everything this instance holds of you: your profile and settings, the
          apps you allowed, your notifications and activity, your files, and what each app you use
          keeps of you, where the app offers it. Data you keep encrypted stays encrypted, and opens
          with your own password or recovery kit. Your password, passkeys and two-factor codes are
          never in it.
        </p>
        <p className={styles.text}>
          The file is not encrypted: anyone who has it can read it. Keep it somewhere safe.
        </p>
        <ExportPanel
          view={view}
          address={session.user.email}
          kind="person"
          timeZone={session.user.timezone}
          action={startPersonExportAction}
          confirmTitle="Download your data?"
          confirmMessage="Your data is gathered from this instance and the apps you use, which can take a few minutes. It is ready to download once, within the hour, from this browser."
          startLabel="Get my data"
        />
      </div>
    </Card>
  );
}
