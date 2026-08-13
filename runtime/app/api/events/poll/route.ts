import { getEventBroker } from '@/src/event-broker';
import { guardEventSubscription } from '@/src/event-subscribe-guard';

export const dynamic = 'force-dynamic';

/**
 * GET /api/events/poll?pluginId=<id>&channel=<channel>&sinceId=<id> —
 * polling fallback for `sdk.events` (RFC 0045), for `SOVEREIGN_EVENTS_TRANSPORT
 * =polling` or any client that can't hold an SSE connection open.
 *
 * Same authorization path as `/api/events/stream`
 * (`guardEventSubscription`) — polling is not a lesser-checked shortcut.
 * Reads from the event broker's bounded, per-process, in-memory ring buffer
 * (`event-ring-buffer.ts`) — **not** durable storage; a long-idle poller or
 * one hitting a different process in a multi-node deployment may miss
 * events, consistent with RFC 0045's best-effort delivery semantics.
 */
export async function GET(request: Request): Promise<Response> {
  const guard = await guardEventSubscription(request);
  if (!guard.ok) {
    return new Response(guard.message, { status: guard.status });
  }

  const sinceId = new URL(request.url).searchParams.get('sinceId') ?? undefined;
  const channel = `${guard.pluginId}:${guard.channel}`;
  const broker = getEventBroker();
  const events = broker ? broker.recent(channel, sinceId) : [];

  return Response.json({ events });
}
