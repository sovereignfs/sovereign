import { NextResponse } from 'next/server';
import { listAdminActivity } from '@sovereignfs/db';
import { checkAdminKey } from '@/src/admin-guard';
import { getPlatformDb } from '@/src/db';

/** Platform-wide activity feed — admin only (RFC 0005). */
export async function GET(request: Request): Promise<Response> {
  const denied = checkAdminKey(request);
  if (denied) return denied;

  const url = new URL(request.url);
  const actorId = url.searchParams.get('actorId') ?? undefined;
  const action = url.searchParams.get('action') ?? undefined;
  const limit = Math.min(Number(url.searchParams.get('limit') ?? '100'), 500);

  const rows = await listAdminActivity(await getPlatformDb(), { actorId, action, limit });
  return NextResponse.json({ events: rows });
}
