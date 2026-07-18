import { NextResponse } from 'next/server';
import { revokePluginAccessGroup } from '@sovereignfs/db';
import { checkAdminKey } from '@/src/admin-guard';
import { logActivity } from '@/src/activity';
import { getPlatformDb } from '@/src/db';

interface RouteParams {
  params: Promise<{ id: string; groupId: string }>;
}

/** DELETE /api/admin/plugins/[id]/access/groups/[groupId] — revoke a group's plugin access. */
export async function DELETE(request: Request, { params }: RouteParams): Promise<Response> {
  const denied = checkAdminKey(request);
  if (denied) return denied;

  const { id, groupId } = await params;
  await revokePluginAccessGroup(await getPlatformDb(), id, groupId);

  void logActivity({
    actorId: request.headers.get('x-sovereign-user-id'),
    actorType: 'user',
    action: 'plugin.access_group_revoked',
    targetType: 'plugin',
    targetId: id,
    visibility: 'admin',
    summary: `Revoked plugin ${id} access from a group`,
    metadata: { pluginId: id, groupId },
  });

  return NextResponse.json({ pluginId: id, groupId });
}
