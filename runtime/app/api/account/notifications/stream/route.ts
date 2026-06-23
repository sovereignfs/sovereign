import { getBroker } from '@/src/notification-broker';
import type { NotificationPayload } from '@/src/notification-broker';

export const dynamic = 'force-dynamic';

/**
 * GET /api/account/notifications/stream — event-driven SSE stream.
 *
 * Returns 503 when NOTIFICATION_TRANSPORT=polling (the default) — callers
 * must not connect in that mode. In sse/redis mode, the stream stays open and
 * emits one `data:` line per incoming notification for this user.
 *
 * A heartbeat comment is sent every NOTIFICATION_HEARTBEAT_INTERVAL ms
 * (default 25 s) to keep the connection alive through reverse-proxy idle
 * timeouts (common default: 30 s).
 */
export async function GET(request: Request): Promise<Response> {
  const broker = getBroker();

  if (!broker) {
    return new Response('Transport is polling; SSE unavailable.', { status: 503 });
  }

  const userId = request.headers.get('x-sovereign-user-id');
  if (!userId) return new Response('unauthenticated', { status: 401 });

  const heartbeatMs = Number(process.env.NOTIFICATION_HEARTBEAT_INTERVAL ?? '25000');
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const send = (payload: NotificationPayload) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      };

      const unsubscribe = broker.subscribe(userId, send);

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
