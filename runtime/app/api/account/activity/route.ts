import { NextResponse } from 'next/server';
import { countUserActivity, listUserActivity } from '@sovereignfs/db';
import { getPlatformDb } from '@/src/db';

/** Personal activity feed for the current user (RFC 0005). */
export async function GET(request: Request): Promise<Response> {
  const userId = request.headers.get('x-sovereign-user-id');
  if (!userId) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const url = new URL(request.url);
  const limit = Math.min(Number(url.searchParams.get('limit') ?? '50'), 200);
  const offset = Math.max(0, Number(url.searchParams.get('offset') ?? '0'));

  const pdb = await getPlatformDb();
  const [rows, total] = await Promise.all([
    listUserActivity(pdb, userId, limit, offset),
    countUserActivity(pdb, userId),
  ]);
  return NextResponse.json({ events: rows, total, limit, offset });
}
