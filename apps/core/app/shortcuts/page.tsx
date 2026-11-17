import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ButtonLink, Card, EmptyState } from '@sovereignfs/ui';
import { sessionFor } from '../../src/files/session';
import { getShortcutManager, MAX_OWN_SHORTCUTS } from '../../src/shortcuts';
import security from '../security/security.module.css';
import { ShortcutIcon } from './shortcut-icon';
import styles from './shortcuts.module.css';

export const metadata: Metadata = { title: 'Shortcuts' };

function AddLink() {
  return (
    <ButtonLink href="/shortcuts/new" renderLink={(props) => <Link {...props} />}>
      Add a shortcut
    </ButtonLink>
  );
}

/**
 * A person's own launcher shortcuts (core-app §3.8.1): sites they open from the launcher, seen by nobody else. The
 * list is the session's own, never one named in the request.
 */
export default async function ShortcutsPage() {
  // The proxy turns away a request with no session cookie; this is the check that counts.
  const { session, allowed } = await sessionFor('launcher:access');
  if (!session) redirect('/sign-in?returnTo=%2Fshortcuts');
  if (!allowed) {
    return (
      <Card padding="lg">
        <div className={security.content}>
          <h1 className={security.title}>Shortcuts</h1>
          <p className={security.text}>
            The launcher is not turned on for your account. Ask whoever runs this instance.
          </p>
        </div>
      </Card>
    );
  }
  const shortcuts = await (await getShortcutManager()).list(session.user, 'own');

  return (
    <Card padding="lg">
      <div className={security.content}>
        <div className={styles.header}>
          <h1 className={security.title}>Shortcuts</h1>
          {shortcuts.length > 0 ? <AddLink /> : null}
        </div>
        <p className={security.text}>
          Sites you open from the launcher, in a new tab. Only you see these; the people who run
          this instance can add shortcuts for everyone. You can keep up to {MAX_OWN_SHORTCUTS}.
        </p>
        {shortcuts.length === 0 ? (
          <EmptyState
            icon="link"
            heading="No shortcuts yet"
            description="Add a site you use, like your mail or your files somewhere else, and it appears on your launcher."
            action={<AddLink />}
          />
        ) : (
          <ul className={styles.list}>
            {shortcuts.map((shortcut) => (
              <li key={shortcut.id} className={styles.item}>
                <span className={styles.itemIcon} aria-hidden="true">
                  <ShortcutIcon shortcut={shortcut} />
                </span>
                <span className={styles.itemText}>
                  <span className={styles.itemName}>{shortcut.name}</span>
                  <span className={styles.itemUrl}>{shortcut.url}</span>
                </span>
                <ButtonLink
                  href={`/shortcuts/${shortcut.id}`}
                  variant="secondary"
                  size="sm"
                  renderLink={(props) => <Link {...props} />}
                >
                  Edit
                </ButtonLink>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
