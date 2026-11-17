import type { IconName } from '@sovereignfs/ui';

/**
 * The icons a shortcut may be given instead of a picture (core-app §3.8.1): outline icons of the design system,
 * monochrome like every tile. A curated set, so the picker stays small and a stored name is always one it can draw.
 */
export const SHORTCUT_SYMBOLS = [
  'link',
  'external-link',
  'hard-drive',
  'folder',
  'file-text',
  'notebook-pen',
  'mail',
  'inbox',
  'message-square',
  'calendar',
  'list-todo',
  'users',
  'house',
  'map-pin',
  'credit-card',
  'shopping-basket',
  'package',
  'archive',
  'database',
  'code',
  'layout-grid',
  'activity',
  'bell',
  'clock',
  'lock',
  'smartphone',
  'share-2',
  'coffee',
] as const satisfies readonly IconName[];

export type ShortcutSymbol = (typeof SHORTCUT_SYMBOLS)[number];

export const isShortcutSymbol = (value: unknown): value is ShortcutSymbol =>
  typeof value === 'string' && (SHORTCUT_SYMBOLS as readonly string[]).includes(value);
