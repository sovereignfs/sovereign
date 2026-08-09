/**
 * Minimal per-key rate limiting for the relay's two endpoints (RFC 0087's
 * "Minimal, revocable per-instance authentication" — "basic abuse
 * prevention... not strong authorization"). Same fixed-window bucket shape
 * as `runtime/src/rate-limit.ts`, copied rather than imported: `apps/relay`
 * must not depend on `runtime` (same independence `apps/auth` already
 * keeps), and this service's whole design principle is a minimal, self-
 * contained surface.
 *
 * `/v1/enroll` is keyed by caller IP (pre-authentication — no other signal
 * exists yet). `/v1/push` is keyed by `instanceId` (post-authentication, once
 * the enrollment token verifies) — an instance's own call volume shouldn't be
 * throttled by unrelated callers sharing a NAT/proxy IP.
 */

interface RateLimitBucket {
  resetAt: number;
  count: number;
}

const enrollBuckets = new Map<string, RateLimitBucket>();
const pushBuckets = new Map<string, RateLimitBucket>();

const ENROLL_WINDOW_MS = 60_000;
const ENROLL_MAX = 10;
const PUSH_WINDOW_MS = 60_000;
const PUSH_MAX = 600;

function check(
  buckets: Map<string, RateLimitBucket>,
  key: string,
  windowMs: number,
  max: number,
  now: number,
): { allowed: boolean; retryAfterSeconds?: number } {
  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { resetAt: now + windowMs, count: 1 });
    return { allowed: true };
  }
  if (existing.count >= max) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }
  existing.count += 1;
  return { allowed: true };
}

export function checkEnrollRateLimit(ip: string, now = Date.now()) {
  return check(enrollBuckets, ip, ENROLL_WINDOW_MS, ENROLL_MAX, now);
}

export function checkPushRateLimit(instanceId: string, now = Date.now()) {
  return check(pushBuckets, instanceId, PUSH_WINDOW_MS, PUSH_MAX, now);
}

/** @internal test-only reset. */
export function resetRateLimitsForTests(): void {
  enrollBuckets.clear();
  pushBuckets.clear();
}

/** Same IP-resolution logic as `runtime/src/rate-limit.ts`'s `clientIp` —
 *  trusts the last `X-Forwarded-For` hop (the one a single trusted reverse
 *  proxy itself appended), duplicated here for the same independence reason
 *  as the rest of this file. */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const hops = forwarded
      .split(',')
      .map((hop) => hop.trim())
      .filter(Boolean);
    const last = hops.at(-1);
    if (last) return last;
  }
  const realIp = request.headers.get('x-real-ip')?.trim();
  if (realIp) return realIp;
  return 'unknown';
}
