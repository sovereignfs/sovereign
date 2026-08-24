import type { ButtonHTMLAttributes, CSSProperties, HTMLAttributes, ReactNode } from 'react';
import { Icon } from '../Icon/Icon';
import type { IconName } from '../Icon/Icon';
import styles from './CardTile.module.css';

export interface CardTileGridProps {
  children: ReactNode;
  /** Minimum tile width (px) before the grid wraps to fewer columns. */
  minTileWidth?: number;
  className?: string;
}

/** Responsive grid of `CardTile`/`NewCardTile` children — `repeat(auto-fill, minmax(minTileWidth, 1fr))`. */
export function CardTileGrid({ children, minTileWidth = 200, className }: CardTileGridProps) {
  const style = { '--sv-card-tile-min-width': `${minTileWidth}px` } as CSSProperties;
  return (
    <div className={[styles.grid, className].filter(Boolean).join(' ')} style={style}>
      {children}
    </div>
  );
}

export interface CardTileProps extends HTMLAttributes<HTMLDivElement> {
  /** Content centered in the tile's full-bleed top banner — typically an `<Icon>`. Omit for a plain strip. */
  banner?: ReactNode;
  /** Banner background color (applied inline). Falls back to a neutral sunken-surface strip when omitted. */
  bannerColor?: string;
  /** Tile footer content — typically the item's name. */
  children: ReactNode;
}

/**
 * A colored/iconed banner over a footer label — a card shape `Card` can't
 * express, since `Card`'s `padding` prop always pads its single box with no
 * way for a top region to bleed to the edges. Not link-aware: wrap it in the
 * host framework's own link component (e.g. Next's `<Link>`) to make it
 * navigable, same as every existing consumer of this pattern does.
 */
export function CardTile({ banner, bannerColor, children, className, ...rest }: CardTileProps) {
  return (
    <div className={[styles.tile, className].filter(Boolean).join(' ')} {...rest}>
      <div
        className={styles.banner}
        aria-hidden="true"
        style={bannerColor ? { backgroundColor: bannerColor } : undefined}
      >
        {banner}
      </div>
      <div className={styles.footer}>{children}</div>
    </div>
  );
}

export interface NewCardTileProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Icon shown beside the label. Defaults to `"plus"`. */
  icon?: IconName;
  label: string;
}

/** Dashed ghost tile matching a real `CardTile`'s footprint — the grid's own "add new" affordance. */
export function NewCardTile({
  icon = 'plus',
  label,
  type = 'button',
  className,
  ...rest
}: NewCardTileProps) {
  return (
    <button type={type} className={[styles.newTile, className].filter(Boolean).join(' ')} {...rest}>
      <Icon name={icon} size="sm" aria-hidden={true} />
      {label}
    </button>
  );
}
