import { getEventBroker } from '@/src/event-broker';
import type { EventEnvelope } from '@/src/event-broker';
import { guardEventSubscription } from '@/src/event-subscribe-guard';

export const dynamic = 'force-dynamic';

/**
 * GET /api/events/stream?pluginId=<id>&channel=<channel> — event-driven SSE
 * stream for `sdk.events` (RFC 0045).
 *
 * Returns 503 when `SOVEREIGN_EVENTS_TRANSPORT=polling` — callers must use
 * `/api/events/poll` instead in that mode. In sse/redis mode, the stream
 * stays open and emits one `data:` line per event published to the
 * namespaced `<pluginId>:<channel>`, once `guardEventSubscription` has
 * verified the session, the target plugin's `events:subscribe` permission
 * and enabled state, and channel authorization (fails closed on any of
 * these).
 *
 * A heartbeat comment is sent every `NOTIFICATION_HEARTBEAT_INTERVAL` ms
 * (default 25s, shared with the notification stream — both exist purely to
 * survive reverse-proxy idle timeouts, no feature-specific meaning) to keep
 * the connection alive.
 */
export async function GET(request: Request): Promise<Response> {
  if ((process.env.SOVEREIGN_EVENTS_TRANSPORT ?? 'sse') === 'polling') {
    return new Response('Transport is polling; SSE unavailable.', { status: 503 });
  }

  const broker = getEventBroker();
  if (!broker) {
    return new Response('Event broker unavailable.', { status: 503 });
  }

  const guard = await guardEventSubscription(request);
  if (!guard.ok) {
    return new Response(guard.message, { status: guard.status });
  }

  const channel = `${guard.pluginId}:${guard.channel}`;
  const heartbeatMs = Number(process.env.NOTIFICATION_HEARTBEAT_INTERVAL ?? '25000');
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const send = (envelope: EventEnvelope) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(envelope)}\n\n`));
      };

      const unsubscribe = broker.subscribe(channel, send);

      const heartbeat = setInterval(() => {
        controller.enqueue(encoder.encode(': heartbeat\n\n'));
      }, heartbeatMs);

      request.signal.addEventListener('abort', () => {
        unsubscribe();
        clearInterval(heartbeat);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
