'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Drawer, Icon } from '@sovereignfs/ui';
import styles from './MobileNav.module.css';

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

/**
 * Mobile-only footer bar + plugin-navigation Drawer (RFC 0013). The footer
 * renders a single "Apps" action button; tapping it opens a dismissable
 * bottom Drawer listing installed (non-chrome) plugins. Navigating to a plugin
 * dismisses the Drawer automatically.
 */
export function MobileNav({ plugins }: { plugins: PluginEntry[] }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <nav className={styles.footer} aria-label="Plugin navigation">
        <button
          type="button"
          className={styles.appsButton}
          aria-label="Open app navigation"
          aria-expanded={open}
          aria-haspopup="dialog"
          onClick={() => setOpen(true)}
        >
          <Icon name="grid-2x2" size="md" aria-hidden />
          <span className={styles.appsLabel}>Apps</span>
        </button>
      </nav>

      <Drawer open={open} onClose={() => setOpen(false)} aria-label="Plugin navigation">
        <div className={styles.drawerHeader}>
          <span className={styles.drawerTitle}>Apps</span>
          <button
            type="button"
            className={styles.drawerClose}
            aria-label="Close navigation"
            onClick={() => setOpen(false)}
          >
            <Icon name="x" size="md" aria-hidden />
          </button>
        </div>
        <nav aria-label="Installed plugins">
          <ul className={styles.drawerList}>
            {plugins.map((plugin) => (
              <li key={plugin.id}>
                <Link
                  href={plugin.routePrefix}
                  className={styles.drawerItem}
                  onClick={() => setOpen(false)}
                >
                  <span className={styles.drawerIcon} aria-hidden="true">
                    {plugin.iconUrl ? (
                      <img src={plugin.iconUrl} alt="" className={styles.drawerIconImg} />
                    ) : (
                      monogram(plugin.name)
                    )}
                  </span>
                  <span className={styles.drawerItemName}>{plugin.name}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </Drawer>
    </>
  );
}
