import { NextResponse } from 'next/server';
import { checkAdminKey } from '@/src/admin-guard';
import { authGet } from '@/src/db';

interface InviteLookupBody {
  token?: string;
}

interface InviteRow {
  email: string;
  invited_by_name: string | null;
  consumed_at: number | string | null;
  expires_at: number | string | null;
}

export async function POST(request: Request): Promise<Response> {
  const denied = checkAdminKey(request);
  if (denied) return denied;

  const body = (await request.json()) as InviteLookupBody;
  if (!body.token) {
    return NextResponse.json({ error: 'token is required' }, { status: 400 });
  }

  const invite = await authGet<InviteRow>(
    'SELECT email, invited_by_name, consumed_at, expires_at FROM invites WHERE token = ?',
    [body.token],
  );
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = invite?.expires_at == null ? null : Number(invite.expires_at);
  const consumedAt = invite?.consumed_at == null ? null : Number(invite.consumed_at);
  const invalid = !invite || consumedAt != null || (expiresAt != null && expiresAt <= now);

  if (invalid) {
    return NextResponse.json({ valid: false });
  }

  return NextResponse.json({
    valid: true,
    email: invite.email,
    invitedBy: invite.invited_by_name,
  });
}
