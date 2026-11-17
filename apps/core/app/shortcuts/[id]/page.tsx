import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { Card } from '@sovereignfs/ui';
import { sessionFor } from '../../../src/files/session';
import { getShortcutManager } from '../../../src/shortcuts';
import security from '../../security/security.module.css';
import { removeOwnShortcutAction, updateOwnShortcutAction } from '../actions';
import { ShortcutForm } from '../shortcut-form';

export const metadata: Metadata = { title: 'Shortcut' };

/** One of the person's own shortcuts; another person's, or one that does not exist, is a page that is not there. */
export default async function ShortcutPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { session, allowed } = await sessionFor('launcher:access');
  if (!session) redirect(`/sign-in?returnTo=${encodeURIComponent(`/shortcuts/${id}`)}`);
  if (!allowed) notFound();
  const shortcut = await (await getShortcutManager()).get(session.user, 'own', id);
  if (!shortcut) notFound();
  return (
    <Card padding="lg">
      <div className={security.content}>
        <h1 className={security.title}>{shortcut.name}</h1>
        <ShortcutForm
          initial={shortcut}
          action={updateOwnShortcutAction.bind(null, shortcut.id)}
          removeAction={removeOwnShortcutAction.bind(null, shortcut.id)}
          cancelHref="/shortcuts"
          tag="yours"
        />
      </div>
    </Card>
  );
}
