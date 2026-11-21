import { currentLock, getSession } from '../src/auth/session';
import { getInstanceIdentity } from '../src/instance/service';
import { getNotificationService } from '../src/notifications';
import { AccountMenu } from './account-menu';
import { NotificationsBell } from './notifications-bell';
import styles from './account-header.module.css';
import { BrandMark } from './brand-mark';
import { LockWatcher } from './lock-watcher';

/**
 * The bar every signed-in page has: the instance's mark and name on the left, which lead home, and on the right
 * the person's avatar, whose menu holds their account and sign out. The mark leads home, where an operator finds
 * the Console's tile, so none of the apps, the account pages or the Console is a dead end. Nothing is drawn for
 * someone who is not signed in; the page's own guard decides what they see instead.
 */
export async function AccountHeader({ bordered = false }: { bordered?: boolean }) {
  const session = await getSession();
  if (!session) return null;
  const identity = await getInstanceIdentity();
  // The bell is there when an app can write to this person or has: an instance whose apps send nothing does not clutter the bar.
  const notifications = await getNotificationService();
  const hasNotifications =
    (await notifications.apps(session.user.id)).length > 0 ||
    (await notifications.list(session.user.id, { limit: 1 })).length > 0;
  // This device's lock, for the watcher on every signed-in page (RFC 0006 B2); none, and there is no watcher.
  const { lock } = await currentLock(session);

  return (
    <header className={bordered ? `${styles.header} ${styles.bordered}` : styles.header}>
      {/* A document load, not next/link: only the launcher's own policy shows app icons from other sites. */}
      <a href="/" className={styles.brand}>
        <BrandMark size="sm" />
        <span className={styles.brandName}>{identity.name}</span>
      </a>
      {lock ? <LockWatcher idleSeconds={lock.idleSeconds} onLeave={lock.onLeave} /> : null}
      <div className={styles.actions}>
        {hasNotifications ? <NotificationsBell /> : null}
        <AccountMenu
          name={session.user.name}
          email={session.user.email}
          avatarUrl={session.user.image ?? undefined}
        />
      </div>
    </header>
  );
}
