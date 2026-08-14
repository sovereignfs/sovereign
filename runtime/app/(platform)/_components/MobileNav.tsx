'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Drawer, Icon, MobileFooter, useOfflineTileState } from '@sovereignfs/ui';
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

export function MobileNav({
  plugins,
  launcherIconUrl,
  isAdmin,
  hydrate,
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
          {
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
