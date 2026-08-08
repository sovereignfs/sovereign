import type { ReactNode } from 'react';
import styles from './LegalLinks.module.css';

export interface LegalLinksProps {
  privacyHref?: string;
  termsHref?: string;
  /** Renders a linked item. Defaults to a plain `<a href>`, which causes a
   * full page reload — pass Next's `<Link>` (or equivalent) to keep
   * navigation client-side. Not needed for a full-reload navigation away
   * from a standalone auth page, but matters if this is ever mounted inside
   * an SPA-like shell. */
  renderLink?: (href: string, label: string) => ReactNode;
  className?: string;
}

export function LegalLinks({
  privacyHref = '/privacy',
  termsHref = '/terms',
  renderLink,
  className,
}: LegalLinksProps) {
  const link = (href: string, label: string) =>
    renderLink ? (
      renderLink(href, label)
    ) : (
      <a href={href} className={styles.link}>
        {label}
      </a>
    );

  return (
    <p className={[styles.root, className].filter(Boolean).join(' ')}>
      {link(privacyHref, 'Privacy Policy')}
      <span aria-hidden="true" className={styles.dot}>
        ·
      </span>
      {link(termsHref, 'Terms of Service')}
    </p>
  );
}
