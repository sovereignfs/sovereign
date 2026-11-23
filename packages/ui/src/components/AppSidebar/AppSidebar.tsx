'use client';

import type { ReactElement, ReactNode } from 'react';
import { Icon, type IconName } from '../Icon/Icon';
import styles from './AppSidebar.module.css';

export interface AppSidebarItem {
  id: string;
  label: string;
  /** Where it goes. Without one, the row is a button calling `onClick`. */
  href?: string;
  onClick?: () => void;
  /** The row's icon. On a rail an item with none shows its label's first letter. */
  icon?: IconName;
  /** The icon's colour (an app's or a person's `#rrggbb`), drawn on the ordinary surface: never a background or the text's. */
  iconColor?: string;
  /** A count after the label, such as what is still open. */
  count?: ReactNode;
  /** A second line under the label, such as whose it is. */
  description?: string;
  /** Whether this is the page shown, decided by the app. */
  active?: boolean;
}

export interface AppSidebarAction {
  /** The row's words, such as "New list". */
  label: string;
  href?: string;
  onClick?: () => void;
}

export interface AppSidebarBlock {
  id: string;
  /** A heading over the block; none for a block of the app's places. */
  heading?: string;
  items: AppSidebarItem[];
  /** A trailing _+ New …_ row. */
  action?: AppSidebarAction;
}

/** Props for a consumer's own link element (Next's `<Link>`). */
export interface AppSidebarLinkProps {
  href: string;
  className: string;
  'aria-current': 'page' | undefined;
  'aria-label': string | undefined;
  /** The label as the pointer's tooltip, on a rail. */
  title: string | undefined;
  onClick: (() => void) | undefined;
  children: ReactNode;
}

export interface AppSidebarProps {
  blocks: AppSidebarBlock[];
  /** `full` or `rail` (from `useAppSidebar`); `hidden` draws nothing. */
  state: 'full' | 'rail' | 'hidden';
  /** The sidebar's own button, from full to a rail and back. Omit for no button. */
  onToggleRail?: () => void;
  /** The navigation's accessible name, usually the app's. */
  'aria-label': string;
  /** The rail button's words: `[widen, narrow]`. English by default. */
  railLabels?: readonly [string, string];
  /** Anything under the blocks, before the rail button. */
  footer?: ReactNode;
  /** Told when a row or an action is followed: a drawer closes on it. */
  onNavigate?: () => void;
  renderLink?: (
    item: AppSidebarItem | AppSidebarAction,
    linkProps: AppSidebarLinkProps,
  ) => ReactNode;
  className?: string;
}

const initialOf = (label: string): string => (label.trim().charAt(0) || '·').toLocaleUpperCase();

/**
 * AppSidebar — the sidebar every app's frame has, drawn once. Full, a rail of icons (each named by its label, which the pointer
 * shows as the browser's own tooltip: a drawn one would be cut off by the sidebar's scrolling) or hidden,
 * as `useAppSidebar` keeps it per app and per kind of page. Its content is blocks, each with an optional heading, rows with an
 * icon in a colour and a count, and an optional trailing _+ New …_ row.
 *
 * Framework-agnostic: links come from `renderLink`, and what is current is the app's to say. It knows nothing of an app's data
 * or words: every label is given.
 */
export function AppSidebar({
  blocks,
  state,
  onToggleRail,
  'aria-label': ariaLabel,
  railLabels = ['Widen the sidebar', 'Narrow the sidebar'],
  footer,
  onNavigate,
  renderLink,
  className,
}: AppSidebarProps) {
  if (state === 'hidden') return null;
  const rail = state === 'rail';
  const railLabel = rail ? railLabels[0] : railLabels[1];

  return (
    <nav
      className={[styles.sidebar, rail ? styles.rail : '', className].filter(Boolean).join(' ')}
      aria-label={ariaLabel}
      data-sidebar={state}
    >
      <div className={styles.blocks}>
        {blocks.map((block) => (
          <section key={block.id} className={styles.block} aria-label={block.heading}>
            {block.heading && <h2 className={styles.heading}>{block.heading}</h2>}
            <ul className={styles.rows}>
              {block.items.map((item) => (
                <li key={item.id}>
                  <Row item={item} rail={rail} onNavigate={onNavigate} renderLink={renderLink} />
                </li>
              ))}
              {block.action && (
                <li>
                  <ActionRow
                    action={block.action}
                    rail={rail}
                    onNavigate={onNavigate}
                    renderLink={renderLink}
                  />
                </li>
              )}
            </ul>
          </section>
        ))}
      </div>
      {footer}
      {onToggleRail && (
        <button
          type="button"
          className={styles.railButton}
          aria-label={railLabel}
          title={railLabel}
          onClick={onToggleRail}
        >
          <Icon name={rail ? 'panel-left-open' : 'panel-left-close'} size="sm" aria-hidden />
        </button>
      )}
    </nav>
  );
}

function Row({
  item,
  rail,
  onNavigate,
  renderLink,
}: {
  item: AppSidebarItem;
  rail: boolean;
  onNavigate: (() => void) | undefined;
  renderLink: AppSidebarProps['renderLink'];
}) {
  const className = [styles.row, item.active ? styles.rowActive : ''].filter(Boolean).join(' ');
  const children = (
    <>
      {item.icon ? (
        <span
          className={styles.icon}
          style={item.iconColor ? { color: item.iconColor } : undefined}
        >
          <Icon name={item.icon} size="sm" aria-hidden />
        </span>
      ) : (
        <span className={styles.initial} aria-hidden>
          {initialOf(item.label)}
        </span>
      )}
      <span className={styles.label}>
        <span className={styles.name}>{item.label}</span>
        {item.description && <span className={styles.description}>{item.description}</span>}
      </span>
      {item.count !== undefined && item.count !== null && (
        <span className={styles.count}>{item.count}</span>
      )}
    </>
  );
  const onClick = () => {
    item.onClick?.();
    onNavigate?.();
  };
  // On a rail only the icon shows, so the row is named by its label.
  const name = rail ? item.label : undefined;
  let row: ReactElement;
  if (item.href !== undefined && renderLink) {
    row = (
      <>
        {renderLink(item, {
          href: item.href,
          className,
          'aria-current': item.active ? 'page' : undefined,
          'aria-label': name,
          title: name,
          onClick,
          children,
        })}
      </>
    );
  } else if (item.href !== undefined) {
    row = (
      <a
        href={item.href}
        className={className}
        aria-current={item.active ? 'page' : undefined}
        aria-label={name}
        title={name}
        onClick={onClick}
      >
        {children}
      </a>
    );
  } else {
    row = (
      <button
        type="button"
        className={className}
        aria-current={item.active ? 'page' : undefined}
        aria-label={name}
        title={name}
        onClick={onClick}
      >
        {children}
      </button>
    );
  }
  return row;
}

function ActionRow({
  action,
  rail,
  onNavigate,
  renderLink,
}: {
  action: AppSidebarAction;
  rail: boolean;
  onNavigate: (() => void) | undefined;
  renderLink: AppSidebarProps['renderLink'];
}) {
  const children = (
    <>
      <span className={styles.icon}>
        <Icon name="plus" size="sm" aria-hidden />
      </span>
      <span className={styles.label}>
        <span className={styles.name}>{action.label}</span>
      </span>
    </>
  );
  const onClick = () => {
    action.onClick?.();
    if (action.href !== undefined) onNavigate?.();
  };
  const name = rail ? action.label : undefined;
  let row: ReactElement;
  if (action.href !== undefined && renderLink) {
    row = (
      <>
        {renderLink(action, {
          href: action.href,
          className: styles.action ?? '',
          'aria-current': undefined,
          'aria-label': name,
          title: name,
          onClick,
          children,
        })}
      </>
    );
  } else if (action.href !== undefined) {
    row = (
      <a
        href={action.href}
        className={styles.action}
        aria-label={name}
        title={name}
        onClick={onClick}
      >
        {children}
      </a>
    );
  } else {
    row = (
      <button
        type="button"
        className={styles.action}
        aria-label={name}
        title={name}
        onClick={onClick}
      >
        {children}
      </button>
    );
  }
  return row;
}
