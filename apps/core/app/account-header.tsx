import Link from 'next/link';
import { getSession } from '../src/auth/session';
import { getInstanceIdentity } from '../src/instance/service';
import { can } from '../src/roles/capabilities';
import { getCapabilityMatrix } from '../src/roles/matrix';
import { AccountMenu } from './account-menu';
import styles from './account-header.module.css';
import { BrandMark } from './brand-mark';

/**
 * The bar every signed-in page has: the instance's mark and name on the left, which lead home, and on the right
 * the person's avatar, whose menu holds their account, the Console for an operator, and sign out. It is the one
 * way between the apps, the account pages and the Console, so none of them is a dead end. Nothing is drawn for
 * someone who is not signed in; the page's own guard decides what they see instead.
 */
export async function AccountHeader({ bordered = false }: { bordered?: boolean }) {
  const session = await getSession();
  if (!session) return null;
  const [identity, matrix] = await Promise.all([getInstanceIdentity(), getCapabilityMatrix()]);
  const operator = can(session.user.role, 'console:access', matrix);

  return (
    <header className={bordered ? `${styles.header} ${styles.bordered}` : styles.header}>
      <Link href="/" className={styles.brand}>
        <BrandMark size="lg" />
        <span className={styles.brandName}>{identity.name}</span>
      </Link>
      <AccountMenu
        name={session.user.name}
        email={session.user.email}
        avatarUrl={session.user.image ?? undefined}
        operator={operator}
      />
    </header>
  );
}
