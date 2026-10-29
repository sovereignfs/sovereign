import type { Metadata } from 'next';
import { requireConsole } from '../../../src/console/guard';
import { getDatabase } from '../../../src/database';
import { describeMatrix } from '../../../src/roles/describe';
import { loadMatrix } from '../../../src/roles/matrix';
import { MatrixEditor } from './matrix-editor';
import styles from './permissions.module.css';

export const metadata: Metadata = { title: 'Permissions' };

export default async function PermissionsPage() {
  await requireConsole('capability:configure', { returnTo: '/console/permissions' });
  // Read from the database, not the cache: this is the table being edited, so it must be what is in force.
  const rows = describeMatrix(await loadMatrix(await getDatabase()));

  return (
    <div className={styles.page}>
      <h1 className={styles.heading}>Permissions</h1>
      <p className={styles.lead}>
        Choose what admins and ordinary users can do. You, as the owner, can always do everything,
        and a few things stay with you alone.
      </p>
      <MatrixEditor rows={rows} />
    </div>
  );
}
