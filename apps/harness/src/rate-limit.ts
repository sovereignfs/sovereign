/**
 * Minimal per-key rate limiting, copied and adapted from
 * apps/relay/src/rate-limit.ts (same fixed-window bucket shape as
 * runtime/src/rate-limit.ts) — apps/harness must not depend on runtime
 * (same independence apps/auth/apps/relay already keep).
 *
 * `/api/enroll` is keyed by caller IP (pre-authentication). `/api/chat` is
 * keyed by `instanceId` (post-authentication) plus a global concurrency cap
 * (RFC 0063 §6) — a single self-hosted instance's own call volume
 * shouldn't be starved by an unrelated bucket, but the concurrency cap
 * protects the shared local inference engine regardless of caller identity.
 */

interface RateLimitBucket {
  resetAt: number;
  count: number;
}

const enrollBuckets = new Map<string, RateLimitBucket>();
const chatBuckets = new Map<string, RateLimitBucket>();

const ENROLL_WINDOW_MS = 60_000;
const ENROLL_MAX = 10;
const CHAT_WINDOW_MS = 60_000;
const CHAT_MAX = 60;

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

export function checkChatRateLimit(instanceId: string, now = Date.now()) {
  return check(chatBuckets, instanceId, CHAT_WINDOW_MS, CHAT_MAX, now);
}

/** @internal test-only reset. */
export function resetRateLimitsForTests(): void {
  enrollBuckets.clear();
  chatBuckets.clear();
}

/** Same IP-resolution logic as apps/relay's `clientIp` — duplicated here
 *  for the same independence reason as the rest of this file. */
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

let inFlightChatRequests = 0;

/** Global concurrency cap (RFC 0063 §6's "concurrency cap") — protects the
 *  single local inference engine from being overwhelmed regardless of which
 *  caller/instance a request comes from. Must be paired with a `finally`
 *  call to `releaseChatSlot()`. */
export function tryAcquireChatSlot(maxConcurrency: number): boolean {
  if (inFlightChatRequests >= maxConcurrency) return false;
  inFlightChatRequests += 1;
  return true;
}

export function releaseChatSlot(): void {
  inFlightChatRequests = Math.max(0, inFlightChatRequests - 1);
}

/** @internal test-only reset. */
export function resetConcurrencyForTests(): void {
  inFlightChatRequests = 0;
}
