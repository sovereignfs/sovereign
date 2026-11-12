import type { ReactNode } from 'react';
import styles from './AppTile.module.css';

export interface AppTileProps {
  /** The tile's picture, centred in a rounded box: an `<Icon>`, an `<Avatar>`, or an image. */
  icon: ReactNode;
  /** The app's name. */
  name: string;
  /** One or two lines saying what it is. */
  description?: string;
  /** What kind of thing it is, as small labels beneath a divider — typically `<Badge variant="mono">`. Omit for no footer. */
  tags?: ReactNode;
  /** Makes the whole tile one link. Without it the tile is a plain box. The tile never imports a router: pass the address, or wrap it yourself. */
  href?: string;
  /** `ghost` is a dashed, flat tile for adding another one: the same size as the others, so it sits in the grid as an empty place. */
  variant?: 'solid' | 'ghost';
  className?: string;
}

/**
 * AppTile — one app in a grid: a rounded icon box, the name, a line about it and, beneath a divider, what kind of app it is. The
 * whole tile is the link when `href` is given. Lay tiles out with `CardTileGrid`.
 */
export function AppTile({
  icon,
  name,
  description,
  tags,
  href,
  variant = 'solid',
  className,
}: AppTileProps) {
  const classes = [styles.tile, variant === 'ghost' && styles.ghost, href && styles.link, className]
    .filter(Boolean)
    .join(' ');
  const content = (
    <>
      <span className={styles.icon} aria-hidden="true">
        {icon}
      </span>
      <span className={styles.name}>{name}</span>
      {description ? (
        <span className={styles.description}>{description}</span>
      ) : (
        <span className={styles.fill} />
      )}
      {tags ? (
        <>
          <span className={styles.separator} aria-hidden="true" />
          <span className={styles.tags}>{tags}</span>
        </>
      ) : null}
    </>
  );
  return href ? (
    <a className={classes} href={href}>
      {content}
    </a>
  ) : (
    <div className={classes}>{content}</div>
  );
}
