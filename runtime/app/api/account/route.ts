import { NextResponse } from 'next/server';
import { DEFAULT_TENANT_ID } from '@sovereignfs/db';
import { logActivity } from '@/src/activity';
import { deleteUser } from '@/src/user-deletion';
import { sendPlatformEmail } from '@/src/platform-email';

const AUTH_URL = process.env.SOVEREIGN_AUTH_URL ?? 'http://localhost:3001';

/**
 * DELETE /api/account — self-service account deletion (RFC 0033).
 *
 * Requires the current user's session (x-sovereign-user-id injected by
 * middleware) and password re-verification. Returns 409 if the user is the
 * sole platform:owner (last owner cannot self-delete). On success, clears
 * session cookies and returns { deletedAt } so the client can redirect to
 * /login?accountDeleted=1.
 */
export async function DELETE(request: Request): Promise<Response> {
  const userId = request.headers.get('x-sovereign-user-id');
  const userEmail = request.headers.get('x-sovereign-user-email');
  if (!userId || !userEmail) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  let password: string | undefined;
  try {
    const body = (await request.json()) as { password?: string };
    password = body.password;
  } catch {
    return NextResponse.json({ error: 'invalid request body' }, { status: 400 });
  }

  if (!password) {
    return NextResponse.json({ error: 'password is required' }, { status: 400 });
  }

  // Verify credentials server-to-server before proceeding.
  const verifyRes = await fetch(`${AUTH_URL}/api/auth/sign-in/email`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: AUTH_URL,
    },
    body: JSON.stringify({ email: userEmail, password }),
  });
  if (!verifyRes.ok) {
    return NextResponse.json({ error: 'incorrect password' }, { status: 403 });
  }

  // Guard: sole platform:owner cannot self-delete.
  const adminKey = process.env.SOVEREIGN_ADMIN_KEY ?? '';
  const usersRes = await fetch(`${AUTH_URL}/api/admin/users`, {
    headers: { Authorization: `Bearer ${adminKey}` },
  });
  if (usersRes.ok) {
    const members = (await usersRes.json()) as Array<{ id: string | null; role: string | null }>;
    const owners = members.filter((m) => m.role === 'platform:owner' && m.id);
    if (owners.length === 1 && owners[0]?.id === userId) {
      return NextResponse.json(
        { error: 'You are the sole owner. Assign another owner before deleting your account.' },
        { status: 409 },
      );
    }
  }

  void logActivity({
    actorId: userId,
    actorType: 'user',
    action: 'account.self_deleted',
    visibility: 'admin',
    summary: 'User initiated account deletion',
    metadata: { userId },
  });

  await sendPlatformEmail({
    templateId: 'account.account_deleted',
    deliveryClass: 'security',
    toUserId: userId,
    toEmail: userEmail,
    actorUserId: userId,
    source: 'runtime',
    subject: 'Your Sovereign account was deleted',
    text: 'Your Sovereign account deletion was processed.',
    html: '<p>Your Sovereign account deletion was processed.</p>',
    metadata: { selfService: true },
  });

  await deleteUser(userId, DEFAULT_TENANT_ID);

  const deletedAt = new Date().toISOString();
  const res = NextResponse.json({ deletedAt });

  // Clear session cache cookies so the browser can't re-enter the app.
  res.cookies.set('better-auth.session_token', '', { maxAge: 0, path: '/' });
  res.cookies.set('__Secure-better-auth.session_token', '', {
    maxAge: 0,
    path: '/',
    secure: true,
  });
  res.cookies.set('better-auth.session_data', '', { maxAge: 0, path: '/' });
  res.cookies.set('__Secure-better-auth.session_data', '', {
    maxAge: 0,
    path: '/',
    secure: true,
  });

  // Set redirect header so the client knows where to go.
  res.headers.set('x-sovereign-redirect', '/login?accountDeleted=1');

  return res;
}
