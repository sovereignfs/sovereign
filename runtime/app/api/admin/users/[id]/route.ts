import { NextResponse } from 'next/server';
import { DEFAULT_TENANT_ID } from '@sovereignfs/db';
import { checkAdminKey } from '@/src/admin-guard';
import { logActivity } from '@/src/activity';
import { deleteUser } from '@/src/user-deletion';
import { sendPlatformEmail } from '@/src/platform-email';

const AUTH_URL = process.env.SOVEREIGN_AUTH_URL ?? 'http://localhost:3001';

/**
 * DELETE /api/admin/users/[id]?deleteData=true
 *
 * Admin-initiated full account deletion (RFC 0033). Requires the admin key and
 * the `user:manage` capability (enforced by the admin key guard which is used
 * by all internal runtime admin routes). Cannot target a platform:owner.
 *
 * Without ?deleteData=true this route returns 400 — use the auth server's PATCH
 * route for deactivation.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const denied = checkAdminKey(request);
  if (denied) return denied;

  const url = new URL(request.url);
  if (url.searchParams.get('deleteData') !== 'true') {
    return NextResponse.json(
      { error: 'Pass ?deleteData=true to confirm permanent deletion.' },
      { status: 400 },
    );
  }

  const { id: targetUserId } = await params;
  const actorId = request.headers.get('x-sovereign-user-id');

  // Guard: cannot delete a platform:owner.
  const adminKey = process.env.SOVEREIGN_ADMIN_KEY ?? '';
  const usersRes = await fetch(`${AUTH_URL}/api/admin/users`, {
    headers: { Authorization: `Bearer ${adminKey}` },
  });
  if (usersRes.ok) {
    const members = (await usersRes.json()) as Array<{
      id: string | null;
      role: string | null;
      email: string | null;
    }>;
    const target = members.find((m) => m.id === targetUserId);
    if (!target) {
      return NextResponse.json({ error: 'user not found' }, { status: 404 });
    }
    if (target.role === 'platform:owner') {
      return NextResponse.json(
        { error: 'The platform owner account cannot be deleted.' },
        { status: 403 },
      );
    }
    if (target.email) {
      await sendPlatformEmail({
        templateId: 'console.account_deleted',
        deliveryClass: 'security',
        toUserId: targetUserId,
        toEmail: target.email,
        actorUserId: actorId,
        source: 'runtime',
        subject: 'Your Sovereign account was deleted',
        text: 'An administrator deleted your Sovereign account.',
        html: '<p>An administrator deleted your Sovereign account.</p>',
        metadata: { selfService: false },
      });
    }
  }

  void logActivity({
    actorId,
    actorType: 'user',
    action: 'account.deleted',
    subjectUserId: targetUserId,
    targetType: 'user',
    targetId: targetUserId,
    visibility: 'admin',
    summary: 'Admin deleted user account and all data',
    metadata: { targetUserId },
  });

  const summary = await deleteUser(targetUserId, DEFAULT_TENANT_ID);
  const deletedAt = new Date().toISOString();

  return NextResponse.json({ deletedAt, summary });
}
