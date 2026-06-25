import { headers } from 'next/headers';
import Link from 'next/link';
import { sdk } from '@sovereignfs/sdk';
import { PluginGrid } from './_components/PluginGrid';
import { SearchableGrid } from './_components/SearchableGrid';
import type { PluginTileData } from './_components/PluginTile';
import styles from './launcher.module.css';

// Always reflect the current registry + enabled state on each visit.
export const dynamic = 'force-dynamic';

// The runtime always listens on :3000; self-fetch its own API rather than the
// public URL (which may sit behind a reverse proxy the container can't hairpin
// through) — same rationale as the Console pages.
const SELF_URL = `http://localhost:${process.env.PORT ?? '3000'}`;

interface LauncherPlugin extends PluginTileData {
  adminOnly: boolean;
}

async function getPlugins(): Promise<LauncherPlugin[]> {
  // Forward the caller's session cookie so the gated /api/plugins route resolves
  // the same user (and role) the Launcher page was rendered for.
  const cookie = (await headers()).get('cookie') ?? '';
  const res = await fetch(`${SELF_URL}/api/plugins`, {
    headers: { cookie },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Failed to fetch plugins: ${res.status}`);
  const data = (await res.json()) as { plugins: LauncherPlugin[] };
  return data.plugins;
}

export default async function LauncherPage() {
  const [plugins, session] = await Promise.all([getPlugins(), sdk.auth.getSession()]);
  const isAdmin = sdk.auth.hasCapability(session, 'console:access');

  const mainPlugins = plugins.filter((p) => !p.adminOnly);
  const adminPlugins = plugins.filter((p) => p.adminOnly);

  if (plugins.length === 0) {
    return (
      <div className={styles.launcher}>
        <div className={styles.titleRow}>
          <div>
            <h1 className={styles.title}>Home</h1>
            <p className={styles.subtitle}>Your installed plugins and tools.</p>
          </div>
        </div>
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>No plugins installed yet</p>
          {isAdmin ? (
            <p className={styles.emptyText}>
              Install and enable plugins from the{' '}
              <Link href="/console/plugins" className={styles.emptyLink}>
                Console
              </Link>
              .
            </p>
          ) : (
            <p className={styles.emptyText}>
              Ask your administrator to install plugins for this workspace.
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={styles.launcher}>
      <SearchableGrid plugins={mainPlugins} total={plugins.length} />

      {isAdmin && adminPlugins.length > 0 && (
        <section className={styles.adminSection}>
          <h2 className={styles.sectionTitle}>Admin</h2>
          <PluginGrid plugins={adminPlugins} />
        </section>
      )}
    </div>
  );
}
