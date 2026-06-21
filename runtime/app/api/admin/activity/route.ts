import { NextResponse } from 'next/server';
import { countAdminActivity, listAdminActivity } from '@sovereignfs/db';
import { checkAdminKey } from '@/src/admin-guard';
import { getPlatformDb } from '@/src/db';

/** Platform-wide activity feed — admin only (RFC 0005). */
export async function GET(request: Request): Promise<Response> {
  const denied = checkAdminKey(request);
  if (denied) return denied;

  const url = new URL(request.url);
  const actorId = url.searchParams.get('actorId') ?? undefined;
  const action = url.searchParams.get('action') ?? undefined;
  const limit = Math.min(Number(url.searchParams.get('limit') ?? '50'), 500);
  const offset = Math.max(0, Number(url.searchParams.get('offset') ?? '0'));

  const pdb = await getPlatformDb();
  const [rows, total] = await Promise.all([
    listAdminActivity(pdb, { actorId, action, limit, offset }),
    countAdminActivity(pdb, { actorId, action }),
  ]);
  return NextResponse.json({ events: rows, total, limit, offset });
}
