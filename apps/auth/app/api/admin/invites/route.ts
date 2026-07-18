import { NextResponse } from 'next/server';
import { checkAdminKey } from '@/src/admin-guard';
import { authRun } from '@/src/db';
import type { NextRequest } from 'next/server';

interface InviteBody {
  email: string;
  expiresInDays?: number;
  invited_by_id?: string;
  invited_by_name?: string;
  /** Plugin IDs the invited user should be entitled to (RFC 0065 Task 1.17). Capture only — resolved into grants at registration by Task 2.23. */
  plugins?: string[];
}

export async function POST(request: Request): Promise<Response> {
  const denied = checkAdminKey(request);
  if (denied) return denied;

  const body = (await request.json()) as InviteBody;
  if (!body.email) {
    return NextResponse.json({ error: 'email is required' }, { status: 400 });
  }

  const token = crypto.randomUUID();
  const createdAt = Math.floor(Date.now() / 1000);
  const expiresAt = body.expiresInDays != null ? createdAt + body.expiresInDays * 86400 : null;
  const plugins =
    Array.isArray(body.plugins) && body.plugins.length > 0 ? JSON.stringify(body.plugins) : null;

  await authRun(
    'INSERT INTO invites (token, email, created_at, expires_at, invited_by_id, invited_by_name, plugins) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [
      token,
      body.email,
      createdAt,
      expiresAt,
      body.invited_by_id ?? null,
      body.invited_by_name ?? null,
      plugins,
    ],
  );

  return NextResponse.json({ token, email: body.email }, { status: 201 });
}

export async function DELETE(request: NextRequest): Promise<Response> {
  const denied = checkAdminKey(request);
  if (denied) return denied;

  const email = request.nextUrl.searchParams.get('email');
  if (!email) {
    return NextResponse.json({ error: 'email query param is required' }, { status: 400 });
  }

  await authRun('DELETE FROM invites WHERE email = ? AND consumed_at IS NULL', [email]);

  return new Response(null, { status: 204 });
}
