import { requireHost } from './host';
import type { SendMessageInput, SendMessageResult } from './types';

function getPluginId(headersObj: Headers): string | null {
  return headersObj.get('x-sovereign-plugin-id');
}

/**
 * Message Inbox SDK surface (RFC 0048). Send-only, mirroring
 * `sdk.notifications.send()` — plugins have no read surface for a user's
 * message inbox (RFC 0048 principle 5: "plugins do not read user inboxes").
 *
 * Requires the `messages:send` manifest permission. The runtime stamps
 * sender identity from trusted request context — plugins cannot forge it.
 */
export const messages = {
  /**
   * Send a durable message to one or more users, optionally creating a
   * notification alert (`notify`, defaults to `true`).
   *
   * @example
   * ```ts
   * await sdk.messages.send({
   *   recipientUserIds: [userId],
   *   subject: 'Your report is ready',
   *   body: 'The generated report is attached to this message.',
   *   sourceRef: { type: 'report', id: reportId },
   * }, await headers());
   * ```
   */
  async send(input: SendMessageInput, requestHeaders?: Headers): Promise<SendMessageResult> {
    const pluginId = requestHeaders ? getPluginId(requestHeaders) : null;
    return requireHost().messages.send(input, pluginId);
  },
};
