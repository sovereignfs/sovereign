/**
 * Node-runtime plugin access policy resolution (RFC 0065, epic tasks 2.21 and
 * 3.28).
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
import type { SovereignManifest } from '@sovereignfs/manifest';
import { hasCapability } from './capabilities';
import { CHROME_PLUGIN_IDS } from './launcher-plugins';
import { canOpenPlugin, type PluginAccessPolicy } from './plugin-access';
import { bypassPluginVisibilityInDev, getExamplesEnabledFlag } from './plugin-status';
import { getExamplePluginIds } from './registry';
import { hasUserCapability } from './user-capabilities';

/** Normalize a stored policy string, defensively falling back to `everyone` for a corrupt/unexpected value. */
function normalizeAccessPolicy(value: string): PluginAccessPolicy {
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
 * Resolve a plugin's effective access policy from its (possibly absent)
 * `plugin_status` row. **A genuinely absent row resolves to `disabled`, not
 * `everyone`** (RFC 0065 Task 3.28) — a row-less plugin is "cataloged but
 * never activated" and must default closed, so a brand-new plugin isn't
 * fully open to every user before an admin has decided anything.
 *
 * **Exception: a row-less example plugin resolves to `everyone` when the
 * examples bulk toggle is on, `disabled` otherwise.** Example visibility is
 * governed by the `examples_enabled` platform setting (mirrored by
 * `computeDisabledPluginIds` in `./plugin-status.ts`) rather than by manual
 * per-plugin activation — without this exception, a row-less example would
 * stay access-restricted (and thus 404 / hidden from sidebar+launcher) even
 * after an admin turns the bulk toggle on, since this function has no other
 * way to learn the plugin is an example that's supposed to follow it.
 */
function resolveAccessPolicy(
  row: { accessPolicy: string } | undefined,
  isExample: boolean,
  examplesEnabled: boolean,
): PluginAccessPolicy {
  if (row) return normalizeAccessPolicy(row.accessPolicy);
  if (isExample && examplesEnabled) return 'everyone';
  return 'disabled';
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
  if (bypassPluginVisibilityInDev()) return installed;

  const [policyRow, examplesEnabled] = await Promise.all([
    getPluginAccessPolicy(pdb, pluginId),
    getExamplesEnabledFlag(pdb),
  ]);
  const isExample = getExamplePluginIds().includes(pluginId);
  const accessPolicy = resolveAccessPolicy(policyRow, isExample, examplesEnabled);
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
 * differently. Bulk-resolves every plugin's policy, the user's grants, and
 * the examples bulk-toggle setting in four queries total, regardless of
 * plugin count.
 */
export async function getRestrictedPluginIds(
  pdb: PlatformDb,
  userId: string,
  role: string,
  installedPluginIds: readonly string[],
): Promise<string[]> {
  const candidates = installedPluginIds.filter((id) => !CHROME_PLUGIN_IDS.has(id));
  if (candidates.length === 0) return [];
  if (bypassPluginVisibilityInDev()) return [];

  const isAdmin = hasCapability(role, 'console:access');
  const exampleIds = new Set(getExamplePluginIds());
  const [policyRows, directGrantIds, groupGrantIds, examplesEnabled] = await Promise.all([
    listPluginAccessPolicies(pdb),
    listPluginIdsGrantedToUser(pdb, userId),
    listPluginIdsGrantedToUserGroups(pdb, userId),
    getExamplesEnabledFlag(pdb),
  ]);
  const policyById = new Map(policyRows.map((r) => [r.pluginId, r]));
  const directGrantSet = new Set(directGrantIds);
  const groupGrantSet = new Set(groupGrantIds);

  const restricted: string[] = [];
  for (const pluginId of candidates) {
    const row = policyById.get(pluginId);
    const accessPolicy = resolveAccessPolicy(row, exampleIds.has(pluginId), examplesEnabled);
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

/** A self-service-eligible plugin's Launcher-facing directory entry (RFC 0065 Task 15.3). */
export interface SelfServiceDirectoryEntry {
  id: string;
  name: string;
  description: string | null;
  routePrefix: string;
}

/**
 * The plugins a user can self-service enable/disable (RFC 0065 Task 15.3),
 * split into "eligible, not yet enabled" and "already on". Restricted to
 * `selected_users` policy with `self_service = true` — `selected_groups`
 * self-service is out of scope pending a "self-joinable group" concept (see
 * `runtime/app/api/plugins/[id]/self-service/route.ts`). Returns `null` when
 * the user lacks `plugins:self-manage` (RFC 0070) so callers can render
 * nothing rather than an empty section — the control must not exist for
 * ineligible users, not merely be hidden — or when nothing is eligible.
 */
export async function getSelfServiceDirectory(
  pdb: PlatformDb,
  userId: string,
  role: string,
  installedPlugins: readonly SovereignManifest[],
): Promise<{ eligible: SelfServiceDirectoryEntry[]; enabled: SelfServiceDirectoryEntry[] } | null> {
  const canSelfManage = await hasUserCapability({ id: userId, role }, 'plugins:self-manage');
  if (!canSelfManage) return null;

  const [policyRows, grantedIds] = await Promise.all([
    listPluginAccessPolicies(pdb),
    listPluginIdsGrantedToUser(pdb, userId),
  ]);
  const policyById = new Map(policyRows.map((r) => [r.pluginId, r]));
  const grantedSet = new Set(grantedIds);

  const eligible: SelfServiceDirectoryEntry[] = [];
  const enabled: SelfServiceDirectoryEntry[] = [];
  for (const manifest of installedPlugins) {
    if (CHROME_PLUGIN_IDS.has(manifest.id)) continue;
    const policy = policyById.get(manifest.id);
    if (!policy || policy.accessPolicy !== 'selected_users' || !policy.selfService) continue;

    const entry: SelfServiceDirectoryEntry = {
      id: manifest.id,
      name: manifest.name,
      description: manifest.description ?? null,
      routePrefix: manifest.routePrefix,
    };
    (grantedSet.has(manifest.id) ? enabled : eligible).push(entry);
  }

  if (eligible.length === 0 && enabled.length === 0) return null;
  return { eligible, enabled };
}
