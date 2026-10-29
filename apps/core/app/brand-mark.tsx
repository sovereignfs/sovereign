import { getInstanceIdentity } from '../src/instance/service';
import styles from './brand-mark.module.css';

/**
 * The instance's mark: its logo if it has one, otherwise the first letter of its name in a badge. The pages
 * before sign-in show it above their title, and the header beside the name. Both pictures are in the page and
 * the theme shows one, so the right one is there from the first paint.
 */
export async function BrandMark({
  size = 'md',
  labelled = false,
}: {
  size?: 'md' | 'lg';
  /** Name the logo for a screen reader, where nothing beside it already says whose it is. */
  labelled?: boolean;
}) {
  const { name, logoLight, logoDark } = await getInstanceIdentity();
  const sized = size === 'lg' ? styles.lg : styles.md;
  if (logoLight || logoDark) {
    return (
      <span className={`${styles.picture} ${sized}`}>
        {logoLight ? (
          <img className={styles.light} src={logoLight} alt={labelled ? name : ''} />
        ) : null}
        {logoDark ? (
          <img className={styles.dark} src={logoDark} alt={labelled ? name : ''} />
        ) : null}
      </span>
    );
  }
  return (
    <span className={`${styles.badge} ${sized}`} aria-hidden="true">
      {name.trim()[0]?.toUpperCase() ?? 'S'}
    </span>
  );
}
