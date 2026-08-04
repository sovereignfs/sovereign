import { NextResponse } from 'next/server';

/**
 * Liveness probe, unauthenticated. This service holds no user data — no
 * sensitivity concern in leaving it reachable, same as apps/auth's.
 */
export function GET(): Response {
  return NextResponse.json({ status: 'ok' });
}
