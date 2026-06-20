import { requireHost } from './host';
import type { SendNotificationInput } from './types';

function getPluginId(headers: Headers): string | null {
  return headers.get('x-sovereign-plugin-id');
}

/**
 * Notification Center SDK surface (RFC 0015).
 *
 * Requires the `notifications:send` manifest permission.
 * The runtime injects source identity from the request context.
 */
export const notifications = {
  /**
   * Send a notification to a user.
   *
   * The `source` and `sourceType` fields are set by the runtime from the
   * calling plugin's ID (injected via `x-sovereign-plugin-id` header) — plugins
   * cannot forge sender identity.
   *
   * @example
   * ```ts
   * await sdk.notifications.send({
   *   recipientUserId: userId,
   *   title: 'Your export is ready',
   *   url: '/myPlugin/exports',
   *   category: 'info',
   * });
   * ```
   */
  async send(input: SendNotificationInput, requestHeaders?: Headers): Promise<void> {
    const pluginId = requestHeaders ? (getPluginId(requestHeaders) ?? 'unknown') : 'unknown';
    return requireHost().notifications.send(input, pluginId);
  },
};
