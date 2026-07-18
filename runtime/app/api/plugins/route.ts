import { NextResponse } from 'next/server';
import { getAccountPrefs } from '@sovereignfs/db';
import { getPlatformDb } from '@/src/db';
import { getRestrictedPluginIds } from '@/src/plugin-access-server';
import { getDisabledPluginIds } from '@/src/plugin-status';
import { getInstalledPlugins } from '@/src/registry';
import { applySidebarOrder, selectLauncherPlugins } from '@/src/launcher-plugins';

/**
 * Launcher-visible plugins for the current user (SRS LCH-01/03/04). Session-
 * gated by the middleware (not under the `/api/admin` exclusion), which injects
 * the verified role as `x-sovereign-user-role` — so this needs no admin key.
 * Returns enabled, non-chrome, access-policy-allowed (RFC 0065) plugins;
 * admin-only ones only for admins.
 *
 * Ordered by the user's saved sidebar preference (Task 2.22), when set — same
 * order as the sidebar chrome, but hidden-from-sidebar plugins still appear
 * here (Launcher is the "see everything" view; only the sidebar strip hides).
 */
export async function GET(request: Request): Promise<Response> {
  const role = request.headers.get('x-sovereign-user-role') ?? 'platform:user';
  const userId = request.headers.get('x-sovereign-user-id');

  const pdb = await getPlatformDb();
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

  const launcherPlugins = selectLauncherPlugins(installedPlugins, disabledIds, role, restrictedIds);
  const prefs = userId ? await getAccountPrefs(pdb, userId) : null;
  const plugins = applySidebarOrder(launcherPlugins, prefs?.sidebarPlugins ?? null, {
    dropHidden: false,
  });
  return NextResponse.json({ plugins });
}
