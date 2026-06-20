'use client';

import { usePathname } from 'next/navigation';
import styles from './ActivePluginTitle.module.css';

interface PluginEntry {
  routePrefix: string;
  name: string;
}

/**
 * Resolves the active plugin's display name from the current pathname (via
 * the registry snapshot passed down from the server layout) and renders it as
 * the mobile header's contextual title (RFC 0013). Matches the longest
 * routePrefix that is a prefix of the current path so nested routes resolve
 * correctly. Renders nothing when no plugin matches (e.g. on the root `/`).
 */
export function ActivePluginTitle({ plugins }: { plugins: PluginEntry[] }) {
  const pathname = usePathname();
  // Longest-match: find the plugin whose routePrefix is the longest prefix of
  // the current pathname (prevents `/` matching everything).
  let best: PluginEntry | null = null;
  for (const plugin of plugins) {
    const prefix = plugin.routePrefix === '/' ? '/' : plugin.routePrefix.replace(/\/$/, '');
    if (pathname === prefix || pathname.startsWith(prefix + '/')) {
      if (!best || plugin.routePrefix.length > best.routePrefix.length) {
        best = plugin;
      }
    }
  }
  if (!best) return null;
  return <span className={styles.title}>{best.name}</span>;
}
