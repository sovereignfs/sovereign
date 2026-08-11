import { NextResponse } from 'next/server';
import { getAccountPrefs } from '@sovereignfs/db';
import { hasCapability } from '@/src/capabilities';
import { getPlatformDb } from '@/src/db';
import { applySidebarOrder, selectSidebarPlugins } from '@/src/launcher-plugins';
import { getRestrictedPluginIds } from '@/src/plugin-access-server';
import { getDisabledPluginIds } from '@/src/plugin-status';
import { getInstalledPlugins } from '@/src/registry';
import { parseSurfaceHeader } from '@/src/surface';

export interface SidebarPluginEntryResponse {
  id: string;
  name: string;
  routePrefix: string;
  iconUrl?: string;
  hasMonetization: boolean;
}

/**
 * The sidebar's own plugin icon list for the current user — the same
 * selection/ordering `(platform)/layout.tsx` computes server-side
 * (`selectSidebarPlugins` + the user's saved order, `dropHidden: true`), but
 * reachable as a live, never-cached client fetch. Exists so `ClientShell` can
 * restore the real personalized sidebar on a manifest-declared offline route
 * (RFC 0072) for a live, online tab, mirroring `AccountMenu`'s
 * `hydrateUser`/`/api/auth/get-session` pattern for name/avatar: the
 * *SSR document* (what a service worker precaches) stays a fixed,
 * identical-for-everyone neutral shell, while a live browser always fetches
 * this after mount and fills in the truth for whoever is actually looking at
 * the screen right now.
 */
export async function GET(request: Request): Promise<Response> {
  const role = request.headers.get('x-sovereign-user-role') ?? 'platform:user';
  const userId = request.headers.get('x-sovereign-user-id');
  const isAdmin = hasCapability(role, 'console:access');

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

  const currentSurface = parseSurfaceHeader(request.headers.get('x-sovereign-surface'));
  const rawPlugins = selectSidebarPlugins(
    installedPlugins,
    disabledIds,
    restrictedIds,
    currentSurface,
  );
  const prefs = userId ? await getAccountPrefs(pdb, userId) : null;
  const ordered = applySidebarOrder(rawPlugins, prefs?.sidebarPlugins ?? null, {
    dropHidden: true,
  });

  const plugins: SidebarPluginEntryResponse[] = ordered.map((plugin) => ({
    id: plugin.id,
    name: plugin.name,
    routePrefix: plugin.routePrefix,
    iconUrl: plugin.icon ? `/plugin-icons/${plugin.id}.svg` : undefined,
    hasMonetization: Boolean(plugin.monetization),
  }));

  return NextResponse.json({ plugins, isAdmin });
}
