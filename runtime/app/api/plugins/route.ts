import { NextResponse } from 'next/server';
import { getPlatformDb } from '@/src/db';
import { getDisabledPluginIds } from '@/src/plugin-status';
import { getInstalledPlugins } from '@/src/registry';
import { selectLauncherPlugins } from '@/src/launcher-plugins';

/**
 * Launcher-visible plugins for the current user (SRS LCH-01/03/04). Session-
 * gated by the middleware (not under the `/api/admin` exclusion), which injects
 * the verified role as `x-sovereign-user-role` — so this needs no admin key.
 * Returns enabled, non-chrome plugins; admin-only ones only for admins.
 */
export async function GET(request: Request): Promise<Response> {
  const role = request.headers.get('x-sovereign-user-role') ?? 'platform:user';

  const disabledIds = new Set(await getDisabledPluginIds(await getPlatformDb()));

  const plugins = selectLauncherPlugins(getInstalledPlugins(), disabledIds, role);
  return NextResponse.json({ plugins });
}
