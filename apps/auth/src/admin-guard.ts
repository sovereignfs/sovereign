import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { checkAdminRateLimit, clientIp, recordAdminKeyFailure } from './admin-rate-limit';
import { getEnv } from './env';

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * Returns a 403 response if the request lacks a valid admin bearer token,
 * or 429 if the caller's IP has failed this check too many times recently
 * — see `admin-rate-limit.ts`'s own doc comment for why only failures
 * count.
 */
export function checkAdminKey(request: Request): NextResponse | null {
  const ip = clientIp(request);
  const limited = checkAdminRateLimit(ip);
  if (!limited.allowed) {
    return NextResponse.json(
      { error: 'Too many failed admin key attempts. Try again later.' },
      { status: 429, headers: { 'Retry-After': String(limited.retryAfterSeconds) } },
    );
  }
  const auth = request.headers.get('authorization') ?? '';
  const expected = `Bearer ${getEnv().adminKey}`;
  if (!safeEqual(auth, expected)) {
    recordAdminKeyFailure(ip);
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  return null;
}
