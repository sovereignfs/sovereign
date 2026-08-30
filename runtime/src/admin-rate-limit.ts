/**
 * Dedicated per-IP rate limiter for the `SOVEREIGN_ADMIN_KEY` bearer-token
 * check (`admin-guard.ts`'s `checkAdminKey()`) — the sole authorization
 * boundary for the entire `/api/admin/*` surface. `middleware.ts`'s matcher
 * deliberately excludes this path (self-authenticated by design), so it
 * gets none of `checkGlobalRateLimit`'s per-IP flood protection either.
 *
 * Unlike `rate-limit.ts`/`directory.ts`'s limiters, which increment on
 * every checked call, this one increments **only on a failed key
 * comparison** — `checkAdminKey` is the single call point behind every
 * `/api/admin/*` route (e.g. Console's `adminFetch`, called on every admin
 * action with the correct key), so counting successes too would throttle
 * legitimate traffic instead of just repeated bad-key guesses. Same
 * in-memory, per-process fixed-window bucket shape and limitation as the
 * other two — see `rate-limit.ts`'s own doc comment.
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
