import { NextResponse } from 'next/server';
import { listPluginStatus } from '@sovereignfs/db';
import { checkAdminKey } from '@/src/admin-guard';
import { getPlatformDb } from '@/src/db';
import { getCompatibilityWarnings, getIncompatibilityReason } from '@/src/plugin-compat';
import { getInstalledPlugins } from '@/src/registry';

export async function GET(request: Request): Promise<Response> {
  const denied = checkAdminKey(request);
  if (denied) return denied;

  const statusRows = await listPluginStatus(await getPlatformDb());
  const statusMap = new Map(statusRows.map((r) => [r.pluginId, r.enabled]));

  const plugins = getInstalledPlugins().map((manifest) => ({
    id: manifest.id,
    name: manifest.name,
    version: manifest.version,
    description: manifest.description,
    type: manifest.type,
    routePrefix: manifest.routePrefix,
    adminOnly: manifest.adminOnly ?? false,
    shell: manifest.shell ?? 'default',
    enabled: statusMap.get(manifest.id) ?? true,
    compatibilityError: getIncompatibilityReason(manifest.id),
    compatibilityWarnings: getCompatibilityWarnings(manifest.id),
  }));

  return NextResponse.json(plugins);
}
