import Link from 'next/link';
import { ButtonLink } from '@sovereignfs/ui';
import { AuthBrand } from './(auth)/auth-card';
import { AuthShell } from './(auth)/auth-shell';
import styles from './(auth)/auth.module.css';

/** Any address that leads nowhere, and every Console page someone may not open (which look the same on purpose). */
export default function NotFound() {
  return (
    <AuthShell>
      <AuthBrand />
      <h1 className={styles.title}>This page is not here</h1>
      <p className={styles.lead}>
        The address may be wrong, or the page may have moved. Nothing is lost.
      </p>
      <div className={styles.form}>
        <ButtonLink href="/" className={styles.wide} renderLink={(props) => <Link {...props} />}>
          Go to the start
        </ButtonLink>
      </div>
    </AuthShell>
  );
}
