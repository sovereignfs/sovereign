import { NextResponse } from 'next/server';
import { revokeConsentGrant } from '@sovereignfs/db';
import { getPlatformDb } from '@/src/db';

function currentUserId(request: Request): string | null {
  return request.headers.get('x-sovereign-user-id');
}

/** Revoke a consent grant by ID (RFC 0002). Only the owning user may revoke. */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const userId = currentUserId(request);
  if (!userId) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const { id } = await params;
  await revokeConsentGrant(await getPlatformDb(), id, userId);
  return new NextResponse(null, { status: 204 });
}
