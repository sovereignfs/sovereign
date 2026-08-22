/**
 * Permission gate for `sdk.notifications.*`'s read/manage surface (`list`,
 * `markRead`, `markAllRead`, `dismiss`, `dismissAll`) — reuses the existing
 * `notifications:send` permission rather than adding a new manifest string,
 * since every current caller (Kanban) already declares it for `send` and
 * needing both send and read-your-own-inbox from the same plugin is the
 * expected shape, not an edge case.
 *
 * `send` itself stays unenforced (as it always has been — see this file's
 * sibling call sites in `sdk-host.ts`) to avoid touching already-shipped
 * behavior; only the new methods gate on this, same pattern as
 * `requireJobsPluginContext`/`requireCryptoPluginContext`.
 */

/** The minimal manifest slice this module needs — keeps tests independent of the full schema. */
export interface NotificationsPermissionManifest {
  id: string;
  permissions: readonly string[];
}

export function requireNotificationsPluginContext(
  pluginId: string,
  manifest: NotificationsPermissionManifest | undefined,
): void {
  if (!manifest) {
    throw new Error(`Calling plugin "${pluginId}" is not installed.`);
  }
  if (!manifest.permissions.includes('notifications:send')) {
    throw new Error(`Plugin "${pluginId}" does not have the "notifications:send" permission.`);
  }
}
