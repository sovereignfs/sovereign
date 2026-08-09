import { NextResponse } from 'next/server';
import { deletePushDeviceToken } from '@sovereignfs/db';
import { getPlatformDb } from '@/src/db';

/**
 * DELETE /api/account/push-device-token/:id
 * Revokes one device token — sign-out, instance removal, or explicit
 * opt-out. Scoped to the requesting user; an id that doesn't belong to them
 * (or doesn't exist) 404s rather than silently succeeding.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const userId = request.headers.get('x-sovereign-user-id');
  if (!userId) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const { id } = await params;
  const pdb = await getPlatformDb();
  const deleted = await deletePushDeviceToken(pdb, id, userId);
  if (!deleted) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
