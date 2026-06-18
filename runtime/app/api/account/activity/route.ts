import { NextResponse } from 'next/server';
import { listUserActivity } from '@sovereignfs/db';
import { getPlatformDb } from '@/src/db';

/** Personal activity feed for the current user (RFC 0005). */
export async function GET(request: Request): Promise<Response> {
  const userId = request.headers.get('x-sovereign-user-id');
  if (!userId) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const url = new URL(request.url);
  const limit = Math.min(Number(url.searchParams.get('limit') ?? '50'), 200);

  const rows = await listUserActivity(await getPlatformDb(), userId, limit);
  return NextResponse.json({ events: rows });
}
