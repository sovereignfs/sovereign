import { NextResponse } from 'next/server';
import { getUserGroupById, removeUserGroupMember } from '@sovereignfs/db';
import { checkAdminKey } from '@/src/admin-guard';
import { logActivity } from '@/src/activity';
import { getPlatformDb } from '@/src/db';

interface RouteParams {
  params: Promise<{ id: string; userId: string }>;
}

export async function DELETE(request: Request, { params }: RouteParams): Promise<Response> {
  const denied = checkAdminKey(request);
  if (denied) return denied;

  const { id, userId } = await params;
  const pdb = await getPlatformDb();
  const group = await getUserGroupById(pdb, id);
  if (!group) return NextResponse.json({ error: 'group not found' }, { status: 404 });

  await removeUserGroupMember(pdb, id, userId);

  void logActivity({
    actorId: request.headers.get('x-sovereign-user-id'),
    actorType: 'user',
    action: 'group.member_removed',
    targetType: 'group',
    targetId: id,
    subjectUserId: userId,
    visibility: 'admin',
    summary: `User removed from group "${group.name}"`,
    metadata: { groupId: id, userId },
  });

  return NextResponse.json({ groupId: id, userId });
}
