import { NextResponse } from 'next/server';
import {
  countUnreadNotifications,
  dismissNotification,
  listUserNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '@sovereignfs/db';
import { getPlatformDb } from '@/src/db';

/** GET /api/account/notifications — user inbox feed. */
export async function GET(request: Request): Promise<Response> {
  const userId = request.headers.get('x-sovereign-user-id');
  if (!userId) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const url = new URL(request.url);
  const limit = Math.min(Number(url.searchParams.get('limit') ?? '50'), 200);
  const includeDismissed = url.searchParams.get('includeDismissed') === 'true';

  const pdb = await getPlatformDb();
  const [items, unread] = await Promise.all([
    listUserNotifications(pdb, userId, { limit, includeDismissed }),
    countUnreadNotifications(pdb, userId),
  ]);

  return NextResponse.json({ notifications: items, unreadCount: unread });
}

/** POST /api/account/notifications — bulk actions (read-all, dismiss). */
export async function POST(request: Request): Promise<Response> {
  const userId = request.headers.get('x-sovereign-user-id');
  if (!userId) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const body = (await request.json()) as { action: string; id?: string };
  const pdb = await getPlatformDb();

  if (body.action === 'read-all') {
    await markAllNotificationsRead(pdb, userId);
    return NextResponse.json({ ok: true });
  }

  if (body.action === 'read' && body.id) {
    await markNotificationRead(pdb, body.id, userId);
    return NextResponse.json({ ok: true });
  }

  if (body.action === 'dismiss' && body.id) {
    await dismissNotification(pdb, body.id, userId);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'unknown action' }, { status: 400 });
}
