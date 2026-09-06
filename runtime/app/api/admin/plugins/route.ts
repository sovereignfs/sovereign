import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { NextResponse } from 'next/server';
import { findWorkspaceRoot } from '@sovereignfs/db';
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
  const pluginsDir = join(findWorkspaceRoot(), 'plugins');

  const plugins = getInstalledPlugins().map((manifest) => ({
    id: manifest.id,
    name: manifest.name,
    version: manifest.version,
    description: manifest.description,
    type: manifest.type,
    routePrefix: manifest.routePrefix,
    adminOnly: manifest.adminOnly ?? false,
    public: manifest.public ?? false,
    example: manifest.example ?? false,
    development: manifest.development ?? false,
    offline: manifest.offline,
    shell: manifest.shell ?? 'default',
    permissions: manifest.permissions,
    enabled: !disabled.has(manifest.id),
    compatibilityError: getIncompatibilityReason(manifest.id),
    compatibilityWarnings: getCompatibilityWarnings(manifest.id),
    // `sv plugin remove <dir>` deletes `plugins/<dir>`, and only `sv plugin
    // add` installs compose under their manifest id as the directory name.
    // First-party plugins live under other names (`plugins/console`,
    // `plugins/warden`, `.local` clones) and the production image ships no
    // plugin source directories at all — Console previously offered Remove
    // for all of those and it always failed with "not installed".
    removable: manifest.type !== 'platform' && existsSync(join(pluginsDir, manifest.id)),
  }));

  return NextResponse.json(plugins);
}
