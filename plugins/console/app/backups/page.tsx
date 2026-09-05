import { sdk } from '@sovereignfs/sdk';
import { EmptyState } from '@sovereignfs/ui';
import { BackupJobList, type BackupJobView } from './BackupJobList';
import { BackupTriggerForm } from './BackupTriggerForm';
import styles from '../console.module.css';

const RUNTIME_URL = `http://localhost:${process.env.RUNTIME_PORT ?? '3000'}`;

interface BackupJobsResponse {
  jobs: BackupJobView[];
  excludablePlugins: { id: string; name: string }[];
  gitPushAvailable: boolean;
}

async function loadBackupJobs(): Promise<BackupJobsResponse> {
  const adminKey = process.env.SOVEREIGN_ADMIN_KEY ?? '';
  try {
    const res = await fetch(`${RUNTIME_URL}/api/admin/backup-jobs`, {
      headers: { Authorization: `Bearer ${adminKey}` },
      cache: 'no-store',
    });
    if (!res.ok) return { jobs: [], excludablePlugins: [], gitPushAvailable: false };
    return (await res.json()) as BackupJobsResponse;
  } catch {
    return { jobs: [], excludablePlugins: [], gitPushAvailable: false };
  }
}

export default async function BackupsPage() {
  const session = await sdk.auth.getSession();
  const canBackup = sdk.auth.hasCapability(session, 'instance:backup');

  if (!canBackup) {
    return (
      <EmptyState
        heading="Insufficient privileges"
        description="Only an instance owner or admin can trigger or download instance backups."
      />
    );
  }

  const { jobs, excludablePlugins, gitPushAvailable } = await loadBackupJobs();

  return (
    <div className={styles.sections}>
      <section className={styles.section}>
        <h2>Back up this instance</h2>
        <p className={styles.helpText}>
          Snapshots every platform, auth, and plugin table into a single passphrase-encrypted
          archive. Restoring is not yet available from Console — see <code>sv restore</code> on the
          server.
        </p>
        <BackupTriggerForm
          excludablePlugins={excludablePlugins}
          gitPushAvailable={gitPushAvailable}
        />
      </section>

      <section className={styles.section}>
        <h2>Recent backups</h2>
        <BackupJobList initialJobs={jobs} />
      </section>
    </div>
  );
}
