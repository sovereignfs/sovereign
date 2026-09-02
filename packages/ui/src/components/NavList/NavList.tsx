import { Fragment, type ReactNode } from 'react';
import { Icon } from '../Icon/Icon';
import type { IconName } from '../Icon/Icon';
import styles from './NavList.module.css';

export interface NavListItem {
  id: string;
  label: string;
  href: string;
  icon: IconName;
  /** Trailing content, e.g. a count — reserved for a future consumer, not used by `variant="drilldown"`'s own chevron slot. */
  badge?: ReactNode;
  /**
   * Only meaningful for `variant="static"` — whether this row represents the
   * current page. Computed by the consumer (e.g. via `usePathname()` plus a
   * longest-prefix match against every item's `href`), since this package
   * doesn't depend on `next/navigation` — same reasoning as `NavTabs`.
   */
  active?: boolean;
}

export interface NavListGroup {
  id: string;
  /** Omit for an ungrouped leading item/group — e.g. a pinned "Overview" row above the grouped sections. */
  label?: string;
  items: NavListItem[];
}

/** Props to spread onto a consumer-supplied link element — mirrors `NavTabs`' `NavTabLinkProps`. */
export interface NavListLinkProps {
  href: string;
  className: string;
  'aria-current': 'page' | undefined;
  children: ReactNode;
}

export interface NavListProps {
  groups: NavListGroup[];
  /**
   * `"static"`: active row highlighted via `item.active`, no chevron — a
   * persistent sidebar nav. `"drilldown"`: every row gets a trailing chevron
   * and no active-state, tapping navigates to a full-screen section — a
   * native Settings-app style index.
   */
  variant: 'static' | 'drilldown';
  /**
   * `"default"`: each row is a full `--sv-touch-target-min` tall tap target
   * — the right choice for `variant="drilldown"`'s mobile index, and for any
   * `static` sidebar list long enough that scanability matters more than
   * density. `"compact"` shrinks row height/padding for a short, always-
   * visible `static` list (e.g. 2-4 items above a longer scrollable list of
   * something else) where the default's touch-target height reads as
   * needlessly spaced out. Only meaningful for `variant="static"` —
   * `drilldown` rows stay full-height regardless, since that variant is
   * mobile-only and touch-target size there isn't optional. Defaults to
   * `"default"` so every existing consumer (e.g. Console's own sidebar) is
   * visually unchanged.
   */
  density?: 'default' | 'compact';
  'aria-label': string;
  className?: string;
  /**
   * Render a row as something other than a plain `<a href>` — e.g. Next's
   * `<Link>`. Receives the item plus the class name/aria attributes NavList
   * would otherwise apply, matching `NavTabs`' `renderLink` contract.
   */
  renderLink?: (item: NavListItem, linkProps: NavListLinkProps) => ReactNode;
}

/**
 * NavList — a vertical list of icon+label rows, optionally grouped under
 * section headers. Two presentations of the same `groups` data: `static` (a
 * persistent sidebar, active item highlighted) and `drilldown` (a
 * native-Settings-app style index, every row navigates to a full section).
 *
 * Framework-agnostic like `NavTabs` — no `next/navigation`/`next/link`
 * import, no internal pathname reading. Active state and navigation behavior
 * are supplied by the consumer via `item.active` and `renderLink`.
 */
export function NavList({
  groups,
  variant,
  density = 'default',
  'aria-label': ariaLabel,
  className,
  renderLink,
}: NavListProps) {
  return (
    <nav
      className={[styles.nav, styles[variant], density === 'compact' && styles.compact, className]
        .filter(Boolean)
        .join(' ')}
      aria-label={ariaLabel}
    >
      {groups.map((group) => (
        <div key={group.id} className={styles.group}>
          {group.label && <div className={styles.groupLabel}>{group.label}</div>}
          {group.items.map((item) => {
            const isActive = variant === 'static' && !!item.active;
            const rowContent = (
              <>
                <Icon name={item.icon} size="sm" aria-hidden className={styles.icon} />
                <span className={styles.label}>{item.label}</span>
                {item.badge && <span className={styles.badge}>{item.badge}</span>}
                {variant === 'drilldown' && (
                  <Icon name="chevron-right" size="sm" aria-hidden className={styles.chevron} />
                )}
              </>
            );
            const linkProps: NavListLinkProps = {
              href: item.href,
              className: [styles.row, isActive && styles.rowActive].filter(Boolean).join(' '),
              'aria-current': isActive ? 'page' : undefined,
              children: rowContent,
            };
            return (
              <Fragment key={item.id}>
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
        </div>
      ))}
    </nav>
  );
}
