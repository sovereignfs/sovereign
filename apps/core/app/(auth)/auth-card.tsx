import Link from 'next/link';
import type { ReactNode } from 'react';
import { LegalLinks } from '@sovereignfs/ui';
import { getInstanceIdentity } from '../../src/instance/service';
import { AuthShell } from './auth-shell';
import styles from './auth.module.css';

/** The instance's mark: its logo if it has one, otherwise the first letter of its name in a badge. */
export async function AuthBrand() {
  const { name, logoLight, logoDark } = await getInstanceIdentity();
  if (logoLight || logoDark) {
    return (
      <div className={styles.brandPicture}>
        {logoLight ? <img className={styles.brandLight} src={logoLight} alt={name} /> : null}
        {logoDark ? <img className={styles.brandDark} src={logoDark} alt={name} /> : null}
      </div>
    );
  }
  return (
    <div className={styles.brand} aria-hidden="true">
      {name.trim()[0]?.toUpperCase() ?? 'S'}
    </div>
  );
}

/**
 * A page before sign-in: the instance's mark, a title, and what the person does here, with the legal links
 * at the foot unless the page is not one they are asked to agree to.
 */
export async function AuthCard({
  title,
  lead,
  legal = true,
  children,
}: {
  title: string;
  lead?: string;
  legal?: boolean;
  children?: ReactNode;
}) {
  return (
    <AuthShell>
      <AuthBrand />
      <h1 className={styles.title}>{title}</h1>
      {lead ? <p className={styles.lead}>{lead}</p> : null}
      {children}
      {legal ? (
        <LegalLinks
          renderLink={(href, label) => (
            <Link href={href} className={styles.link}>
              {label}
            </Link>
          )}
        />
      ) : null}
    </AuthShell>
  );
}
