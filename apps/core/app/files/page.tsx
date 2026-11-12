import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Card } from '@sovereignfs/ui';
import { sessionFor } from '../../src/files/session';
import { getFileStore, MAX_UPLOAD_BYTES } from '../../src/files';
import styles from '../security/security.module.css';
import { FilesPanel, type FileRow } from './files-panel';

export const metadata: Metadata = { title: 'Files' };

export default async function FilesPage() {
  // The proxy turns away a request with no session cookie; this is the check that counts.
  const { session, allowed } = await sessionFor('files:manage');
  if (!session) redirect('/sign-in?returnTo=%2Ffiles');
  if (!allowed) {
    return (
      <Card padding="lg">
        <div className={styles.content}>
          <h1 className={styles.title}>Files</h1>
          <p className={styles.text}>
            Keeping files is not turned on for your account. Ask whoever runs this instance.
          </p>
        </div>
      </Card>
    );
  }
  // The files are the session's own, never a name in the request.
  const store = getFileStore();
  const [records, usage] = await Promise.all([
    store.list(session.user.id),
    store.usage(session.user.id),
  ]);
  const rows: FileRow[] = records.map((record) => ({
    id: record.id,
    name: record.name,
    size: record.size,
    type: record.type,
    inline: record.inline,
    createdAt: record.createdAt,
  }));

  return (
    <Card padding="lg">
      <div className={styles.content}>
        <h1 className={styles.title}>Files</h1>
        <p className={styles.text}>
          Files you keep in your account. Only you can open them: not the people who run this
          instance, and not the apps.
        </p>
        <FilesPanel files={rows} usage={usage} maxUploadBytes={MAX_UPLOAD_BYTES} />
      </div>
    </Card>
  );
}
