import { headers } from 'next/headers';
import { requireHost } from './host';
import type { ActivityLogEntry } from './types';

/**
 * Activity log (RFC 0005). Records a scoped audit event on behalf of the
 * current user; the runtime host injects the actor identity and plugin context
 * so plugins cannot forge them. Plugin-sourced events are always user-scoped.
 *
 * Requires the `activity:write` permission in the plugin manifest.
 */
export const activity = {
  async log(entry: ActivityLogEntry): Promise<void> {
    let actorId: string | null = null;
    let pluginId: string | null = null;
    try {
      const h = await headers();
      actorId = h.get('x-sovereign-user-id');
      pluginId = h.get('x-sovereign-plugin-id');
    } catch {
      // Outside a Next.js request context (e.g. a background job/schedule
      // handler logging a system action) — no header-derived actor/plugin
      // id available. The host falls back to the background-invocation
      // context for pluginId (same pattern as sdk.storage/sdk.db.getClient());
      // actorId stays null — there is no live user in a background invocation.
    }
    await requireHost().activity.log(entry, actorId, pluginId);
  },
};
