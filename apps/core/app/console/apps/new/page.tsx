import type { Metadata } from 'next';
import { requireConsole } from '../../../../src/console/guard';
import { AppForm, NEW_APP } from '../app-form';
import styles from '../apps.module.css';

export const metadata: Metadata = { title: 'Add an app' };

export default async function NewAppPage() {
  await requireConsole('client:manage', { returnTo: '/console/apps/new' });

  return (
    <div className={styles.page}>
      <h1 className={styles.heading}>Add an app</h1>
      <p className={styles.lead}>
        Tell core about an app that signs people in with this instance. You get the details to give
        the app when you add it.
      </p>
      <AppForm initial={NEW_APP} />
    </div>
  );
}
