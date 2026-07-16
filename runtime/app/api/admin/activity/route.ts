import { NextResponse } from 'next/server';
import { countAdminActivity, listAdminActivity } from '@sovereignfs/db';
import { checkAdminKey } from '@/src/admin-guard';
import { logActivity } from '@/src/activity';
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

interface AdminActivityWriteRequest {
  actorId?: string | null;
  actorType?: 'user' | 'system' | 'plugin';
  action?: string;
  subjectUserId?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  pluginId?: string | null;
  visibility?: 'admin' | 'user';
  summary?: string | null;
  metadata?: Record<string, unknown> | null;
}

/**
 * Narrow write path into the platform activity log for callers outside the
 * runtime process — currently `apps/auth`, which cannot reach `@sovereignfs/db`
 * directly (separate app, separate database). Admin-key-guarded, same as GET.
 */
export async function POST(request: Request): Promise<Response> {
  const denied = checkAdminKey(request);
  if (denied) return denied;

  const body = (await request.json().catch(() => null)) as AdminActivityWriteRequest | null;
  if (!body?.action || !body.actorType || !body.visibility) {
    return NextResponse.json(
      { error: 'action, actorType, and visibility required' },
      { status: 400 },
    );
  }

  await logActivity({
    actorId: body.actorId ?? null,
    actorType: body.actorType,
    action: body.action,
    subjectUserId: body.subjectUserId ?? null,
    targetType: body.targetType ?? null,
    targetId: body.targetId ?? null,
    pluginId: body.pluginId ?? null,
    visibility: body.visibility,
    summary: body.summary ?? null,
    metadata: body.metadata ?? null,
  });

  return NextResponse.json({ ok: true });
}
