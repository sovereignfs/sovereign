import { NextResponse } from 'next/server';
import { addUserGroupMember, getUserGroupById, listUserGroupMembers } from '@sovereignfs/db';
import { checkAdminKey } from '@/src/admin-guard';
import { logActivity } from '@/src/activity';
import { getPlatformDb } from '@/src/db';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, { params }: RouteParams): Promise<Response> {
  const denied = checkAdminKey(request);
  if (denied) return denied;

  const { id } = await params;
  const pdb = await getPlatformDb();
  const group = await getUserGroupById(pdb, id);
  if (!group) return NextResponse.json({ error: 'group not found' }, { status: 404 });

  const members = await listUserGroupMembers(pdb, id);
  return NextResponse.json(members);
}

export async function POST(request: Request, { params }: RouteParams): Promise<Response> {
  const denied = checkAdminKey(request);
  if (denied) return denied;

  const { id } = await params;
  const pdb = await getPlatformDb();
  const group = await getUserGroupById(pdb, id);
  if (!group) return NextResponse.json({ error: 'group not found' }, { status: 404 });

  const body = (await request.json()) as { userId?: unknown };
  if (typeof body.userId !== 'string' || body.userId.trim() === '') {
    return NextResponse.json({ error: 'userId (string) is required' }, { status: 400 });
  }

  const actorId = request.headers.get('x-sovereign-user-id');
  if (!actorId) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  await addUserGroupMember(pdb, id, body.userId, actorId);

  void logActivity({
    actorId,
    actorType: 'user',
    action: 'group.member_added',
    targetType: 'group',
    targetId: id,
    subjectUserId: body.userId,
    visibility: 'admin',
    summary: `User added to group "${group.name}"`,
    metadata: { groupId: id, userId: body.userId },
  });

  return NextResponse.json({ groupId: id, userId: body.userId });
}
