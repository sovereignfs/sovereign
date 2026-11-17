import type { ReactNode } from 'react';
import { Icon } from '../Icon/Icon';
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
  /**
   * The link leads to another site: it opens in a new tab, without telling the site where it came from
   * (`noopener noreferrer`), and the tile says so with a small mark beside the name and to assistive tech.
   */
  external?: boolean;
  /** Draws the picture in shades of grey, so tiles whose icons come from elsewhere still look like one set. */
  monochrome?: boolean;
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
  external = false,
  monochrome = false,
  className,
}: AppTileProps) {
  const opensElsewhere = external && href !== undefined;
  const classes = [
    styles.tile,
    variant === 'ghost' && styles.ghost,
    href && styles.link,
    monochrome && styles.monochrome,
    className,
  ]
    .filter(Boolean)
    .join(' ');
  const content = (
    <>
      <span className={styles.icon} aria-hidden="true">
        {icon}
      </span>
      <span className={styles.name}>
        {name}
        {opensElsewhere ? (
          <>
            <Icon name="external-link" size="sm" aria-hidden={true} className={styles.external} />
            <span className={styles.hidden}> (opens in a new tab)</span>
          </>
        ) : null}
      </span>
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
    <a
      className={classes}
      href={href}
      {...(opensElsewhere ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
    >
      {content}
    </a>
  ) : (
    <div className={classes}>{content}</div>
  );
}
