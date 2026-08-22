'use client';

import { useState, type ReactNode } from 'react';
import { Icon } from '../Icon/Icon';
import { Popover } from '../Popover/Popover';
import { Spinner } from '../Spinner/Spinner';
import styles from './AppsLauncher.module.css';

export interface AppsLauncherItem {
  /** Stable identity for this tile — used as the React key. */
  key: string;
  icon: ReactNode;
  label: string;
  /** Renders an `<a>` when set; otherwise a `<button>` calling `onClick` —
   *  same dual-mode convention as `MobileAppsDrawer`'s items. */
  href?: string;
  onClick?: () => void;
}

export interface AppsLauncherProps {
  items: AppsLauncherItem[];
  /** Shows a spinner in place of the grid — e.g. while the tile list is
   *  still being fetched. */
  loading?: boolean;
  /** Shows an error message in place of the grid. */
  error?: boolean;
  errorMessage?: string;
  /** Trigger button's icon. Defaults to a generic grid glyph — pass the
   *  real Launcher plugin's own icon for pixel parity with the platform. */
  triggerIcon?: ReactNode;
  /** Trigger button's accessible label, and the popover's own. Defaults to "Apps". */
  'aria-label'?: string;
  align?: 'left' | 'right';
}

function AppsLauncherTile({ icon, label, href, onClick }: Omit<AppsLauncherItem, 'key'>) {
  const content = (
    <>
      <span className={styles.tileIcon} aria-hidden="true">
        {icon}
      </span>
      <span className={styles.tileName}>{label}</span>
    </>
  );
  if (href) {
    return (
      <a href={href} className={styles.tile} onClick={onClick}>
        {content}
      </a>
    );
  }
  return (
    <button type="button" className={styles.tile} onClick={onClick}>
      {content}
    </button>
  );
}

/**
 * AppsLauncher — the desktop "Apps" switcher: a 28px grid-icon trigger that
 * opens a `Popover` with a 3-column tile grid. The desktop counterpart to
 * `MobileAppsDrawer` — same `items` shape (`key`/`icon`/`label`/`href`/
 * `onClick`), different chrome (floating panel vs. bottom sheet), matching
 * how `Header`/`MobileHeader` already split the same way.
 *
 * Presentational only — no plugin-list fetching of its own. The consumer
 * supplies `items` already resolved (and `loading`/`error` while it isn't
 * yet), matching `MobileAppsDrawer`'s own boundary.
 */
export function AppsLauncher({
  items,
  loading,
  error,
  errorMessage = "Couldn't load apps. Try again.",
  triggerIcon,
  'aria-label': ariaLabel = 'Apps',
  align = 'right',
}: AppsLauncherProps) {
  const [open, setOpen] = useState(false);

  return (
    <Popover
      align={align}
      width={320}
      aria-label={ariaLabel}
      open={open}
      onClose={() => setOpen(false)}
      trigger={
        <button
          type="button"
          aria-label={ariaLabel}
          aria-haspopup="true"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className={styles.trigger}
        >
          {triggerIcon ?? <Icon name="layout-grid" size="md" aria-hidden />}
        </button>
      }
    >
      <div className={styles.header}>{ariaLabel}</div>
      {loading ? (
        <div className={styles.loading}>
          <Spinner size="md" label="Loading apps…" />
        </div>
      ) : error ? (
        <p className={styles.error}>{errorMessage}</p>
      ) : (
        <div className={styles.grid}>
          {items.map(({ key, ...item }) => (
            <AppsLauncherTile key={key} {...item} />
          ))}
        </div>
      )}
    </Popover>
  );
}
