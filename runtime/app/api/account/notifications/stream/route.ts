import { countUnreadNotifications, listUserNotifications } from '@sovereignfs/db';
import { getPlatformDb } from '@/src/db';

export const dynamic = 'force-dynamic';

/**
 * GET /api/account/notifications/stream — SSE event stream.
 *
 * Sends the current inbox snapshot immediately, then pushes delta updates
 * every `pollIntervalSecs` seconds. Used when the platform setting
 * `notification_transport` = `'sse'`; polling (`/api/account/notifications`)
 * is the default.
 */
export async function GET(request: Request): Promise<Response> {
  const userId = request.headers.get('x-sovereign-user-id');
  if (!userId) return new Response('unauthenticated', { status: 401 });

  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        if (closed) return;
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      const push = async () => {
        if (closed) return;
        try {
          const pdb = await getPlatformDb();
          const [items, unread] = await Promise.all([
            listUserNotifications(pdb, userId, { limit: 50 }),
            countUnreadNotifications(pdb, userId),
          ]);
          send('notifications', { notifications: items, unreadCount: unread });
        } catch {
          // Silently skip on transient DB errors — client will retry.
        }
      };

      await push();
      const interval = setInterval(() => void push(), 30_000);

      request.signal.addEventListener('abort', () => {
        closed = true;
        clearInterval(interval);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
