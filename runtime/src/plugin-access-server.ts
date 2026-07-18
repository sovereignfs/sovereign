/**
 * Node-runtime plugin access policy resolution (RFC 0065, epic task 2.21).
 *
 * Wraps the pure `canOpenPlugin` resolver (`./plugin-access.ts`) with the DB
 * queries it needs. Kept separate from that pure module so Edge-safe code
 * never accidentally pulls in a DB import — mirrors the `capabilities.ts` /
 * `user-capabilities.ts` split (RFC 0068/0070).
 */
import {
  getPluginAccessPolicy,
  hasPluginAccessUserGrant,
  listPluginAccessPolicies,
  listPluginIdsGrantedToUser,
  listPluginIdsGrantedToUserGroups,
  type PlatformDb,
} from '@sovereignfs/db';
import { hasCapability } from './capabilities';
import { CHROME_PLUGIN_IDS } from './launcher-plugins';
import { canOpenPlugin, type PluginAccessPolicy } from './plugin-access';

function toAccessPolicy(value: string | undefined): PluginAccessPolicy {
  if (
    value === 'everyone' ||
    value === 'admins' ||
    value === 'selected_users' ||
    value === 'selected_groups' ||
    value === 'disabled'
  ) {
    return value;
  }
  return 'everyone';
}

/**
 * Whether a specific user may open a specific plugin. `installed`/`enabled`
 * are supplied by the caller (already known from the registry + disabled-set
 * lookups elsewhere) so this function only resolves the access-policy layer.
 * Chrome plugins are always openable — access policy never applies to them.
 */
export async function canUserOpenPlugin(
  pdb: PlatformDb,
  userId: string,
  role: string,
  pluginId: string,
  installed: boolean,
  enabled: boolean,
): Promise<boolean> {
  if (CHROME_PLUGIN_IDS.has(pluginId)) return installed && enabled;

  const policyRow = await getPluginAccessPolicy(pdb, pluginId);
  const accessPolicy = toAccessPolicy(policyRow?.accessPolicy);
  const isAdmin = hasCapability(role, 'console:access');

  const [hasDirectGrant, hasGroupGrant] = await Promise.all([
    accessPolicy === 'selected_users' ? hasPluginAccessUserGrant(pdb, pluginId, userId) : false,
    accessPolicy === 'selected_groups'
      ? listPluginIdsGrantedToUserGroups(pdb, userId).then((ids) => ids.includes(pluginId))
      : false,
  ]);

  return canOpenPlugin({
    installed,
    enabled,
    accessPolicy,
    isAdmin,
    hasDirectGrant,
    hasGroupGrant,
  });
}

/**
 * The set of installed, non-chrome plugin IDs a user is NOT allowed to open
 * due to access policy alone — deliberately independent of the enable/disable
 * axis (already covered by the existing disabled-plugin set). Callers union
 * this with `disabledIds` wherever that set is already consulted (route
 * guard, Launcher/sidebar filtering, `/api/plugins`) — both map to the same
 * "not-found" outcome, but are resolved separately so this function's result
 * doesn't depend on a disabled-set snapshot the caller may compute
 * differently. Bulk-resolves every plugin's policy and the user's grants in
 * three queries total, regardless of plugin count.
 */
export async function getRestrictedPluginIds(
  pdb: PlatformDb,
  userId: string,
  role: string,
  installedPluginIds: readonly string[],
): Promise<string[]> {
  const candidates = installedPluginIds.filter((id) => !CHROME_PLUGIN_IDS.has(id));
  if (candidates.length === 0) return [];

  const isAdmin = hasCapability(role, 'console:access');
  const [policyRows, directGrantIds, groupGrantIds] = await Promise.all([
    listPluginAccessPolicies(pdb),
    listPluginIdsGrantedToUser(pdb, userId),
    listPluginIdsGrantedToUserGroups(pdb, userId),
  ]);
  const policyById = new Map(policyRows.map((r) => [r.pluginId, r]));
  const directGrantSet = new Set(directGrantIds);
  const groupGrantSet = new Set(groupGrantIds);

  const restricted: string[] = [];
  for (const pluginId of candidates) {
    const row = policyById.get(pluginId);
    const accessPolicy = toAccessPolicy(row?.accessPolicy);
    const allowed = canOpenPlugin({
      installed: true,
      enabled: true,
      accessPolicy,
      isAdmin,
      hasDirectGrant: directGrantSet.has(pluginId),
      hasGroupGrant: groupGrantSet.has(pluginId),
    });
    if (!allowed) restricted.push(pluginId);
  }
  return restricted;
}
