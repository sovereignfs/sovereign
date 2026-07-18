import { NextResponse } from 'next/server';
import { grantPluginAccessGroup } from '@sovereignfs/db';
import { checkAdminKey } from '@/src/admin-guard';
import { logActivity } from '@/src/activity';
import { getPlatformDb } from '@/src/db';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** POST /api/admin/plugins/[id]/access/groups — grant a group plugin access. */
export async function POST(request: Request, { params }: RouteParams): Promise<Response> {
  const denied = checkAdminKey(request);
  if (denied) return denied;

  const { id } = await params;
  const body = (await request.json()) as { groupId?: unknown };
  if (typeof body.groupId !== 'string' || body.groupId.trim() === '') {
    return NextResponse.json({ error: 'groupId (non-empty string) is required' }, { status: 400 });
  }

  const actorId = request.headers.get('x-sovereign-user-id');
  if (!actorId) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  await grantPluginAccessGroup(await getPlatformDb(), id, body.groupId, actorId);

  void logActivity({
    actorId,
    actorType: 'user',
    action: 'plugin.access_group_granted',
    targetType: 'plugin',
    targetId: id,
    visibility: 'admin',
    summary: `Granted plugin ${id} access to a group`,
    metadata: { pluginId: id, groupId: body.groupId },
  });

  return NextResponse.json({ pluginId: id, groupId: body.groupId });
}
