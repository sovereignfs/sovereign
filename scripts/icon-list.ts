/**
 * Curated Lucide icon set for the Sovereign design system.
 *
 * Add a name here and run `pnpm generate:icons` to include it in the published
 * package. Names match Lucide's kebab-case convention (https://lucide.dev/icons/).
 * The set is intentionally small — add only icons the platform chrome or plugin
 * ecosystem actively uses.
 */
export const ICON_LIST = [
  // Shell chrome
  'house',
  'settings',
  'log-out',
  'smartphone',
  // Navigation / overlay
  'chevron-right',
  'chevron-left',
  'chevron-down',
  'chevron-up',
  'circle-chevron-left',
  'menu',
  'x',
  // Actions
  'check',
  'plus',
  'trash-2',
  'pencil',
  'rotate-ccw',
  'search',
  'copy',
  // User / security
  'user',
  'user-round-plus',
  'shield',
  'lock',
  'eye',
  'eye-off',
  // Content / status
  'mail',
  'bell',
  'inbox',
  'activity',
  'package',
  'layers',
  'grid-2x2',
  'layout-dashboard',
  'layout-grid',
  'square-kanban',
  'info',
  'alert-triangle',
  'circle-check',
  'circle-x',
  'calendar',
  'sliders-horizontal',
  'ellipsis-vertical',
  'rectangle-ellipsis',
  'file',
  'upload',
  'external-link',
  // Grocery item / category (Sovereign Shopper, SHP-05) — a curated set
  // covering common items directly plus a representative icon per category
  // as the fallback when no item-level match exists. See
  // plugins/sovereign-shopper's lib/icons.ts for the keyword/category maps.
  'banana',
  'apple',
  'carrot',
  'egg',
  'beef',
  'fish',
  'coffee',
  'wine',
  'beer',
  'cookie',
  'pizza',
  'candy',
  'salad',
  'milk',
  'drumstick',
  'croissant',
  'cup-soda',
  'spray-can',
  'snowflake',
  'shopping-basket',
] as const;

export type IconName = (typeof ICON_LIST)[number];
