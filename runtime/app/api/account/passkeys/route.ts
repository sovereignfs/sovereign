import { NextResponse } from 'next/server';

const AUTH_URL =
  process.env.SOVEREIGN_AUTH_URL ?? `http://localhost:${process.env.AUTH_PORT ?? '3001'}`;

/**
 * GET /api/account/passkeys — list the current user's registered passkeys.
 * Proxies to the auth server's passkey list endpoint (session-gated by the
 * runtime middleware, which injects x-sovereign-user-id).
 */
export async function GET(request: Request): Promise<Response> {
  if (!request.headers.get('x-sovereign-user-id')) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const cookie = request.headers.get('cookie') ?? '';
  const res = await fetch(`${AUTH_URL}/api/auth/passkey/list-user-passkeys`, {
    headers: { cookie, origin: AUTH_URL },
  });
  if (!res.ok)
    return NextResponse.json({ error: 'failed to list passkeys' }, { status: res.status });
  const passkeys = await res.json();
  return NextResponse.json(passkeys);
}
