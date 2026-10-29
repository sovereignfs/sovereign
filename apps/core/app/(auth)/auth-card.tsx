import Link from 'next/link';
import type { ReactNode } from 'react';
import { LegalLinks } from '@sovereignfs/ui';
import { BrandMark } from '../brand-mark';
import { AuthShell } from './auth-shell';
import styles from './auth.module.css';

/** The instance's mark, above a page's title, named for a screen reader since the title may not say whose it is. */
export async function AuthBrand() {
  return (
    <div className={styles.brand}>
      <BrandMark labelled />
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
