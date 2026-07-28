'use client';

import { NavigationMenu } from '../NavigationMenu/NavigationMenu';
import { MenuEntries, type MenuEntry } from '../Menu/Menu';

export interface MenubarMenu {
  label: string;
  items: MenuEntry[];
}

export interface MenubarProps {
  menus: MenubarMenu[];
  'aria-label'?: string;
}

/**
 * Menubar — desktop app-style menu bar (File / Edit / View...). A thin
 * composition of `NavigationMenu` (top-level triggers, per-item flyout
 * positioning, hover-switches-when-one-is-open, arrow-key navigation) with
 * `MenuEntries` (the same item list markup `Menu`'s dropdowns use) as each
 * item's flyout content — no positioning or list-rendering logic
 * duplicated from either.
 */
export function Menubar({ menus, 'aria-label': ariaLabel = 'Menu bar' }: MenubarProps) {
  return (
    <NavigationMenu
      aria-label={ariaLabel}
      items={menus.map((menu) => ({
        label: menu.label,
        content: (close: () => void) => (
          <MenuEntries
            items={menu.items}
            onSelect={(entry) => {
              close();
              entry.onSelect();
            }}
          />
        ),
      }))}
    />
  );
}
