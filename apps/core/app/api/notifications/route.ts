import {
  authorizationResponse,
  requireSameOrigin,
  requireSession,
} from '../../../src/auth/authorize';
import { getNotificationService } from '../../../src/notifications';

export const dynamic = 'force-dynamic';

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  });

/**
 * The signed-in person's notifications and how many are unread, for core's own panel (core-app §4.1). The account is the session's,
 * never anything in the request. This is core's route and not the Core API's: it answers to a cookie, not to an app's token.
 */
export async function GET(): Promise<Response> {
  try {
    const session = await requireSession();
    const service = await getNotificationService();
    const [notifications, unread] = await Promise.all([
      service.list(session.user.id, { limit: 50 }),
      service.unreadCount(session.user.id),
    ]);
    return json({ unread, notifications });
  } catch (error) {
    const refused = authorizationResponse(error);
    if (refused) return refused;
    throw error;
  }
}

const ACTIONS = new Set(['read', 'read-all', 'dismiss', 'dismiss-all']);

/** Marks one or all of the person's own notifications read, or dismisses them: `{ action, id? }`. */
export async function POST(request: Request): Promise<Response> {
  try {
    requireSameOrigin(request);
    const session = await requireSession();
    const body = (await request.json().catch(() => undefined)) as
      { action?: unknown; id?: unknown } | undefined;
    const action = typeof body?.action === 'string' ? body.action : '';
    const id = typeof body?.id === 'string' ? body.id : undefined;
    if (!ACTIONS.has(action) || ((action === 'read' || action === 'dismiss') && !id)) {
      return json({ error: 'invalid_request' }, 400);
    }
    const service = await getNotificationService();
    const userId = session.user.id;
    if (action === 'read') await service.markRead(userId, id as string);
    else if (action === 'dismiss') await service.dismiss(userId, id as string);
    else if (action === 'read-all') await service.markAllRead(userId);
    else await service.dismissAll(userId);
    return json({ ok: true });
  } catch (error) {
    const refused = authorizationResponse(error);
    if (refused) return refused;
    throw error;
  }
}
