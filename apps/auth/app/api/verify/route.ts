import { NextResponse } from 'next/server';
import { getAuth } from '@/src/auth';

/**
 * Session verification for the runtime. Returns the authenticated user or 401.
 * Consumed by the runtime middleware as the fallback when local cookie-cache
 * verification has no cookie to read (SRS AUTH-05/06).
 *
 * `returnHeaders` surfaces better-auth's Set-Cookie — with the cookie cache
 * enabled, `getSession` (re)issues the signed `session_data` cookie here, and we
 * forward it so the runtime installs/refreshes it and verifies locally next time.
 */
export async function GET(request: Request): Promise<Response> {
  const { headers, response: session } = await getAuth().api.getSession({
    headers: request.headers,
    returnHeaders: true,
  });
  if (!session) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const user = session.user as {
    id: string;
    email: string;
    name?: string | null;
    image?: string | null;
    role?: string;
    active?: boolean;
  };

  if (user.active === false) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const setCookie = headers.get('set-cookie');
  return NextResponse.json(
    {
      user: {
        id: user.id,
        email: user.email,
        name: user.name ?? null,
        image: user.image ?? null,
        role: user.role ?? 'platform:user',
      },
      expiresAt: Math.floor(new Date(session.session.expiresAt).getTime() / 1000),
    },
    setCookie ? { headers: { 'set-cookie': setCookie } } : undefined,
  );
}
