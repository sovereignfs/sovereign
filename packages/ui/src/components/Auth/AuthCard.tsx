import type { ReactNode } from 'react';
import { LegalLinks, type LegalLinksProps } from '../LegalLinks/LegalLinks';
import { AuthShell } from './AuthShell';
import styles from './Auth.module.css';

export interface AuthCardProps {
  /** The mark above the title, such as a `BrandBadge` or a logo. Name a logo for a screen reader. */
  brand?: ReactNode;
  title: string;
  /** What the person does here, under the title. */
  lead?: string;
  /** The privacy and terms links at the foot. Pass `false` for a page that is not one they agree to, or an
   * app with no such pages. */
  legal?: boolean | LegalLinksProps;
  /** A wider card, for a page that shows more than a form. */
  wide?: boolean;
  children?: ReactNode;
}

/** A page before sign-in: a mark, a title, and what the person does here, with the legal links at the foot. */
export function AuthCard({ brand, title, lead, legal = true, wide, children }: AuthCardProps) {
  return (
    <AuthShell wide={wide === true}>
      {brand ? <div className={styles.brand}>{brand}</div> : null}
      <h1 className={styles.title}>{title}</h1>
      {lead ? <p className={styles.lead}>{lead}</p> : null}
      {children}
      {legal ? <LegalLinks {...(legal === true ? {} : legal)} /> : null}
    </AuthShell>
  );
}
