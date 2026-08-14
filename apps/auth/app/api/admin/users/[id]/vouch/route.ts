import { NextResponse } from 'next/server';
import { checkAdminKey } from '@/src/admin-guard';
import { authGet } from '@/src/db';
import { setVerificationLevel } from '@/src/verification';

interface VouchBody {
  /** Admin user id recorded on the verification event. */
  vouchedBy: string;
}

/**
 * POST /api/admin/users/[id]/vouch
 *
 * Admin-vouch: promotes a user straight to verification Level 3
 * (admin_vouched, RFC 0035 §5.5). Plugin-callable advancement to Level 3 is
 * explicitly out of scope (RFC rejects it) — this Console-only path is the
 * sole way to reach it. Owner protection mirrors the sibling PATCH route:
 * the platform:owner account's verification level isn't managed here (it
 * has no practical meaning for an account that already has every capability).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const denied = checkAdminKey(request);
  if (denied) return denied;

  const { id } = await params;
  const body = (await request.json()) as VouchBody;

  const target = await authGet<{ role: string; email: string }>(
    'SELECT role, email FROM "user" WHERE id = ?',
    [id],
  );
  if (!target) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
  if (target.role === 'platform:owner') {
    return NextResponse.json(
      { error: 'The platform owner cannot be vouched — the role already implies full trust.' },
      { status: 403 },
    );
  }

  await setVerificationLevel(id, 3, {
    type: 'vouched',
    at: Math.floor(Date.now() / 1000),
    by: body.vouchedBy,
  });

  return NextResponse.json({ id, email: target.email, verificationLevel: 3 });
}

/**
 * DELETE /api/admin/users/[id]/vouch
 *
 * Revoke-vouch: drops a Level 3 user back to Level 2. Does not re-derive
 * from email/MFA signals (unlike the self-healing recompute in auth.ts) —
 * revoking a vouch is an explicit admin action, not a signal change, so it
 * always lands on Level 2 regardless of what email/MFA state says.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const denied = checkAdminKey(request);
  if (denied) return denied;

  const { id } = await params;
  const body = (await request.json()) as VouchBody;

  const target = await authGet<{ role: string; email: string }>(
    'SELECT role, email FROM "user" WHERE id = ?',
    [id],
  );
  if (!target) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  await setVerificationLevel(id, 2, {
    type: 'vouch_revoked',
    at: Math.floor(Date.now() / 1000),
    by: body.vouchedBy,
  });

  return NextResponse.json({ id, email: target.email, verificationLevel: 2 });
}
