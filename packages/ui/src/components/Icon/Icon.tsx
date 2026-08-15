import { ICONS, type IconName } from './icons';
import styles from './Icon.module.css';

export type { IconName };

/** Every valid `IconName`, for runtime validation of a dynamically-sourced
 *  icon name (e.g. a manifest-declared string) before rendering it — a
 *  plugin manifest is plain JSON and can't be typed as `IconName` at
 *  authoring time. Not itself the generated `icons/index.ts` (kept out of
 *  that file's "do not edit" boundary), just a derived view of it. */
export const ICON_NAMES = Object.keys(ICONS) as IconName[];

/** Decorative icon — visually meaningful but described by surrounding text. */
type DecorativeProps = { 'aria-hidden': true; 'aria-label'?: never };
/** Meaningful icon — standalone affordance that requires a label for screen readers. */
type MeaningfulProps = { 'aria-label': string; 'aria-hidden'?: never };

export interface IconProps {
  /** Name of the icon from the curated Sovereign set. */
  name: IconName;
  /** Visual size. Defaults to `"md"` (20 px). */
  size?: 'xs' | 'sm' | 'md' | 'lg';
  /** Additional CSS class applied to the SVG element. */
  className?: string;
}

/**
 * `<Icon>` — the Sovereign design system icon primitive.
 *
 * Icons are either **decorative** (described by surrounding text — pass `aria-hidden`)
 * or **meaningful** (standalone affordance — pass `aria-label`):
 *
 * ```tsx
 * <Icon name="house" aria-hidden />           // decorative
 * <Icon name="log-out" aria-label="Sign out" /> // meaningful
 * ```
 *
 * Color follows `currentColor` so an icon automatically inherits the text color
 * of its container and recolors with theme changes — no extra CSS required.
 */
export function Icon({
  name,
  size = 'md',
  className,
  ...aria
}: IconProps & (DecorativeProps | MeaningfulProps)) {
  const Svg = ICONS[name];
  const classes = [styles.root, styles[size], className].filter(Boolean).join(' ');
  return <Svg className={classes} role={aria['aria-label'] ? 'img' : undefined} {...aria} />;
}
