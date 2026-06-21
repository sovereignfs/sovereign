import { NextResponse } from 'next/server';

/**
 * Validates the `Authorization: Bearer <SOVEREIGN_ADMIN_KEY>` header on
 * internal runtime admin API routes. Returns a 403 response on failure, null
 * on success. Callers must return the response immediately if non-null.
 */
export function checkAdminKey(request: Request): NextResponse | null {
  const adminKey = process.env.SOVEREIGN_ADMIN_KEY;
  if (!adminKey) {
    // 503 Service Unavailable: the server is running but misconfigured.
    // 500 would imply a bug; the operator simply hasn't set the required key.
    return NextResponse.json({ error: 'SOVEREIGN_ADMIN_KEY is not configured' }, { status: 503 });
  }
  const auth = request.headers.get('authorization') ?? '';
  if (auth !== `Bearer ${adminKey}`) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  return null;
}
