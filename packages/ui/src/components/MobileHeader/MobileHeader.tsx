import type { HTMLAttributes, ReactNode } from 'react';
import styles from './MobileHeader.module.css';

export interface MobileHeaderProps extends HTMLAttributes<HTMLDivElement> {
  /** The brand/logo element — already a complete, clickable link home (e.g. an
   * instance logo wrapped in the consumer's own router `Link`). Always
   * rendered; not overridable. `MobileHeader` stays router-agnostic, so this
   * is provided fully built rather than as a bare icon + href. */
  logo: ReactNode;
  /** Optional contextual title rendered beside the logo (e.g. the active
   * plugin's name). Absent by default — this is the one overridable part of
   * the header. See RFC 0088. */
  title?: string;
  /** Notification bell — always rendered; not overridable. */
  bell: ReactNode;
  /** Avatar / account menu trigger — always rendered; not overridable. */
  avatarMenu: ReactNode;
}

/**
 * The mobile header's content row: brand/logo (always shown), an optional
 * contextual title, and a fixed bell + avatar-menu cluster. Presentational
 * only — no data fetching. The consumer (typically the runtime shell) owns
 * placement within its own page layout (sticky positioning, safe-area
 * padding, grid placement) and supplies `bell`/`avatarMenu` as already-wired
 * components. See RFC 0088 for the immutable/overridable boundary this
 * enforces.
 */
export function MobileHeader({
  logo,
  title,
  bell,
  avatarMenu,
  className,
  ...rest
}: MobileHeaderProps) {
  const cls = [styles.header, className].filter(Boolean).join(' ');

  return (
    <div className={cls} {...rest}>
      <div className={styles.brandGroup}>
        {logo}
        {title && <span className={styles.title}>{title}</span>}
      </div>
      <div className={styles.right}>
        {bell}
        {avatarMenu}
      </div>
    </div>
  );
}
