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
  // Navigation / overlay
  'chevron-right',
  'chevron-left',
  'chevron-down',
  'chevron-up',
  'x',
  // Actions
  'check',
  'plus',
  'trash-2',
  'pencil',
  'rotate-ccw',
  'search',
  // User / security
  'user',
  'shield',
  'lock',
  'eye',
  'eye-off',
  // Content / status
  'mail',
  'bell',
  'activity',
  'package',
  'grid-2x2',
  'info',
  'alert-triangle',
] as const;

export type IconName = (typeof ICON_LIST)[number];
