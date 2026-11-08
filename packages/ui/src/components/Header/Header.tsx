import type { HTMLAttributes, ReactNode } from 'react';
import styles from './Header.module.css';

export interface HeaderPlugin {
  /** Plugin display name, rendered next to its icon. */
  name: string;
  /** Plugin icon — already sized (28px) and built by the consumer (typically
   * an `<img src="/plugin-icons/<id>.svg">`), matching `MobileHeader`'s own
   * router-agnostic convention for icon-shaped slots. */
  icon?: ReactNode;
  /** Where the plugin name/icon links to — typically the plugin's own
   * `routePrefix`. Omit to render plain (non-interactive) text instead of a
   * link — e.g. a plugin's own home page linking to itself would be a no-op. */
  href?: string;
}

export interface HeaderProps extends HTMLAttributes<HTMLElement> {
  /** Instance name — derives the brand badge's initial (its first character,
   * uppercased) and the badge's accessible label. Does not render as text
   * anywhere in this component (unlike `MobileHeader`'s optional `title`). */
  instanceName: string;
  /** Optional instance logo image; falls back to `instanceName`'s initial
   * (matching the runtime shell's own sidebar/mobile-header fallback). */
  instanceLogoUrl?: string;
  /** Where the brand badge links — typically the Launcher plugin's route. */
  homeHref: string;
  /** The active plugin, rendered next to the brand badge. Omit for a page
   * with no single active plugin (e.g. the Launcher itself). */
  plugin?: HeaderPlugin;
  /** Before the brand badge, at the far left: an app's own control, such as
   * the button that opens and closes its sidebar. Omit for none. */
  leading?: ReactNode;
  /** Apps launcher trigger — already wired by the consumer (icon button plus
   * whatever popover/drawer it opens). This component owns layout only,
   * never launcher/notification/account interaction logic. Omit it for an
   * app that runs on its own, with no instance's apps to switch to. */
  launcher?: ReactNode;
  /** Notification bell trigger. Same "just an icon slot" boundary as
   * `MobileHeader`'s own `bell` prop. Omit until there is one to show. */
  notifications?: ReactNode;
  /** Avatar / account menu trigger. Omit until there is one to show. */
  avatarMenu?: ReactNode;
}

/**
 * The web top-bar header: brand badge (+ optional active plugin) on the
 * left, launcher · notifications · avatar menu on the right. This is the
 * `shell: minimal` counterpart to the runtime shell's own sidebar — a plugin
 * that owns its whole viewport (no platform sidebar) renders this instead,
 * the same way it renders `MobileHeader` in place of the platform's mobile
 * chrome. Extracted into a shared component so a `shell: minimal` plugin
 * doesn't have to hand-roll its own top bar from scratch.
 *
 * Presentational only — no data fetching, no account/notification/launcher
 * logic of its own. `launcher`/`notifications`/`avatarMenu` are supplied
 * fully built, exactly like `MobileHeader`'s `bell`/`avatarMenu`: this
 * component stays router-agnostic and interaction-agnostic, and never
 * duplicates a real `AccountMenu`/notification-panel/apps-switcher
 * implementation. Every slot on the right is optional, so an app that runs
 * on its own (with no launcher, say) uses this header too.
 */
export function Header({
  instanceName,
  instanceLogoUrl,
  homeHref,
  plugin,
  leading,
  launcher,
  notifications,
  avatarMenu,
  className,
  ...rest
}: HeaderProps) {
  const brandInitial = instanceName.charAt(0).toUpperCase() || 'S';
  const cls = [styles.header, className].filter(Boolean).join(' ');

  return (
    <header className={cls} {...rest}>
      <div className={styles.left}>
        {leading}
        <a href={homeHref} className={styles.brandBadge} aria-label={`${instanceName} home`}>
          {instanceLogoUrl ? (
            <img src={instanceLogoUrl} alt="" className={styles.brandLogoImg} />
          ) : (
            brandInitial
          )}
        </a>
        {plugin &&
          (plugin.href ? (
            <a href={plugin.href} className={styles.plugin}>
              {plugin.icon}
              <span className={styles.pluginName}>{plugin.name}</span>
            </a>
          ) : (
            <span className={styles.plugin}>
              {plugin.icon}
              <span className={styles.pluginName}>{plugin.name}</span>
            </span>
          ))}
      </div>
      <div className={styles.right}>
        {launcher}
        {notifications}
        {avatarMenu}
      </div>
    </header>
  );
}
