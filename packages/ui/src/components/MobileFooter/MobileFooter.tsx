import type { HTMLAttributes, ReactNode } from 'react';
import { Icon } from '../Icon/Icon';
import styles from './MobileFooter.module.css';

export interface FooterIcon {
  icon: ReactNode;
  label: string;
  href?: string;
  onClick?: () => void;
  active?: boolean;
}

export interface MobileFooterProps extends HTMLAttributes<HTMLElement> {
  /** Opens the app drawer/launcher. Always rendered as the centered slot;
   * not overridable. */
  onOpenApps: () => void;
  /** Custom launcher icon (e.g. a plugin-supplied image). Defaults to a
   * generic grid icon. */
  launcherIcon?: ReactNode;
  /** Whether the launcher's own drawer is currently open (applies the
   * pressed/active visual state). */
  launcherOpen?: boolean;
  /** 1 or 2 icons rendered to the left of the centered launcher. */
  leftIcons: FooterIcon[];
  /** 1 or 2 icons rendered to the right of the centered launcher. Must match
   * `leftIcons.length` — the launcher stays visually centered, so a mismatch
   * is flagged (dev-mode only, never thrown) rather than silently allowed. */
  rightIcons: FooterIcon[];
}

function FooterNavItem({ icon, label, href, onClick, active }: FooterIcon) {
  const className = [styles.navItem, active ? styles.navItemActive : ''].filter(Boolean).join(' ');
  if (href) {
    return (
      <a
        href={href}
        className={className}
        aria-label={label}
        aria-current={active ? 'page' : undefined}
      >
        {icon}
      </a>
    );
  }
  return (
    <button type="button" className={className} aria-label={label} onClick={onClick}>
      {icon}
    </button>
  );
}

/**
 * The mobile footer bar: a centered, fixed "Apps" launcher flanked by 1 or 2
 * overridable icons on each side (3 or 5 total, matching standard
 * iOS/Android bottom-nav conventions). Owns its own chrome — background,
 * border-top, safe-area-aware bottom padding, and a 768px max-width (so it
 * never stretches full-bleed if mounted outside an actual mobile viewport)
 * — matching the runtime shell's own mobile footer (MobileNav) exactly,
 * since this component is meant to replace that hand-rolled markup.
 * Presentational only — no data fetching; the consumer owns the
 * drawer/overlay `onOpenApps` opens. See RFC 0088 for the
 * immutable/overridable boundary this enforces.
 */
export function MobileFooter({
  onOpenApps,
  launcherIcon,
  launcherOpen,
  leftIcons,
  rightIcons,
  className,
  ...rest
}: MobileFooterProps) {
  if (process.env.NODE_ENV !== 'production' && leftIcons.length !== rightIcons.length) {
    console.error(
      `MobileFooter: leftIcons (${leftIcons.length}) and rightIcons (${rightIcons.length}) ` +
        'must have the same length so the launcher stays visually centered.',
    );
  }

  const cls = [styles.footer, className].filter(Boolean).join(' ');
  const launcherClassName = [
    styles.navItem,
    styles.navItemApps,
    launcherOpen ? styles.navItemAppsOpen : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <nav {...rest} className={cls} aria-label="App navigation">
      {leftIcons.map((item) => (
        <FooterNavItem key={item.label} {...item} />
      ))}
      <button
        type="button"
        className={launcherClassName}
        aria-label="Apps"
        aria-expanded={launcherOpen}
        aria-haspopup="dialog"
        onClick={onOpenApps}
      >
        {launcherIcon ?? <Icon name="grid-2x2" size="md" aria-hidden />}
      </button>
      {rightIcons.map((item) => (
        <FooterNavItem key={item.label} {...item} />
      ))}
    </nav>
  );
}
