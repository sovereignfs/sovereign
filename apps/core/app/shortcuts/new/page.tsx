import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Card } from '@sovereignfs/ui';
import { sessionFor } from '../../../src/files/session';
import security from '../../security/security.module.css';
import { createOwnShortcutAction } from '../actions';
import { ShortcutForm } from '../shortcut-form';

export const metadata: Metadata = { title: 'Add a shortcut' };

export default async function NewShortcutPage() {
  const { allowed } = await sessionFor('launcher:access', '/shortcuts/new');
  if (!allowed) notFound();
  return (
    <Card padding="lg">
      <div className={security.content}>
        <h1 className={security.title}>Add a shortcut</h1>
        <p className={security.text}>A site you open from your launcher. Only you see it.</p>
        <ShortcutForm action={createOwnShortcutAction} cancelHref="/shortcuts" tag="yours" />
      </div>
    </Card>
  );
}
