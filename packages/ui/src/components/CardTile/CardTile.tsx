import type { ButtonHTMLAttributes, CSSProperties, HTMLAttributes, ReactNode } from 'react';
import { Icon } from '../Icon/Icon';
import type { IconName } from '../Icon/Icon';
import styles from './CardTile.module.css';

export interface CardTileGridProps {
  children: ReactNode;
  /** Minimum tile width (px) before the grid wraps to fewer columns. */
  minTileWidth?: number;
  className?: string;
  /**
   * Tight spacing with tiles that keep their natural width instead of
   * stretching to fill the row — for small `variant="icon"` tiles (e.g. a
   * folder grid), where the default grid's spacious gap and `1fr`-stretched
   * columns leave a lot of empty space around a tile that's really just an
   * icon + short label.
   */
  dense?: boolean;
}

/** Responsive grid of `CardTile`/`NewCardTile` children — `repeat(auto-fill, minmax(minTileWidth, 1fr))`, or `minmax(minTileWidth, max-content)` with a tighter gap when `dense`. */
export function CardTileGrid({
  children,
  minTileWidth = 200,
  className,
  dense = false,
}: CardTileGridProps) {
  const style = { '--sv-card-tile-min-width': `${minTileWidth}px` } as CSSProperties;
  return (
    <div
      className={[styles.grid, dense && styles.gridDense, className].filter(Boolean).join(' ')}
      style={style}
    >
      {children}
    </div>
  );
}

export interface CardTileProps extends HTMLAttributes<HTMLDivElement> {
  /** Content centered in the tile's full-bleed top banner — typically an `<Icon>`. Omit for a plain strip. */
  banner?: ReactNode;
  /** Banner background color (applied inline). Falls back to a neutral sunken-surface strip when omitted. Ignored by `variant="icon"`, which has no banner box. */
  bannerColor?: string;
  /** Tile footer content — typically the item's name. */
  children: ReactNode;
  /**
   * `"card"` (default): a bordered card with a colored/iconed banner strip
   * over a footer label. `"icon"`: a plain "Finder icon" tile — no card
   * chrome at all, just a large centered icon with a label beneath it. Use
   * `"icon"` for entities that read as a single glyph + name (e.g. a
   * folder), where a bordered card reads as heavier than the content needs.
   */
  variant?: 'card' | 'icon';
}

/**
 * A colored/iconed banner over a footer label — a card shape `Card` can't
 * express, since `Card`'s `padding` prop always pads its single box with no
 * way for a top region to bleed to the edges. Not link-aware: wrap it in the
 * host framework's own link component (e.g. Next's `<Link>`) to make it
 * navigable, same as every existing consumer of this pattern does.
 */
export function CardTile({
  banner,
  bannerColor,
  children,
  className,
  variant = 'card',
  ...rest
}: CardTileProps) {
  const isIcon = variant === 'icon';
  return (
    <div
      className={[styles.tile, isIcon && styles.tileIcon, className].filter(Boolean).join(' ')}
      {...rest}
    >
      <div
        className={styles.banner}
        aria-hidden="true"
        style={!isIcon && bannerColor ? { backgroundColor: bannerColor } : undefined}
      >
        {banner}
      </div>
      <div className={styles.footer}>{children}</div>
    </div>
  );
}

export interface NewCardTileProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Icon shown beside the label (`"card"`) or alone (`"icon"`). Defaults to `"plus"`. */
  icon?: IconName;
  /** Visible next to the icon for `"card"`. For `"icon"`, not rendered as text — used as the button's `aria-label` instead, since the tile is icon-only. */
  label: string;
  /**
   * `"card"` (default): a dashed box matching a `variant="card"` `CardTile`'s
   * footprint — icon beside a visible label. `"icon"`: matches a
   * `variant="icon"` `CardTile`'s footprint instead, but icon-only, no
   * visible label — a plain "+" reads as self-explanatory once every
   * sibling tile in the same `dense` grid is already an unlabeled icon
   * (the dashed border alone marks it as the "add new" affordance).
   */
  variant?: 'card' | 'icon';
}

/** Dashed ghost tile matching a real `CardTile`'s footprint — the grid's own "add new" affordance. */
export function NewCardTile({
  icon = 'plus',
  label,
  type = 'button',
  variant = 'card',
  className,
  ...rest
}: NewCardTileProps) {
  const isIcon = variant === 'icon';
  return (
    <button
      type={type}
      className={[styles.newTile, isIcon && styles.newTileIcon, className]
        .filter(Boolean)
        .join(' ')}
      {...rest}
      aria-label={isIcon ? label : undefined}
    >
      <Icon name={icon} size={isIcon ? 'md' : 'sm'} aria-hidden={true} />
      {!isIcon && label}
    </button>
  );
}
