import { headers } from 'next/headers';
import { requireHost } from './host';
import type {
  NotificationListOptions,
  NotificationListResult,
  SendNotificationInput,
} from './types';

function getPluginId(headersObj: Headers): string | null {
  return headersObj.get('x-sovereign-plugin-id');
}

/**
 * `userId`/`pluginId` for the read/manage methods below — always resolved
 * from the current request's own context via `next/headers`, never from a
 * caller-supplied parameter. `userId` in particular is load-bearing for
 * safety: these methods read/mutate "the current user's own" notifications,
 * so a plugin must never be able to pass an arbitrary target user id the
 * way `send()`'s `recipientUserId` intentionally can (sending to someone
 * else is the whole point of `send`; reading someone else's inbox is not
 * the point of `list`/`markRead`/etc). Unlike `send()`, these always run
 * inside a real request (a user interacting with a bell UI), never a
 * background job, so reading headers directly here (matching `plugins.ts`'s
 * `requestContext()`) is safe — no explicit `requestHeaders` passthrough
 * parameter needed.
 */
async function requestContext(): Promise<{ userId: string | null; pluginId: string | null }> {
  const h = await headers();
  return { userId: h.get('x-sovereign-user-id'), pluginId: getPluginId(h) };
}

/**
 * Notification Center SDK surface (RFC 0015).
 *
 * Requires the `notifications:send` manifest permission for every method
 * below, not just `send` — see `runtime/src/notification-permissions.ts`.
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
    const pluginId = requestHeaders ? getPluginId(requestHeaders) : null;
    return requireHost().notifications.send(input, pluginId);
  },

  /**
   * The current user's own Notification Center inbox — the same real,
   * cross-plugin list the platform's own bell shows (RFC 0015). Not
   * scoped to the calling plugin.
   *
   * @example
   * ```ts
   * const { items, unreadCount } = await sdk.notifications.list();
   * ```
   */
  async list(options?: NotificationListOptions): Promise<NotificationListResult> {
    const { userId, pluginId } = await requestContext();
    if (!userId || !pluginId) return { items: [], unreadCount: 0 };
    return requireHost().notifications.list(userId, options ?? {}, pluginId);
  },

  /** Mark one of the current user's own notifications read. No-op if not theirs or already read. */
  async markRead(id: string): Promise<void> {
    const { userId, pluginId } = await requestContext();
    if (!userId || !pluginId) return;
    return requireHost().notifications.markRead(id, userId, pluginId);
  },

  /** Mark all of the current user's own unread notifications read. */
  async markAllRead(): Promise<void> {
    const { userId, pluginId } = await requestContext();
    if (!userId || !pluginId) return;
    return requireHost().notifications.markAllRead(userId, pluginId);
  },

  /** Dismiss one of the current user's own notifications. No-op if not theirs. */
  async dismiss(id: string): Promise<void> {
    const { userId, pluginId } = await requestContext();
    if (!userId || !pluginId) return;
    return requireHost().notifications.dismiss(id, userId, pluginId);
  },

  /** Dismiss all of the current user's own non-dismissed notifications. */
  async dismissAll(): Promise<void> {
    const { userId, pluginId } = await requestContext();
    if (!userId || !pluginId) return;
    return requireHost().notifications.dismissAll(userId, pluginId);
  },
};
