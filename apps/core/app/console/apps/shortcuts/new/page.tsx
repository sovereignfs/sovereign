import type { Metadata } from 'next';
import { requireConsole } from '../../../../../src/console/guard';
import { ShortcutForm } from '../../../../shortcuts/shortcut-form';
import styles from '../../apps.module.css';
import { createSharedShortcutAction } from '../actions';

export const metadata: Metadata = { title: 'Add a shortcut' };

export default async function NewSharedShortcutPage() {
  await requireConsole('client:manage', { returnTo: '/console/apps/shortcuts/new' });

  return (
    <div className={styles.page}>
      <h1 className={styles.heading}>Add a shortcut</h1>
      <p className={styles.lead}>
        A site everyone opens from the launcher, in a new tab. It does not sign anyone in: for an
        app that does, add an app instead.
      </p>
      <ShortcutForm action={createSharedShortcutAction} cancelHref="/console/apps" tag="shortcut" />
    </div>
  );
}
