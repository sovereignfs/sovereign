'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Drawer,
  ICON_NAMES,
  Icon,
  MobileFooter,
  useOfflineTileState,
  type IconName,
} from '@sovereignfs/ui';
import { isDeviceOnlyTierAvailable } from '@sovereignfs/sdk/device-client';
import styles from './MobileNav.module.css';
import { MobileSearch } from './MobileSearch';
import { useSidebarHydration } from './sidebar-hydration';

interface PluginEntry {
  id: string;
  name: string;
  routePrefix: string;
  iconUrl?: string;
  /** Manifest `offline` tier (research 0012) — drives the drawer item's connectivity-dimmed/capability-restricted states. */
  offline?: 'offline-first' | 'device-only';
}

/**
 * Apps-drawer item, applying the same two offline-tier states as the
 * Launcher's own `PluginTile` (`plugins/launcher/app/_components/PluginTile.tsx`)
 * via the shared `useOfflineTileState` hook — research 0012, epic task 2.33.
 */
function DrawerGridItem({ plugin, onClose }: { plugin: PluginEntry; onClose: () => void }) {
  const deviceOnlyAvailable = isDeviceOnlyTierAvailable();
  const tileState = useOfflineTileState(plugin.offline, deviceOnlyAvailable);

  return (
    <Link
      href={plugin.routePrefix}
      className={[
        styles.drawerGridItem,
        tileState === 'connectivity-dimmed' ? styles.drawerGridItemDimmed : '',
      ]
        .filter(Boolean)
        .join(' ')}
      onClick={onClose}
    >
      <span className={styles.drawerGridIcon} aria-hidden="true">
        {plugin.iconUrl ? (
          <img src={plugin.iconUrl} alt="" className={styles.drawerGridIconImg} />
        ) : (
          monogram(plugin.name)
        )}
      </span>
      <span className={styles.drawerGridName}>{plugin.name}</span>
      {tileState === 'capability-restricted' && (
        <span
          className={styles.drawerGridRestrictedBadge}
          title="Only available on a phone with secure storage set up"
        >
          <Icon name="smartphone" size="sm" aria-hidden />
        </span>
      )}
    </Link>
  );
}

function monogram(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '';
  const [first = '', second = ''] = trimmed.split(/\s+/);
  const initials = second ? first.charAt(0) + second.charAt(0) : first.slice(0, 2);
  return initials.toUpperCase();
}

/** A manifest's `shellConfig.mobileFooterLeftAction.icon` is a plain string
 *  (JSON can't be typed as `IconName` at authoring time) — fall back to a
 *  safe default rather than risk an undefined `Svg` render crash from an
 *  unrecognized name, and warn loudly in dev so the typo gets caught. */
function resolveIconName(icon: string): IconName {
  if ((ICON_NAMES as string[]).includes(icon)) return icon as IconName;
  if (process.env.NODE_ENV !== 'production') {
    console.warn(
      `MobileNav: "${icon}" is not a recognized @sovereignfs/ui icon name ` +
        '(shellConfig.mobileFooterLeftAction.icon) — falling back to "house".',
    );
  }
  return 'house';
}

export function MobileNav({
  plugins,
  launcherIconUrl,
  isAdmin,
  hydrate,
  footerLeftAction,
}: {
  /** Server-rendered plugin list — see `hydrate`'s doc comment for why this
   *  is empty on an offline route's neutral shell. */
  plugins: PluginEntry[];
  launcherIconUrl?: string;
  /** Server-rendered admin status — see `AdminConsoleIcon`'s doc comment for
   *  why this must be `false` on an offline route's neutral shell. */
  isAdmin: boolean;
  /** Restores the real plugin list and admin status client-side for a live
   *  tab on an offline route — see `useSidebarHydration`'s doc comment. */
  hydrate: boolean;
  /** The active plugin's `shellConfig.mobileFooterLeftAction` (resolved
   *  server-side in `layout.tsx` from the per-request header middleware
   *  sets). When present, replaces the footer's default "Home" left icon —
   *  see this component's own doc comment for what happens to Home in that
   *  case. */
  footerLeftAction?: { icon: string; label: string; href: string };
}) {
  const [open, setOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const isHome = pathname === '/';
  const hydrated = useSidebarHydration(hydrate);
  const showConsole = hydrated ? hydrated.isAdmin : isAdmin;
  // Same neutral-shell rule the desktop sidebar's SidebarPluginIcons already
  // follows: the SSR list is a fixed, identical-for-everyone placeholder on
  // an offline route, and must not leak into the drawer/search once a live
  // tab has fetched the real, personalized list. The hydration API doesn't
  // carry `offline` tier, so a hydrated tile never shows the
  // connectivity-dimmed/capability-restricted state — the same limitation
  // the desktop hydrated icons already accept.
  const effectivePlugins: PluginEntry[] = hydrated
    ? hydrated.plugins.map((p) => ({
        id: p.id,
        name: p.name,
        routePrefix: p.routePrefix,
        iconUrl: p.iconUrl,
      }))
    : plugins;

  return (
    <>
      <MobileFooter
        className={styles.footer}
        data-mobile-footer
        onOpenApps={() => setOpen(true)}
        launcherOpen={open}
        launcherIcon={
          launcherIconUrl ? (
            <img src={launcherIconUrl} alt="" aria-hidden className={styles.navIcon} />
          ) : undefined
        }
        leftIcons={[
          footerLeftAction
            ? {
                // Same client-side-nav reasoning as the default Home icon
                // below — onClick + router.push, not a bare href/<a>.
                icon: <Icon name={resolveIconName(footerLeftAction.icon)} size="md" aria-hidden />,
                label: footerLeftAction.label,
                active: pathname === footerLeftAction.href,
                onClick: () => router.push(footerLeftAction.href),
              }
            : {
                // A plain onClick + router.push (rather than FooterIcon's `href`,
                // which renders a bare <a>) preserves next/link's client-side
                // navigation instead of a full page reload.
                icon: <Icon name="house" size="md" aria-hidden />,
                label: 'Home',
                active: isHome,
                onClick: () => router.push('/'),
              },
        ]}
        rightIcons={[
          {
            icon: <Icon name="search" size="md" aria-hidden />,
            label: 'Search',
            active: searchOpen,
            onClick: () => setSearchOpen(true),
          },
        ]}
      />

      <MobileSearch
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        plugins={effectivePlugins}
      />

      <Drawer open={open} onClose={() => setOpen(false)} aria-label="App navigation">
        <nav aria-label="Installed plugins">
          <ul className={styles.drawerGrid}>
            {/* Only present when the footer's own left icon no longer points
                home (footerLeftAction active) — every other plugin already
                has one tap to Home via the footer, so adding this
                unconditionally would be a redundant, unrequested nav item
                for plugins that never touch this feature. */}
            {footerLeftAction && (
              <li>
                <Link href="/" className={styles.drawerGridItem} onClick={() => setOpen(false)}>
                  <span
                    className={`${styles.drawerGridIcon} ${styles.drawerGridIconSettings}`}
                    aria-hidden="true"
                  >
                    <Icon name="house" size="md" aria-hidden />
                  </span>
                  <span className={styles.drawerGridName}>Home</span>
                </Link>
              </li>
            )}
            {effectivePlugins.map((plugin) => (
              <li key={plugin.id}>
                <DrawerGridItem plugin={plugin} onClose={() => setOpen(false)} />
              </li>
            ))}
            {showConsole && (
              <li>
                <Link
                  href="/console"
                  className={styles.drawerGridItem}
                  onClick={() => setOpen(false)}
                >
                  <span
                    className={`${styles.drawerGridIcon} ${styles.drawerGridIconSettings}`}
                    aria-hidden="true"
                  >
                    <Icon name="settings" size="md" aria-hidden />
                  </span>
                  <span className={styles.drawerGridName}>Console</span>
                </Link>
              </li>
            )}
          </ul>
        </nav>
      </Drawer>
    </>
  );
}
