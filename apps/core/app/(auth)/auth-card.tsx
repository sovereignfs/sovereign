import Link from 'next/link';
import type { ReactNode } from 'react';
import { AuthCard as Card } from '@sovereignfs/ui';
import { BrandMark } from '../brand-mark';
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
 * at the foot unless the page is not one they are asked to agree to. The design system's card (`AuthCard`), with core's mark and
 * links.
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
  // Resolved here, so the card is given the mark itself rather than a component still to load.
  const brand = await BrandMark({ labelled: true });
  return (
    <Card
      brand={brand}
      title={title}
      {...(lead ? { lead } : {})}
      legal={
        legal
          ? {
              renderLink: (href, label) => (
                <Link href={href} className={styles.link}>
                  {label}
                </Link>
              ),
            }
          : false
      }
    >
      {children}
    </Card>
  );
}
