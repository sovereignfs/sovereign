import { NextResponse } from 'next/server';
import { revokeUserCapability } from '@sovereignfs/db';
import { checkAdminKey } from '@/src/admin-guard';
import { logActivity } from '@/src/activity';
import { getPlatformDb } from '@/src/db';

interface RouteParams {
  params: Promise<{ id: string; capability: string }>;
}

export async function DELETE(request: Request, { params }: RouteParams): Promise<Response> {
  const denied = checkAdminKey(request);
  if (denied) return denied;

  const { id, capability } = await params;
  await revokeUserCapability(await getPlatformDb(), id, capability);

  void logActivity({
    actorId: request.headers.get('x-sovereign-user-id'),
    actorType: 'user',
    action: 'user.capability_revoked',
    subjectUserId: id,
    targetType: 'user',
    targetId: id,
    visibility: 'admin',
    summary: `Revoked "${capability}" from user`,
    metadata: { userId: id, capability },
  });

  return NextResponse.json({ userId: id, capability });
}
