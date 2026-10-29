import { getInstanceIdentity } from '../src/instance/service';
import styles from './instance-logo.module.css';

/**
 * The instance's logo, small, for the header beside its name. Both pictures are in the page and the theme shows
 * one, so the right one is there from the first paint. Nothing is drawn when no logo is set; the pages before
 * sign-in draw the instance's mark themselves (`AuthBrand`).
 */
export async function InstanceLogo() {
  const { logoLight, logoDark } = await getInstanceIdentity();
  if (!logoLight && !logoDark) return null;
  return (
    <div className={styles.small}>
      {logoLight ? <img className={styles.light} src={logoLight} alt="" /> : null}
      {logoDark ? <img className={styles.dark} src={logoDark} alt="" /> : null}
    </div>
  );
}
