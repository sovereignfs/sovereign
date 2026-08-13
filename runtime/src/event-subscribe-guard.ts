import type { SovereignManifest } from '@sovereignfs/manifest';
import { getPlatformDb } from './db';
import { authorizeChannel } from './event-authorization';
import { requireEventsPluginContext } from './plugin-events';
import { getDisabledPluginIds } from './plugin-status';
import { getInstalledPlugins } from './registry';

export interface EventSubscribeGuardDeps {
  getInstalledPlugins: () => readonly SovereignManifest[];
  getDisabledPluginIds: () => Promise<string[]>;
  authorizeChannel: typeof authorizeChannel;
}

const defaultDeps: EventSubscribeGuardDeps = {
  getInstalledPlugins,
  getDisabledPluginIds: async () => getDisabledPluginIds(await getPlatformDb()),
  authorizeChannel,
};

export type EventSubscribeGuardResult =
  | { ok: true; pluginId: string; channel: string; userId: string }
  | { ok: false; status: number; message: string };

/**
 * Shared validation for both `/api/events/stream` (SSE) and
 * `/api/events/poll` — a subscribe request must pass every one of these
 * checks, in order, before either route hands back live or recent events
 * (RFC 0045): a real session, well-formed `pluginId`/`channel` query params,
 * the target plugin installed and declaring `events:subscribe`, the target
 * plugin not disabled, and channel authorization. Fails closed at every
 * step — a missing or throwing check denies, never allows.
 */
export async function guardEventSubscription(
  request: Request,
  deps: EventSubscribeGuardDeps = defaultDeps,
): Promise<EventSubscribeGuardResult> {
  const userId = request.headers.get('x-sovereign-user-id');
  if (!userId) return { ok: false, status: 401, message: 'unauthenticated' };

  const url = new URL(request.url);
  const pluginId = url.searchParams.get('pluginId');
  const channel = url.searchParams.get('channel');
  if (!pluginId || !channel) {
    return {
      ok: false,
      status: 400,
      message: 'pluginId and channel query parameters are required',
    };
  }

  const manifest = deps.getInstalledPlugins().find((m) => m.id === pluginId);
  try {
    requireEventsPluginContext(pluginId, manifest, 'events:subscribe');
  } catch (err) {
    return { ok: false, status: 403, message: err instanceof Error ? err.message : 'forbidden' };
  }

  const disabledIds = await deps.getDisabledPluginIds();
  if (disabledIds.includes(pluginId)) {
    return { ok: false, status: 403, message: `Plugin "${pluginId}" is disabled.` };
  }

  const allowed = await deps.authorizeChannel(pluginId, channel, {
    userId,
    headers: request.headers,
  });
  if (!allowed) {
    return { ok: false, status: 403, message: 'Not authorized to subscribe to this channel.' };
  }

  return { ok: true, pluginId, channel, userId };
}
