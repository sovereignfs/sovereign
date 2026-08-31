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
  'users',
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
  'folder',
  'upload',
  'download',
  'external-link',
  'arrow-left-right',
  'send',
  // Rich-text editor formatting (Docs/Plainwrite RichTextEditor toolbar)
  'list',
  'list-ordered',
  'link',
  'code',
  'rotate-cw',
  // Docs document-page overflow menu (Sync to Git / Revisions)
  'refresh-cw',
  'history',
  // Rich-text editor: insert horizontal rule
  'minus',
  // Rich-text editor: table menu trigger (insert/row/column controls)
  'table',
  // Sheets plugin: nav item + workbook/inbox tile icon
  'sheet',
  // Docs plugin: ThreeColumnLayout sidebar nav + folder/document tiles
  'folders',
  'folder-closed',
  'file-text',
  'folder-open',
  // Docs document-page toolbar (Share button)
  'share-2',
  // Travellog plugin: ThreeColumnLayout sidebar nav (Trips/Check-ins/Planner)
  'luggage',
  'map-pin',
  'route',
  // Sheets plugin: cell formatting toolbar (Bold/Italic/Fill color) —
  // italic previously rendered as a plain font-style-italic "I", which at
  // toolbar size reads as an unlabeled slash; the dedicated icon disambiguates
  // independent of font rendering. Bold switched alongside it for visual
  // consistency between the two toggle buttons.
  'bold',
  'italic',
  'paint-bucket',
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
  // Warden sidebar (RFC 0063 §10, epic task 22.10): collapse toggle + pin
  'panel-left',
  'pin',
] as const;

export type IconName = (typeof ICON_LIST)[number];
