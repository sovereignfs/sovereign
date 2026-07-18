import { NextResponse } from 'next/server';
import { listPluginStatus } from '@sovereignfs/db';
import { checkAdminKey } from '@/src/admin-guard';
import { getPlatformDb } from '@/src/db';
import { getPluginCatalog } from '@/src/plugin-catalog';
import { getInstalledPlugins } from '@/src/registry';

/**
 * GET /api/admin/plugins/catalog
 *
 * Every non-chrome plugin bundled in the image (RFC 0065 Task 3.28),
 * annotated with whether it's currently active (has a `plugin_status` row).
 * Distinct from `/api/admin/plugins`, which lists only active plugins with
 * their enabled/disabled state. Consumed by Console's catalog browser
 * (Task 13.8).
 */
export async function GET(request: Request): Promise<Response> {
  const denied = checkAdminKey(request);
  if (denied) return denied;

  const pdb = await getPlatformDb();
  const statusRows = await listPluginStatus(pdb);
  const activeIds = new Set(statusRows.map((r) => r.pluginId));

  const catalog = getPluginCatalog(getInstalledPlugins(), activeIds);
  return NextResponse.json({ catalog });
}
