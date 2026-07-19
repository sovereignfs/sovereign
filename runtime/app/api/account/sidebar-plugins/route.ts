import { NextResponse } from 'next/server';
import { getAccountPrefs } from '@sovereignfs/db';
import { getPlatformDb } from '@/src/db';
import { getInstalledPlugins } from '@/src/registry';
import { getRestrictedPluginIds } from '@/src/plugin-access-server';
import { getDisabledPluginIds } from '@/src/plugin-status';
import { selectSidebarPlugins } from '@/src/launcher-plugins';

/**
 * Returns the list of sidebar-customisable plugins (non-chrome, non-launcher,
 * enabled, access-policy-allowed) together with the user's current saved
 * ordering preference. Consumed by the Account → Preferences → Sidebar
 * section. Must apply the same `restrictedIds` (RFC 0065 access policy) gate
 * as the sidebar chrome (`(platform)/layout.tsx`) and the Launcher
 * (`/api/plugins`) — otherwise a user could reorder or "show" a plugin here
 * that they're actually denied access to everywhere else.
 */
export async function GET(request: Request): Promise<Response> {
  const userId = request.headers.get('x-sovereign-user-id');
  if (!userId) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  const role = request.headers.get('x-sovereign-user-role') ?? 'platform:user';

  const pdb = await getPlatformDb();
  const installedPlugins = getInstalledPlugins();
  const disabledIds = new Set(await getDisabledPluginIds(pdb));
  const restrictedIds = new Set(
    await getRestrictedPluginIds(
      pdb,
      userId,
      role,
      installedPlugins.map((p) => p.id),
    ),
  );

  const plugins = selectSidebarPlugins(installedPlugins, disabledIds, restrictedIds).map((p) => ({
    id: p.id,
    name: p.name,
    iconUrl: p.icon ? `/plugin-icons/${p.id}.svg` : undefined,
  }));

  const prefs = await getAccountPrefs(pdb, userId);

  return NextResponse.json({ plugins, sidebarPlugins: prefs.sidebarPlugins });
}
