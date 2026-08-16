'use client';

import { useRef, type HTMLAttributes, type ReactNode } from 'react';
import { usePublishShellChromeHeight } from '../../hooks/usePublishShellChromeHeight';
import styles from './MobileHeader.module.css';

export interface MobileHeaderProps extends HTMLAttributes<HTMLDivElement> {
  /** The brand/logo element — already a complete, clickable link home (e.g. an
   * instance logo wrapped in the consumer's own router `Link`). Always
   * rendered. `MobileHeader` stays router-agnostic, so this is provided
   * fully built rather than as a bare icon + href. Optional — omit it to get
   * a default "S" badge (matching the runtime shell's own fallback brand
   * icon when no instance logo is configured), sized and styled to the same
   * 36px/radius-md convention a custom logo is expected to follow. */
  logo?: ReactNode;
  /** Optional contextual title rendered beside the logo (e.g. the active
   * plugin's name). Absent by default — this is the one overridable part of
   * the header. See RFC 0088. */
  title?: string;
  /** Notification bell — always rendered; not overridable.
   * TODO: this is just an icon slot today (the consumer wires up its own
   * click handler/content) — it doesn't yet accommodate a full notification
   * feature (unread badge, dropdown panel, etc. — see the runtime shell's
   * own NotificationBell). Deferred; revisit once a plugin actually needs
   * more than a bare bell icon here. */
  bell: ReactNode;
  /** Avatar / account menu trigger — always rendered; not overridable. */
  avatarMenu: ReactNode;
}

/** Default fallback logo — matches the runtime shell's own .mobileBrandIcon
 *  exactly (36px, radius-md, accent background) for the "no instance logo
 *  configured" case, just with a fixed "S" instead of the instance name's
 *  first letter (this component can't know the instance name — no data
 *  fetching, see the component's own doc comment). */
function DefaultLogo() {
  return (
    <span className={styles.defaultLogo} aria-hidden="true">
      S
    </span>
  );
}

/**
 * The mobile header bar: brand/logo (always shown), an optional contextual
 * title, and a fixed bell + avatar-menu cluster. Owns its own chrome —
 * background, border-bottom, sticky positioning, safe-area-aware padding,
 * and a 768px max-width (so it never stretches full-bleed if mounted outside
 * an actual mobile viewport) — matching the runtime shell's own mobile
 * header exactly, since this component is meant to replace that hand-rolled
 * markup. Presentational only — no data fetching; the consumer supplies
 * `bell`/`avatarMenu` (and, optionally, `logo`) as already-wired components
 * (their own sizing — 36px logo/avatar, 44px bell tap target — is the
 * consumer's responsibility, matching the reference implementation in the
 * runtime shell). See RFC 0088 for the immutable/overridable boundary this
 * enforces.
 *
 * Self-measures its own rendered height and publishes it as
 * `--sv-shell-header-height` on the shell root — see
 * `usePublishShellChromeHeight`'s own doc comment for why this exists (it's
 * what makes a self-rendered header, the `shellConfig.mobileHeader: false`
 * pattern, correctly position `Dialog`'s inset and any other consumer of
 * that variable instead of being overlapped by it).
 */
export function MobileHeader({
  logo,
  title,
  bell,
  avatarMenu,
  className,
  ...rest
}: MobileHeaderProps) {
  const headerRef = useRef<HTMLDivElement>(null);
  usePublishShellChromeHeight(headerRef, '--sv-shell-header-height');

  const cls = [styles.header, className].filter(Boolean).join(' ');

  return (
    <div className={cls} {...rest} ref={headerRef}>
      <div className={styles.brandGroup}>
        {logo ?? <DefaultLogo />}
        {title && <span className={styles.title}>{title}</span>}
      </div>
      <div className={styles.right}>
        {bell}
        {avatarMenu}
      </div>
    </div>
  );
}
