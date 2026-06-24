import { NextResponse } from 'next/server';
import { getAccountPrefs } from '@sovereignfs/db';
import { getPlatformDb } from '@/src/db';
import { getInstalledPlugins } from '@/src/registry';
import { CHROME_PLUGIN_IDS } from '@/src/launcher-plugins';

/**
 * Returns the list of sidebar-customisable plugins (non-chrome, non-launcher)
 * together with the user's current saved ordering preference. Consumed by the
 * Account → Preferences → Sidebar section.
 */
export async function GET(request: Request): Promise<Response> {
  const userId = request.headers.get('x-sovereign-user-id');
  if (!userId) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const allPlugins = getInstalledPlugins();
  const plugins = allPlugins
    .filter((p) => !CHROME_PLUGIN_IDS.has(p.id))
    .map((p) => ({
      id: p.id,
      name: p.name,
      iconUrl: p.icon ? `/plugin-icons/${p.id}.svg` : undefined,
    }));

  const prefs = await getAccountPrefs(await getPlatformDb(), userId);

  return NextResponse.json({ plugins, sidebarPlugins: prefs.sidebarPlugins });
}
