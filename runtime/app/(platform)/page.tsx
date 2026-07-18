import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { DEFAULT_ROOT_PLUGIN_ID, getPlatformSetting } from '@sovereignfs/db';
import { getPlatformDb } from '@/src/db';
import { getRestrictedPluginIds } from '@/src/plugin-access-server';
import { getDisabledPluginIds } from '@/src/plugin-status';
import { getInstalledPlugins } from '@/src/registry';
import { resolveRootRoutePrefix } from '@/src/root-plugin';
import styles from './page.module.css';

// `/` resolves to the configured root plugin's routePrefix (SRS PLT-14).
// Force dynamic so a root-plugin change in Console takes effect immediately.
export const dynamic = 'force-dynamic';

/**
 * Belt-and-suspenders fallback for the rare case the middleware's own
 * Edge-side root-plugin fetch failed (network hiccup, transient DB error) —
 * middleware normally rewrites `/` to the resolved target before this page
 * ever renders. Unlike middleware, this Node-runtime page has direct DB
 * access, so it resolves the full RFC 0065 chain itself: the configured root
 * plugin, falling back to the Launcher when the root is disabled or
 * access-policy-restricted for this user, and finally this "No apps
 * available" state when neither resolves.
 */
export default async function Home() {
  const h = await headers();
  const userId = h.get('x-sovereign-user-id');
  const role = h.get('x-sovereign-user-role') ?? 'platform:user';

  const pdb = await getPlatformDb();
  const rootPluginId = (await getPlatformSetting(pdb, 'root_plugin_id')) ?? DEFAULT_ROOT_PLUGIN_ID;
  const installedPlugins = getInstalledPlugins();
  const disabledIds = new Set(await getDisabledPluginIds(pdb));
  const restrictedIds = new Set(
    userId
      ? await getRestrictedPluginIds(
          pdb,
          userId,
          role,
          installedPlugins.map((p) => p.id),
        )
      : [],
  );

  const rootPrefix = resolveRootRoutePrefix(
    rootPluginId,
    installedPlugins,
    disabledIds,
    restrictedIds,
  );
  if (rootPrefix) redirect(rootPrefix);

  const launcherPrefix =
    rootPluginId === DEFAULT_ROOT_PLUGIN_ID
      ? null
      : resolveRootRoutePrefix(
          DEFAULT_ROOT_PLUGIN_ID,
          installedPlugins,
          disabledIds,
          restrictedIds,
        );
  if (launcherPrefix) redirect(launcherPrefix);

  return (
    <div className={styles.home}>
      <h1 className={styles.title}>No apps available</h1>
      <p className={styles.text}>
        There&apos;s nothing installed and available to you right now. Contact an administrator if
        you believe this is unexpected.
      </p>
    </div>
  );
}
