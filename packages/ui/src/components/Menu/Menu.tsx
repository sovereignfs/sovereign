'use client';

import type { ReactElement } from 'react';
import { useIsMobile } from '../../hooks';
import { Drawer } from '../Drawer/Drawer';
import { Icon, type IconName } from '../Icon/Icon';
import { Popover } from '../Popover/Popover';
import styles from './Menu.module.css';

export interface MenuItem {
  type?: 'item';
  label: string;
  /** Optional when `href` is provided (a pure navigation entry needs no
   *  extra callback) — required otherwise. Called before the surface closes
   *  is the caller's job to avoid; `Menu`'s own wiring always closes first,
   *  then calls this. */
  onSelect?: () => void;
  /** Renders the entry as a link (`<a href>`, `role="menuitem"`) instead of
   *  a `<button>` — same href-vs-onClick convention as `MobileAppsDrawer`'s
   *  items. Framework-agnostic (a plain anchor, not `next/link`), matching
   *  every other `packages/ui` href slot. */
  href?: string;
  icon?: IconName;
  /** Styles the item as a destructive action (e.g. "Delete list"). */
  destructive?: boolean;
  disabled?: boolean;
  /**
   * Marks the item as one of a mutually-exclusive set (e.g. the active sort
   * order) — renders a leading checkmark and `role="menuitemradio"` instead
   * of `role="menuitem"`. Pass this on every item in the group, including
   * the unchecked ones, so their labels stay aligned with the checked one's
   * reserved checkmark gutter. Omit entirely for plain action items (e.g.
   * "Delete list") — they render with no reserved leading space at all.
   */
  checked?: boolean;
}

/** A non-interactive section heading above a run of items (e.g. "Sort by"). */
export interface MenuLabel {
  type: 'label';
  label: string;
}

/** A visual divider between sections. */
export interface MenuSeparator {
  type: 'separator';
}

export type MenuEntry = MenuItem | MenuLabel | MenuSeparator;

export interface MenuProps {
  /** The element that opens the menu — rendered as-is; the caller wires its
   *  onClick to flip `open` (same controlled pattern as `Popover`). */
  trigger: ReactElement;
  open: boolean;
  onClose: () => void;
  items: MenuEntry[];
  'aria-label': string;
  /** Forwarded to `Popover` on desktop. Has no effect on mobile, where the
   *  menu is always a full-width `Drawer`. */
  align?: 'left' | 'right';
  /** Forwarded to `Popover` on desktop (same default: 288). Has no effect
   *  on mobile. Narrow this when the trigger lives inside a column
   *  narrower than the default width — e.g. a per-row "⋯" menu in a
   *  sidebar list — so the panel fits within that column's own bounds
   *  instead of overflowing past its edge, where a scrollable ancestor's
   *  `overflow-y: auto` (which the CSS Overflow spec computes the paired
   *  `overflow-x` to `auto` as well, not `visible`, once either axis is
   *  set) would clip it. */
  width?: number | 'trigger';
}

/**
 * Menu — an adaptive action menu: `Popover` on desktop, a bottom-sheet
 * `Drawer` on mobile. Replaces the desktop-Popover/mobile-Drawer fork that
 * `⋯` action menus (list options, row actions) otherwise re-derive per
 * plugin. Same list of `items` renders in both presentations — only the
 * surrounding chrome (floating panel vs. bottom sheet) differs, matching the
 * platform's `useIsMobile` breakpoint.
 *
 * `items` accepts three entry shapes: a plain action (`MenuItem`, `type`
 * omitted or `'item'`), a non-interactive section heading (`MenuLabel`,
 * `type: 'label'`), and a `MenuSeparator` (`type: 'separator'`) — enough to
 * express grouped sections like "Filter" / "Sort by" above a run of
 * destructive actions, matching how native OS menus lay out mixed
 * action/selection groups.
 *
 * Selecting an item both closes the menu and calls its `onSelect` — a
 * consumer's `onSelect` never needs to call `onClose` itself.
 */
/**
 * MenuEntries — the `<ul role="menu">` item list itself, factored out of
 * `Menu` so other adaptive-surface components (e.g. `ContextMenu`) can
 * render the exact same items/destructive/checked/icon markup inside their
 * own positioning shell, instead of re-deriving it and risking drift.
 */
export function MenuEntries({
  items,
  onSelect,
}: {
  items: MenuEntry[];
  /** Called after an item's own onSelect — typically the surface's onClose. */
  onSelect: (entry: MenuItem) => void;
}) {
  return (
    <ul className={styles.list} role="menu">
      {items.map((entry, index) => {
        // Entries are a static, order-stable list per render — nothing
        // reorders — so an index key is safe here.
        if (entry.type === 'separator') {
          return <li key={index} role="separator" className={styles.separator} />;
        }
        if (entry.type === 'label') {
          return (
            <li key={index} role="presentation" className={styles.label}>
              {entry.label}
            </li>
          );
        }
        const isCheckable = entry.checked !== undefined;
        const className = [styles.item, entry.destructive ? styles.itemDestructive : '']
          .filter(Boolean)
          .join(' ');
        const content = (
          <>
            {isCheckable && (
              <span className={styles.check} aria-hidden>
                {entry.checked && <Icon name="check" size="sm" aria-hidden />}
              </span>
            )}
            {entry.icon && <Icon name={entry.icon} size="sm" aria-hidden />}
            {entry.label}
          </>
        );
        return (
          <li key={index} role="none">
            {entry.href ? (
              <a
                role="menuitem"
                href={entry.href}
                className={className}
                onClick={() => onSelect(entry)}
              >
                {content}
              </a>
            ) : (
              <button
                role={isCheckable ? 'menuitemradio' : 'menuitem'}
                aria-checked={isCheckable ? entry.checked : undefined}
                type="button"
                className={className}
                disabled={entry.disabled}
                onClick={() => onSelect(entry)}
              >
                {content}
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function Menu({
  trigger,
  open,
  onClose,
  items,
  'aria-label': ariaLabel,
  align,
  width,
}: MenuProps) {
  const isMobile = useIsMobile();

  const list = (
    <MenuEntries
      items={items}
      onSelect={(entry) => {
        onClose();
        entry.onSelect?.();
      }}
    />
  );

  if (isMobile) {
    return (
      <>
        {trigger}
        <Drawer open={open} onClose={onClose} aria-label={ariaLabel}>
          {list}
        </Drawer>
      </>
    );
  }

  return (
    <Popover
      trigger={trigger}
      open={open}
      onClose={onClose}
      aria-label={ariaLabel}
      align={align}
      width={width}
    >
      {list}
    </Popover>
  );
}
