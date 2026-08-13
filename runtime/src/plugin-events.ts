export interface EventsPermissionManifest {
  permissions: readonly string[];
}

export type EventsPermission = 'events:publish' | 'events:subscribe';

/**
 * Verifies a plugin route context exists, the calling/target plugin is
 * installed, and it declares `permission` (RFC 0045). Throws a descriptive
 * error otherwise; returns the narrowed, non-null `pluginId` and manifest on
 * success. Mirrors `plugin-mailer.ts`'s `requireMailerPluginContext` —
 * `sdk.events.publish()` uses this to verify the *calling* plugin declares
 * `events:publish`; the `/api/events/stream` and `/api/events/poll` routes
 * use it to verify the *target* plugin (from the `pluginId` query param)
 * declares `events:subscribe` before checking channel authorization.
 */
export function requireEventsPluginContext<M extends EventsPermissionManifest>(
  pluginId: string | null,
  manifest: M | undefined,
  permission: EventsPermission,
): { pluginId: string; manifest: M } {
  if (!pluginId) {
    throw new Error(
      'sdk.events requires a plugin route context (x-sovereign-plugin-id header missing).',
    );
  }
  if (!manifest) {
    throw new Error(`Plugin "${pluginId}" is not installed.`);
  }
  if (!manifest.permissions.includes(permission)) {
    throw new Error(`Plugin "${pluginId}" does not have the "${permission}" permission.`);
  }
  return { pluginId, manifest };
}
