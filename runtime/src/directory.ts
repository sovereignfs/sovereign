import type { DirectoryUser, ResolveUsersInput, SearchUsersInput } from '@sovereignfs/sdk';

export const DIRECTORY_MIN_QUERY_LENGTH = 2;
export const DIRECTORY_DEFAULT_LIMIT = 20;
export const DIRECTORY_MAX_LIMIT = 50;
export const DIRECTORY_RATE_LIMIT_WINDOW_MS = 60_000;
export const DIRECTORY_RATE_LIMIT_MAX_REQUESTS = 60;

/** How often a call opportunistically sweeps expired entries — not a timer;
 *  see `rate-limit.ts`'s identical constant for why (this module duplicates
 *  the bucket shape rather than sharing one, per its own existing pattern). */
const EVICTION_INTERVAL_MS = 5 * 60_000;

interface RateLimitBucket {
  resetAt: number;
  count: number;
}

const buckets = new Map<string, RateLimitBucket>();
let lastSweepAt = 0;

/** Delete every entry whose window has already expired. Gated to run at
 *  most once per `EVICTION_INTERVAL_MS`, not on every call. */
function sweepExpired(now: number): void {
  if (now - lastSweepAt < EVICTION_INTERVAL_MS) return;
  lastSweepAt = now;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export interface DirectoryRateLimitResult {
  allowed: boolean;
  retryAfterSeconds?: number;
}

export function checkDirectoryRateLimit(key: string, now = Date.now()): DirectoryRateLimitResult {
  sweepExpired(now);
  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { resetAt: now + DIRECTORY_RATE_LIMIT_WINDOW_MS, count: 1 });
    return { allowed: true };
  }

  if (existing.count >= DIRECTORY_RATE_LIMIT_MAX_REQUESTS) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }

  existing.count += 1;
  return { allowed: true };
}

export function resetDirectoryRateLimitForTests(): void {
  buckets.clear();
  lastSweepAt = 0;
}

/** Test-only: the number of live entries in the bucket Map. */
export function directoryRateLimitBucketCountForTests(): number {
  return buckets.size;
}

function boundedLimit(limit: unknown): number {
  if (limit === undefined) return DIRECTORY_DEFAULT_LIMIT;
  if (typeof limit !== 'number' || !Number.isInteger(limit) || limit < 1) {
    throw new Error('limit must be a positive integer.');
  }
  return Math.min(limit, DIRECTORY_MAX_LIMIT);
}

export function normalizeSearchUsersInput(input: SearchUsersInput): SearchUsersInput {
  const query = input.query.trim();
  if (query.length < DIRECTORY_MIN_QUERY_LENGTH) {
    throw new Error(`query must be at least ${String(DIRECTORY_MIN_QUERY_LENGTH)} characters.`);
  }
  return {
    query,
    limit: boundedLimit(input.limit),
  };
}

export function normalizeResolveUsersInput(input: ResolveUsersInput): ResolveUsersInput {
  const ids = Array.from(new Set(input.ids.map((id) => id.trim()).filter(Boolean)));
  if (ids.length === 0) return { ids: [] };
  if (ids.length > DIRECTORY_MAX_LIMIT) {
    throw new Error(`ids is limited to ${String(DIRECTORY_MAX_LIMIT)} users per request.`);
  }
  return { ids };
}

export function toDirectoryUsers(rows: readonly unknown[]): DirectoryUser[] {
  return rows.flatMap((row) => {
    if (!row || typeof row !== 'object') return [];
    const value = row as Record<string, unknown>;
    if (typeof value.id !== 'string' || typeof value.email !== 'string') return [];
    return [
      {
        id: value.id,
        email: value.email,
        name: typeof value.name === 'string' ? value.name : null,
        image: typeof value.image === 'string' ? value.image : null,
      },
    ];
  });
}
