import { NextResponse } from 'next/server';
import { checkAdminKey } from '@/src/admin-guard';
import { authGet, authRun } from '@/src/db';

interface PatchBody {
  role?: string;
  active?: boolean;
  resetMfa?: boolean;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const denied = checkAdminKey(request);
  if (denied) return denied;

  const { id } = await params;
  const body = (await request.json()) as PatchBody;

  // Owner protection (RFC 0021): the platform:owner role cannot be changed,
  // and the owner account cannot be deactivated. Prevents accidental lockout.
  const target = await authGet<{ role: string }>('SELECT role FROM "user" WHERE id = ?', [id]);
  if (target?.role === 'platform:owner' && ('role' in body || 'active' in body)) {
    return NextResponse.json(
      { error: 'The platform owner role and account status cannot be changed via this API.' },
      { status: 403 },
    );
  }

  const now = new Date().toISOString(); // better-auth stores dates as ISO/timestamp

  // `user` is a reserved word in Postgres and the date columns are camelCase, so
  // both are quoted to keep the SQL portable. `active` is bound as a boolean and
  // mapped to 0/1 for SQLite by the query layer.
  if ('role' in body) {
    await authRun('UPDATE "user" SET role = ?, "updatedAt" = ? WHERE id = ?', [body.role, now, id]);
  }

  if ('active' in body) {
    await authRun('UPDATE "user" SET active = ?, "updatedAt" = ? WHERE id = ?', [
      body.active,
      now,
      id,
    ]);
  }

  // Admin MFA reset: clears TOTP secret and backup codes from twoFactor table,
  // and removes all registered passkeys. The user's next login will succeed
  // without MFA, after which they can re-enroll (RFC 0012 break-glass).
  if (body.resetMfa) {
    await authRun('DELETE FROM "twoFactor" WHERE "userId" = ?', [id]);
    await authRun('DELETE FROM "passkey" WHERE "userId" = ?', [id]);
    await authRun('UPDATE "user" SET "twoFactorEnabled" = ?, "updatedAt" = ? WHERE id = ?', [
      false,
      now,
      id,
    ]);
  }

  const updated = await authGet<{
    id: string;
    email: string;
    name: string | null;
    role: string;
    active: number | boolean | null;
    createdAt: string | Date;
  }>('SELECT id, email, name, role, active, "createdAt" FROM "user" WHERE id = ?', [id]);

  if (!updated) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  return NextResponse.json({
    id: updated.id,
    email: updated.email,
    name: updated.name,
    role: updated.role,
    active: updated.active !== 0 && updated.active !== false,
    createdAt:
      updated.createdAt instanceof Date ? updated.createdAt.toISOString() : updated.createdAt,
  });
}

/**
 * DELETE /api/admin/users/[id]
 *
 * Permanently removes a user's auth record (user row, sessions, accounts,
 * verification tokens, twoFactor, passkeys). Called by the runtime's deletion
 * cascade after platform-table and plugin data has already been wiped.
 * Requires the admin key; cannot target platform:owner.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const denied = checkAdminKey(request);
  if (denied) return denied;

  const { id } = await params;

  const target = await authGet<{ role: string }>('SELECT role FROM "user" WHERE id = ?', [id]);
  if (!target) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
  if (target.role === 'platform:owner') {
    return NextResponse.json(
      { error: 'The platform owner account cannot be deleted.' },
      { status: 403 },
    );
  }

  // Remove all auth-managed rows for this user in dependency order.
  await authRun('DELETE FROM "twoFactor" WHERE "userId" = ?', [id]);
  await authRun('DELETE FROM "passkey" WHERE "userId" = ?', [id]);
  await authRun('DELETE FROM verification WHERE identifier = ?', [id]);
  await authRun('DELETE FROM account WHERE "userId" = ?', [id]);
  await authRun('DELETE FROM session WHERE "userId" = ?', [id]);
  await authRun('DELETE FROM "user" WHERE id = ?', [id]);

  return new Response(null, { status: 204 });
}
