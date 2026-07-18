import { NextResponse } from 'next/server';
import { revokePluginAccessUser } from '@sovereignfs/db';
import { checkAdminKey } from '@/src/admin-guard';
import { logActivity } from '@/src/activity';
import { getPlatformDb } from '@/src/db';

interface RouteParams {
  params: Promise<{ id: string; userId: string }>;
}

/** DELETE /api/admin/plugins/[id]/access/users/[userId] — revoke a user's direct plugin access. */
export async function DELETE(request: Request, { params }: RouteParams): Promise<Response> {
  const denied = checkAdminKey(request);
  if (denied) return denied;

  const { id, userId } = await params;
  await revokePluginAccessUser(await getPlatformDb(), id, userId);

  void logActivity({
    actorId: request.headers.get('x-sovereign-user-id'),
    actorType: 'user',
    action: 'plugin.access_user_revoked',
    targetType: 'plugin',
    targetId: id,
    visibility: 'admin',
    summary: `Revoked plugin ${id} access from a user`,
    metadata: { pluginId: id, userId },
  });

  return NextResponse.json({ pluginId: id, userId });
}
