import { NextResponse } from 'next/server';
import { getUserNotification } from '@sovereignfs/db';
import { getPlatformDb } from '@/src/db';

/** GET /api/account/notifications/[id] — one notification's full detail (RFC 0048), scoped to its owning recipient. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const userId = request.headers.get('x-sovereign-user-id');
  if (!userId) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const { id } = await params;
  const pdb = await getPlatformDb();
  const notification = await getUserNotification(pdb, id, userId);
  if (!notification) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  return NextResponse.json({ notification });
}
