import { requireHost } from './host';
import type { PublishEventInput } from './types';

function getPluginId(headers: Headers): string | null {
  return headers.get('x-sovereign-plugin-id');
}

/**
 * Plugin events and realtime channels (RFC 0045).
 *
 * Requires the `events:publish` manifest permission. `sdk.events` is for
 * low-latency, ephemeral application state updates — list changes,
 * presence, cursors, progress updates. It is **not** a durable queue, not a
 * notification inbox (`sdk.notifications`), and not an audit log
 * (`sdk.activity`): events are best-effort, unordered across processes, and
 * not persisted by default.
 *
 * There is deliberately no `sdk.events.subscribe()` — clients subscribe via
 * a runtime route (`GET /api/events/stream?pluginId=<id>&channel=<channel>`),
 * not a server-side SDK call. Channel authorization is manifest-declared
 * (the `events` field), not a runtime `sdk.events.authorizeChannel()` call —
 * see `docs/plugin-development.md`'s "events" section for why.
 */
export const events = {
  /**
   * Publish one event to a plugin-local channel.
   *
   * The runtime prefixes `channel` with the calling plugin's ID (injected
   * via `x-sovereign-plugin-id`) before publishing — plugins cannot publish
   * into another plugin's channel namespace.
   *
   * @example
   * ```ts
   * await sdk.events.publish({
   *   channel: `list:${listId}`,
   *   type: 'item.checked',
   *   payload: { itemId },
   * });
   * ```
   */
  async publish(input: PublishEventInput, requestHeaders?: Headers): Promise<void> {
    const pluginId = requestHeaders ? (getPluginId(requestHeaders) ?? 'unknown') : 'unknown';
    return requireHost().events.publish(input, pluginId);
  },
};
