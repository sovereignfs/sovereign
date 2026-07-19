import { NextResponse } from 'next/server';
import { checkAdminKey } from '@/src/admin-guard';
import { getPlatformDb } from '@/src/db';
import { getCompatibilityWarnings, getIncompatibilityReason } from '@/src/plugin-compat';
import { getDisabledPluginIds } from '@/src/plugin-status';
import { getInstalledPlugins } from '@/src/registry';

export async function GET(request: Request): Promise<Response> {
  const denied = checkAdminKey(request);
  if (denied) return denied;

  // Effective disabled set — includes example plugins that are off by the
  // SOVEREIGN_EXAMPLES_ENABLED default — so Console reflects what the launcher
  // and middleware actually see.
  const disabled = new Set(await getDisabledPluginIds(await getPlatformDb()));

  const plugins = getInstalledPlugins().map((manifest) => ({
    id: manifest.id,
    name: manifest.name,
    version: manifest.version,
    description: manifest.description,
    type: manifest.type,
    routePrefix: manifest.routePrefix,
    adminOnly: manifest.adminOnly ?? false,
    example: manifest.example ?? false,
    development: manifest.development ?? false,
    shell: manifest.shell ?? 'default',
    enabled: !disabled.has(manifest.id),
    compatibilityError: getIncompatibilityReason(manifest.id),
    compatibilityWarnings: getCompatibilityWarnings(manifest.id),
  }));

  return NextResponse.json(plugins);
}
