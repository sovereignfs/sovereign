import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireConsole } from '../../../../../src/console/guard';
import { getShortcutManager } from '../../../../../src/shortcuts';
import { ShortcutForm } from '../../../../shortcuts/shortcut-form';
import styles from '../../apps.module.css';
import { removeSharedShortcutAction, updateSharedShortcutAction } from '../actions';

export const metadata: Metadata = { title: 'Shortcut' };

export default async function SharedShortcutPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { session } = await requireConsole('client:manage', {
    returnTo: `/console/apps/shortcuts/${id}`,
  });
  const shortcut = await (await getShortcutManager()).get(session.user, 'shared', id);
  if (!shortcut) notFound();

  return (
    <div className={styles.page}>
      <h1 className={styles.heading}>{shortcut.name}</h1>
      <p className={styles.lead}>A shortcut everyone sees in the launcher.</p>
      <ShortcutForm
        initial={shortcut}
        action={updateSharedShortcutAction.bind(null, shortcut.id)}
        removeAction={removeSharedShortcutAction.bind(null, shortcut.id)}
        cancelHref="/console/apps"
        tag="shortcut"
      />
    </div>
  );
}
