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
    const h = await headers();
    const actorId = h.get('x-sovereign-user-id');
    const pluginId = h.get('x-sovereign-plugin-id');
    await requireHost().activity.log(entry, actorId, pluginId);
  },
};
