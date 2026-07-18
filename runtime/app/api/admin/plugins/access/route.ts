import { NextResponse } from 'next/server';
import { checkAdminKey } from '@/src/admin-guard';
import { getPlatformDb } from '@/src/db';
import { getRestrictedPluginIds } from '@/src/plugin-access-server';
import { getInstalledPlugins } from '@/src/registry';

/**
 * GET /api/admin/plugins/access?userId=<id>&role=<role>
 *
 * Returns `{ restricted: string[] }` — installed, non-chrome plugin IDs the
 * given user is NOT allowed to open under RFC 0065's access policy (a
 * separate axis from the disabled-plugin set at /api/admin/plugins/disabled).
 * Consumed by the Edge middleware, which cannot open the DB itself (same
 * round-trip pattern as /api/admin/plugins/disabled and /api/admin/entitlements).
 */
export async function GET(request: Request): Promise<Response> {
  const denied = checkAdminKey(request);
  if (denied) return denied;

  const url = new URL(request.url);
  const userId = url.searchParams.get('userId');
  const role = url.searchParams.get('role') ?? 'platform:user';
  if (!userId) {
    return NextResponse.json({ error: 'userId is required' }, { status: 400 });
  }

  const pdb = await getPlatformDb();
  const installedPluginIds = getInstalledPlugins().map((p) => p.id);
  const restricted = await getRestrictedPluginIds(pdb, userId, role, installedPluginIds);

  return NextResponse.json({ restricted });
}
