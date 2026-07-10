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
  onSelect: () => void;
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
export function Menu({ trigger, open, onClose, items, 'aria-label': ariaLabel, align }: MenuProps) {
  const isMobile = useIsMobile();

  const list = (
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
        return (
          <li key={index} role="none">
            <button
              role={isCheckable ? 'menuitemradio' : 'menuitem'}
              aria-checked={isCheckable ? entry.checked : undefined}
              type="button"
              className={[styles.item, entry.destructive ? styles.itemDestructive : '']
                .filter(Boolean)
                .join(' ')}
              disabled={entry.disabled}
              onClick={() => {
                onClose();
                entry.onSelect();
              }}
            >
              {isCheckable && (
                <span className={styles.check} aria-hidden>
                  {entry.checked && <Icon name="check" size="sm" aria-hidden />}
                </span>
              )}
              {entry.icon && <Icon name={entry.icon} size="sm" aria-hidden />}
              {entry.label}
            </button>
          </li>
        );
      })}
    </ul>
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
    <Popover trigger={trigger} open={open} onClose={onClose} aria-label={ariaLabel} align={align}>
      {list}
    </Popover>
  );
}
