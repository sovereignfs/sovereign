'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Drawer, Icon } from '@sovereignfs/ui';
import styles from './MobileNav.module.css';
import { MobileSearch } from './MobileSearch';

interface PluginEntry {
  id: string;
  name: string;
  routePrefix: string;
  iconUrl?: string;
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
}: {
  plugins: PluginEntry[];
  launcherIconUrl?: string;
}) {
  const [open, setOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const pathname = usePathname();
  const isHome = pathname === '/';

  return (
    <>
      <nav className={styles.footer} aria-label="App navigation">
        <Link
          href="/"
          className={`${styles.navItem} ${isHome ? styles.navItemActive : ''}`}
          aria-label="Home"
        >
          <Icon name="house" size="md" aria-hidden />
        </Link>
        <button
          type="button"
          className={`${styles.navItem} ${styles.navItemApps} ${open ? styles.navItemAppsOpen : ''}`}
          aria-label="Apps"
          aria-expanded={open}
          aria-haspopup="dialog"
          onClick={() => setOpen(true)}
        >
          {launcherIconUrl ? (
            <img src={launcherIconUrl} alt="" aria-hidden className={styles.navIcon} />
          ) : (
            <Icon name="grid-2x2" size="md" aria-hidden />
          )}
        </button>
        <button
          type="button"
          className={`${styles.navItem} ${searchOpen ? styles.navItemActive : ''}`}
          aria-label="Search"
          aria-expanded={searchOpen}
          aria-haspopup="dialog"
          onClick={() => setSearchOpen(true)}
        >
          <Icon name="search" size="md" aria-hidden />
        </button>
      </nav>

      <MobileSearch open={searchOpen} onClose={() => setSearchOpen(false)} plugins={plugins} />

      <Drawer open={open} onClose={() => setOpen(false)} aria-label="App navigation">
        <div className={styles.handle} aria-hidden="true" />
        <div className={styles.drawerHeader}>
          <span className={styles.drawerTitle}>Apps</span>
          <button
            type="button"
            className={styles.drawerClose}
            aria-label="Close navigation"
            onClick={() => setOpen(false)}
          >
            <Icon name="x" size="sm" aria-hidden />
          </button>
        </div>
        <nav aria-label="Installed plugins">
          <ul className={styles.drawerGrid}>
            {plugins.map((plugin) => (
              <li key={plugin.id}>
                <Link
                  href={plugin.routePrefix}
                  className={styles.drawerGridItem}
                  onClick={() => setOpen(false)}
                >
                  <span className={styles.drawerGridIcon} aria-hidden="true">
                    {plugin.iconUrl ? (
                      <img src={plugin.iconUrl} alt="" className={styles.drawerGridIconImg} />
                    ) : (
                      monogram(plugin.name)
                    )}
                  </span>
                  <span className={styles.drawerGridName}>{plugin.name}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </Drawer>
    </>
  );
}
