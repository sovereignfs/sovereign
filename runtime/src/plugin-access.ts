/**
 * Pure plugin access policy resolver (RFC 0065, epic task 2.21).
 *
 * Kept free of Next.js and database imports so the decision is unit-testable;
 * callers resolve the DB-backed inputs (policy row, group/direct grants,
 * admin capability) and pass them in. Chrome plugins (Launcher, Account,
 * Console — `./launcher-plugins.ts`'s `CHROME_PLUGIN_IDS`) are never subject
 * to access policy; callers must exclude them before reaching this resolver.
 */

export type PluginAccessPolicy =
  | 'everyone'
  | 'admins'
  | 'selected_users'
  | 'selected_groups'
  | 'disabled';

export interface PluginAccessInput {
  /** The plugin is present in the composed registry. */
  installed: boolean;
  /** The global enable/disable toggle (`plugin_status.enabled`) — independent of access policy. */
  enabled: boolean;
  /** Absent `plugin_status` row defaults to `everyone` — callers resolve that before calling in. */
  accessPolicy: PluginAccessPolicy;
  /** Whether the user holds the `console:access` capability. */
  isAdmin: boolean;
  /** Whether the user has a direct `plugin_access_users` grant for this plugin. */
  hasDirectGrant: boolean;
  /** Whether the user belongs to a group with a `plugin_access_groups` grant for this plugin. */
  hasGroupGrant: boolean;
}

/**
 * Whether a user may open a plugin, per RFC 0065's `canOpenPlugin` design.
 * `disabled` is the strongest state — it wins even for admins/owners or a
 * direct/group grant. `everyone` requires only that the plugin be installed
 * and enabled (any active authenticated user may open it).
 */
export function canOpenPlugin(input: PluginAccessInput): boolean {
  if (!input.installed || !input.enabled) return false;
  switch (input.accessPolicy) {
    case 'disabled':
      return false;
    case 'everyone':
      return true;
    case 'admins':
      return input.isAdmin;
    case 'selected_users':
      return input.hasDirectGrant;
    case 'selected_groups':
      return input.hasGroupGrant;
    default:
      return false;
  }
}
