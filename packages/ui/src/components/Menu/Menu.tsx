'use client';

import type { ReactElement } from 'react';
import { useIsMobile } from '../../hooks';
import { Drawer } from '../Drawer/Drawer';
import { Icon, type IconName } from '../Icon/Icon';
import { Popover } from '../Popover/Popover';
import styles from './Menu.module.css';

export interface MenuItem {
  label: string;
  onSelect: () => void;
  icon?: IconName;
  /** Styles the item as a destructive action (e.g. "Delete list"). */
  destructive?: boolean;
  disabled?: boolean;
}

export interface MenuProps {
  /** The element that opens the menu — rendered as-is; the caller wires its
   *  onClick to flip `open` (same controlled pattern as `Popover`). */
  trigger: ReactElement;
  open: boolean;
  onClose: () => void;
  items: MenuItem[];
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
 * Selecting an item both closes the menu and calls its `onSelect` — a
 * consumer's `onSelect` never needs to call `onClose` itself.
 */
export function Menu({ trigger, open, onClose, items, 'aria-label': ariaLabel, align }: MenuProps) {
  const isMobile = useIsMobile();

  const list = (
    <ul className={styles.list} role="menu">
      {items.map((item) => (
        <li key={item.label} role="none">
          <button
            role="menuitem"
            type="button"
            className={[styles.item, item.destructive ? styles.itemDestructive : '']
              .filter(Boolean)
              .join(' ')}
            disabled={item.disabled}
            onClick={() => {
              onClose();
              item.onSelect();
            }}
          >
            {item.icon && <Icon name={item.icon} size="sm" aria-hidden />}
            {item.label}
          </button>
        </li>
      ))}
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
