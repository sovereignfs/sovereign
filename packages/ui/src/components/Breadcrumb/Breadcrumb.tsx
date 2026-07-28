import type { ReactNode } from 'react';
import { Icon } from '../Icon/Icon';
import styles from './Breadcrumb.module.css';

export interface BreadcrumbItem {
  label: string;
  /** Omit for the current page — rendered as plain text with aria-current. */
  href?: string;
}

export interface BreadcrumbProps {
  items: BreadcrumbItem[];
  /** Renders a linked item. Defaults to a plain `<a href>`, which causes a
   * full page reload — pass Next's `<Link>` (or equivalent) to keep
   * navigation client-side, which matters inside overlay-shell plugins
   * where a full reload breaks the router.back()-driven dismiss flow. */
  renderLink?: (item: BreadcrumbItem, children: ReactNode) => ReactNode;
  className?: string;
  'aria-label'?: string;
}

export function Breadcrumb({
  items,
  renderLink,
  className,
  'aria-label': ariaLabel = 'Breadcrumb',
}: BreadcrumbProps) {
  return (
    <nav aria-label={ariaLabel} className={[styles.nav, className].filter(Boolean).join(' ')}>
      <ol className={styles.list}>
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <li key={item.label + index} className={styles.item}>
              {item.href ? (
                renderLink ? (
                  renderLink(item, item.label)
                ) : (
                  <a href={item.href} className={styles.link}>
                    {item.label}
                  </a>
                )
              ) : (
                <span className={styles.current} aria-current="page">
                  {item.label}
                </span>
              )}
              {!isLast && (
                <Icon name="chevron-right" size="xs" aria-hidden className={styles.separator} />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
