'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { EmptyState, Spinner } from '@sovereignfs/ui';
import { offline } from '@sovereignfs/sdk/offline';
import { PluginDirectorySection, type DirectoryPlugin } from './PluginDirectorySection';
import { PluginGrid } from './PluginGrid';
import { SearchableGrid } from './SearchableGrid';
import type { PluginTileData } from './PluginTile';
import styles from '../launcher.module.css';

export const LAUNCHER_PLUGIN_ID = 'fs.sovereign.launcher';

interface LauncherPlugin extends PluginTileData {
  adminOnly: boolean;
}

interface CachedLauncherData {
  plugins: LauncherPlugin[];
}

interface Directory {
  eligible: DirectoryPlugin[];
  enabled: DirectoryPlugin[];
}

type State =
  | { status: 'loading' }
  | { status: 'unavailable-offline' }
  | { status: 'loaded'; plugins: LauncherPlugin[] };

/**
 * Offline-capable Launcher home (RFC 0078 — `manifest.json` declares
 * `offline: true`). `page.tsx` renders the user-neutral shell; all
 * data-fetching happens here, client-side, mirroring Shopper's
 * `OfflineListView` pattern: render whatever `sdk.offline` has cached
 * immediately (works with no network), then always attempt a fresh fetch —
 * it succeeds online (updating the view and the cache for next time) and
 * simply fails offline, leaving the cached render in place.
 *
 * The self-service directory section is a separate, uncached, online-only
 * enhancement: fetched every time but never mirrored into `sdk.offline`,
 * since browsing plugins you haven't installed isn't useful offline anyway —
 * it just doesn't render when its own fetch hasn't succeeded (offline or
 * otherwise), same as before this route existed.
 *
 * No separate admin-capability check is needed for the admin plugin section:
 * `/api/plugins` (`selectLauncherPlugins`) already filters `adminOnly`
 * plugins server-side, so a non-empty admin slice is already proof the
 * caller is an admin.
 */
export function LauncherOfflineView() {
  const [state, setState] = useState<State>({ status: 'loading' });
  const [directory, setDirectory] = useState<Directory | null>(null);

  useEffect(() => {
    let cancelled = false;

    offline
      .get<CachedLauncherData>(LAUNCHER_PLUGIN_ID, 'plugins')
      .then((cached) => {
        if (cancelled || !cached) return;
        setState((s) =>
          s.status === 'loading' ? { status: 'loaded', plugins: cached.plugins } : s,
        );
      })
      .catch(() => {
        // IndexedDB unavailable or otherwise failed to read — the fetch
        // below still determines the actual render; nothing to do here.
      });

    (async () => {
      try {
        const [pluginsRes, directoryRes] = await Promise.all([
          fetch('/api/plugins'),
          fetch('/api/plugins/directory'),
        ]);
        if (!pluginsRes.ok) throw new Error(`Failed to fetch plugins: ${pluginsRes.status}`);
        const data = (await pluginsRes.json()) as { plugins: LauncherPlugin[] };
        if (cancelled) return;
        setState({ status: 'loaded', plugins: data.plugins });
        await offline.set<CachedLauncherData>(LAUNCHER_PLUGIN_ID, 'plugins', {
          plugins: data.plugins,
        });

        if (directoryRes.ok) {
          const dirData = (await directoryRes.json()) as { directory: Directory | null };
          if (!cancelled) setDirectory(dirData.directory);
        }
      } catch {
        // No network (or the request otherwise failed). If something's
        // already rendered (cache read above), leave it as-is; only fall
        // back to the empty state when there's truly nothing to show.
        if (cancelled) return;
        setState((s) => (s.status === 'loading' ? { status: 'unavailable-offline' } : s));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (state.status === 'loading') {
    return (
      <div className={styles.launcher}>
        <div className={styles.header}>
          <h1 className={styles.title}>Home</h1>
          <p className={styles.subtitle}>Your installed apps and tools.</p>
        </div>
        <div className={styles.loadingWrap}>
          <Spinner size="lg" label="Loading apps…" />
        </div>
      </div>
    );
  }

  if (state.status === 'unavailable-offline') {
    return (
      <div className={styles.launcher}>
        <div className={styles.header}>
          <h1 className={styles.title}>Home</h1>
          <p className={styles.subtitle}>Your installed apps and tools.</p>
        </div>
        <EmptyState
          icon="alert-triangle"
          heading="Not available offline yet"
          description="Open the app once online to make your Home screen available with no connection."
        />
      </div>
    );
  }

  const { plugins } = state;
  const mainPlugins = plugins.filter((p) => !p.adminOnly);
  const adminPlugins = plugins.filter((p) => p.adminOnly);

  if (plugins.length === 0) {
    return (
      <div className={styles.launcher}>
        <div className={styles.header}>
          <h1 className={styles.title}>Home</h1>
          <p className={styles.subtitle}>Your installed apps and tools.</p>
        </div>
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>No apps installed yet</p>
          <p className={styles.emptyText}>
            Ask an administrator to install apps for this workspace, or visit{' '}
            <Link href="/console/plugins" className={styles.emptyLink}>
              Console
            </Link>{' '}
            if you have access.
          </p>
        </div>

        {directory && (
          <PluginDirectorySection eligible={directory.eligible} enabled={directory.enabled} />
        )}
      </div>
    );
  }

  return (
    <div className={styles.launcher}>
      <SearchableGrid plugins={mainPlugins} total={plugins.length} />

      {adminPlugins.length > 0 && (
        <section className={styles.adminSection}>
          <h2 className={styles.sectionTitle}>Admin</h2>
          <PluginGrid plugins={adminPlugins} />
        </section>
      )}

      {directory && (
        <PluginDirectorySection eligible={directory.eligible} enabled={directory.enabled} />
      )}
    </div>
  );
}
