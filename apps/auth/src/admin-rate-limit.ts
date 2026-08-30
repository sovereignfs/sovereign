/**
 * Dedicated per-IP rate limiter for the `SOVEREIGN_ADMIN_KEY` bearer-token
 * check (`admin-guard.ts`'s `checkAdminKey()`) — the sole authorization
 * boundary for this service's own `/api/admin/*` routes. Mirrors
 * `runtime/src/admin-rate-limit.ts` exactly (same bucket shape, same
 * failure-only counting rationale — see that file's own doc comment for
 * the full explanation); duplicated here rather than imported, since
 * `apps/auth` deliberately doesn't depend on `runtime/src/*` across the
 * service boundary.
 */

const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_MAX_FAILURES = 10;

interface RateLimitBucket {
  resetAt: number;
  count: number;
}

const buckets = new Map<string, RateLimitBucket>();

export interface AdminRateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

function windowMs(): number {
  const raw = Number(process.env.SOVEREIGN_ADMIN_RATE_LIMIT_WINDOW_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_WINDOW_MS;
}

function maxFailures(): number {
  const raw = Number(process.env.SOVEREIGN_ADMIN_RATE_LIMIT_MAX_FAILURES);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_MAX_FAILURES;
}

/**
 * Whether `key` (a client IP) is currently allowed to attempt the admin key
 * check. Does not itself count as an attempt — call `recordAdminKeyFailure`
 * separately after an actual failed comparison. A `key` with no bucket, or
 * one whose window has expired, is always allowed.
 */
export function checkAdminRateLimit(key: string, now = Date.now()): AdminRateLimitResult {
  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    return { allowed: true, retryAfterSeconds: 0 };
  }
  if (existing.count >= maxFailures()) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }
  return { allowed: true, retryAfterSeconds: 0 };
}

/** Records one failed admin-key comparison from `key` (a client IP). */
export function recordAdminKeyFailure(key: string, now = Date.now()): void {
  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { resetAt: now + windowMs(), count: 1 });
    return;
  }
  existing.count += 1;
}

export function resetAdminRateLimitForTests(): void {
  buckets.clear();
}

/**
 * Resolves the caller's IP the same way `runtime/src/rate-limit.ts`'s
 * `clientIp()` does — trusts the **last** `X-Forwarded-For` hop (the one a
 * single documented reverse-proxy topology actually appended), falling
 * back to `X-Real-IP`, then a fixed sentinel. Duplicated rather than
 * imported for the same service-boundary reason as the rest of this file.
 */
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
