import { NextResponse } from 'next/server';
import { grantUserCapability, listUserCapabilityGrants } from '@sovereignfs/db';
import { checkAdminKey } from '@/src/admin-guard';
import { logActivity } from '@/src/activity';
import { isGrantableCapability } from '@/src/capabilities';
import { getPlatformDb } from '@/src/db';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** List a user's individual capability grants (RFC 0070) — role-derived capabilities are not included. */
export async function GET(request: Request, { params }: RouteParams): Promise<Response> {
  const denied = checkAdminKey(request);
  if (denied) return denied;

  const { id } = await params;
  const grants = await listUserCapabilityGrants(await getPlatformDb(), id);
  return NextResponse.json(grants);
}

export async function POST(request: Request, { params }: RouteParams): Promise<Response> {
  const denied = checkAdminKey(request);
  if (denied) return denied;

  const { id } = await params;
  const body = (await request.json()) as { capability?: unknown };
  if (typeof body.capability !== 'string' || !isGrantableCapability(body.capability)) {
    return NextResponse.json(
      { error: 'capability must be one of the grantable capabilities' },
      { status: 400 },
    );
  }

  const actorId = request.headers.get('x-sovereign-user-id');
  if (!actorId) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  await grantUserCapability(await getPlatformDb(), id, body.capability, actorId);

  void logActivity({
    actorId,
    actorType: 'user',
    action: 'user.capability_granted',
    subjectUserId: id,
    targetType: 'user',
    targetId: id,
    visibility: 'admin',
    summary: `Granted "${body.capability}" to user`,
    metadata: { userId: id, capability: body.capability },
  });

  return NextResponse.json({ userId: id, capability: body.capability });
}
