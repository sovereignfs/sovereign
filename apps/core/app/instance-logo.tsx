import { getInstanceIdentity } from '../src/instance/service';
import styles from './instance-logo.module.css';

/**
 * The instance's logo, for the pages a person meets before signing in. Both pictures are in the page and the
 * theme shows one, so the right one is there from the first paint. Nothing is drawn when no logo is set.
 */
export async function InstanceLogo({ small = false }: { small?: boolean } = {}) {
  const { name, logoLight, logoDark } = await getInstanceIdentity();
  if (!logoLight && !logoDark) return null;
  return (
    <div className={small ? styles.small : styles.logo}>
      {logoLight ? <img className={styles.light} src={logoLight} alt={small ? '' : name} /> : null}
      {logoDark ? <img className={styles.dark} src={logoDark} alt={small ? '' : name} /> : null}
    </div>
  );
}
