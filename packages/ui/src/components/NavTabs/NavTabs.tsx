import { Fragment, type ReactNode } from 'react';
import styles from './NavTabs.module.css';

export interface NavTabItem {
  label: string;
  href: string;
  active?: boolean;
}

/** Props to spread onto a consumer-supplied link element — keeps NavTabs' own
 * class names and a11y attributes in sync with whatever the consumer renders. */
export interface NavTabLinkProps {
  href: string;
  className: string;
  'aria-current': 'page' | undefined;
  children: ReactNode;
}

export interface NavTabsProps {
  items: NavTabItem[];
  className?: string;
  'aria-label'?: string;
  /** Render a tab as something other than a plain `<a href>` — e.g. Next's
   * `<Link replace>` inside an overlay-shell plugin, where a full page
   * navigation would break the dialog's history contract. Receives the item
   * plus the class name/aria attributes NavTabs would otherwise apply. */
  renderLink?: (item: NavTabItem, linkProps: NavTabLinkProps) => ReactNode;
}

export function NavTabs({ items, className, 'aria-label': ariaLabel, renderLink }: NavTabsProps) {
  return (
    <nav
      className={[styles.nav, className].filter(Boolean).join(' ')}
      aria-label={ariaLabel ?? 'Page navigation'}
    >
      {items.map((item) => {
        const linkProps: NavTabLinkProps = {
          href: item.href,
          className: [styles.link, item.active && styles.active].filter(Boolean).join(' '),
          'aria-current': item.active ? 'page' : undefined,
          children: item.label,
        };
        return (
          <Fragment key={item.href}>
            {renderLink ? (
              renderLink(item, linkProps)
            ) : (
              <a
                href={linkProps.href}
                className={linkProps.className}
                aria-current={linkProps['aria-current']}
              >
                {linkProps.children}
              </a>
            )}
          </Fragment>
        );
      })}
    </nav>
  );
}
