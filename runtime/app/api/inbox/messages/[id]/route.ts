import { NextResponse } from 'next/server';
import {
  archiveMessage,
  deleteUserMessage,
  getUserMessage,
  markMessageRead,
  markMessageUnread,
  markNotificationsReadByDedupeKey,
  unarchiveMessage,
} from '@sovereignfs/db';
import { getPlatformDb } from '@/src/db';

/**
 * GET /api/inbox/messages/[id] — one message's full detail (RFC 0048),
 * scoped to its owning recipient. Fetching auto-marks the message read and
 * clears its linked notification (RFC 0048 §3: "reading the message should
 * mark related message notifications read"), via the `message:<id>`
 * dedupeKey `runtime/src/messages.ts` stamped on send.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const userId = request.headers.get('x-sovereign-user-id');
  if (!userId) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const { id } = await params;
  const pdb = await getPlatformDb();
  const message = await getUserMessage(pdb, id, userId);
  if (!message) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  if (!message.readAt) {
    await markMessageRead(pdb, id, userId);
    await markNotificationsReadByDedupeKey(pdb, `message:${id}`, userId);
    message.readAt = Math.floor(Date.now() / 1000);
  }

  return NextResponse.json({ message });
}

/** POST /api/inbox/messages/[id] — { action: 'unread' | 'archive' | 'unarchive' | 'delete' }. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const userId = request.headers.get('x-sovereign-user-id');
  if (!userId) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const { id } = await params;
  const body = (await request.json()) as { action: string };
  const pdb = await getPlatformDb();

  if (body.action === 'unread') {
    await markMessageUnread(pdb, id, userId);
    return NextResponse.json({ ok: true });
  }
  if (body.action === 'archive') {
    await archiveMessage(pdb, id, userId);
    return NextResponse.json({ ok: true });
  }
  if (body.action === 'unarchive') {
    await unarchiveMessage(pdb, id, userId);
    return NextResponse.json({ ok: true });
  }
  if (body.action === 'delete') {
    await deleteUserMessage(pdb, id, userId);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'unknown action' }, { status: 400 });
}
