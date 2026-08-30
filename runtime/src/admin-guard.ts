import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { checkAdminRateLimit, recordAdminKeyFailure } from './admin-rate-limit';
import { clientIp } from './rate-limit';

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * Validates the `Authorization: Bearer <SOVEREIGN_ADMIN_KEY>` header on
 * internal runtime admin API routes. Returns a 403 response on failure, null
 * on success. Callers must return the response immediately if non-null.
 *
 * The bearer token is the sole authorization boundary for the entire
 * `/api/admin/*` surface — middleware.ts's matcher deliberately excludes
 * this path, so it also gets none of checkGlobalRateLimit's per-IP flood
 * protection. A dedicated limiter here counts only failed comparisons
 * (never a successful one, so legitimate Console traffic is never
 * throttled) and returns 429 once an IP has guessed wrong too many times.
 */
export function checkAdminKey(request: Request): NextResponse | null {
  const adminKey = process.env.SOVEREIGN_ADMIN_KEY;
  if (!adminKey) {
    // 503 Service Unavailable: the server is running but misconfigured.
    // 500 would imply a bug; the operator simply hasn't set the required key.
    return NextResponse.json({ error: 'SOVEREIGN_ADMIN_KEY is not configured' }, { status: 503 });
  }
  const ip = clientIp(request);
  const limited = checkAdminRateLimit(ip);
  if (!limited.allowed) {
    return NextResponse.json(
      { error: 'Too many failed admin key attempts. Try again later.' },
      { status: 429, headers: { 'Retry-After': String(limited.retryAfterSeconds) } },
    );
  }
  const auth = request.headers.get('authorization') ?? '';
  if (!safeEqual(auth, `Bearer ${adminKey}`)) {
    recordAdminKeyFailure(ip);
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  return null;
}
