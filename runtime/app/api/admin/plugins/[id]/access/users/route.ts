import { NextResponse } from 'next/server';
import { grantPluginAccessUser } from '@sovereignfs/db';
import { checkAdminKey } from '@/src/admin-guard';
import { logActivity } from '@/src/activity';
import { getPlatformDb } from '@/src/db';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** POST /api/admin/plugins/[id]/access/users — grant a user direct plugin access. */
export async function POST(request: Request, { params }: RouteParams): Promise<Response> {
  const denied = checkAdminKey(request);
  if (denied) return denied;

  const { id } = await params;
  const body = (await request.json()) as { userId?: unknown };
  if (typeof body.userId !== 'string' || body.userId.trim() === '') {
    return NextResponse.json({ error: 'userId (non-empty string) is required' }, { status: 400 });
  }

  const actorId = request.headers.get('x-sovereign-user-id');
  if (!actorId) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  await grantPluginAccessUser(await getPlatformDb(), id, body.userId, actorId);

  void logActivity({
    actorId,
    actorType: 'user',
    action: 'plugin.access_user_granted',
    targetType: 'plugin',
    targetId: id,
    visibility: 'admin',
    summary: `Granted plugin ${id} access to a user`,
    metadata: { pluginId: id, userId: body.userId },
  });

  return NextResponse.json({ pluginId: id, userId: body.userId });
}
