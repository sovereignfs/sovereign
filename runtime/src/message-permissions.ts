/**
 * Permission and rate-limit gates for `sdk.messages.send()` (RFC 0048).
 * Mirrors `runtime/src/plugin-mailer.ts`'s shape exactly — kept free of the
 * plugin registry and platform DB so the permission logic is independently
 * unit-testable; the caller (`runtime/src/sdk-host.ts`) supplies the
 * resolved manifest.
 */

export const MESSAGE_RATE_LIMIT_WINDOW_MS = 60_000;
export const MESSAGE_RATE_LIMIT_MAX_PER_PLUGIN = 20;
export const MESSAGE_RATE_LIMIT_MAX_PER_RECIPIENT = 3;

/** How often a call opportunistically sweeps expired entries — not a timer;
 *  see `rate-limit.ts`'s identical constant for why. */
const EVICTION_INTERVAL_MS = 5 * 60_000;

interface RateLimitBucket {
  resetAt: number;
  count: number;
}

const pluginBuckets = new Map<string, RateLimitBucket>();
const recipientBuckets = new Map<string, RateLimitBucket>();
let lastSweepAt = 0;

function sweepExpired(now: number): void {
  if (now - lastSweepAt < EVICTION_INTERVAL_MS) return;
  lastSweepAt = now;
  for (const [key, bucket] of pluginBuckets) {
    if (bucket.resetAt <= now) pluginBuckets.delete(key);
  }
  for (const [key, bucket] of recipientBuckets) {
    if (bucket.resetAt <= now) recipientBuckets.delete(key);
  }
}

export interface MessageRateLimitResult {
  allowed: boolean;
  retryAfterSeconds?: number;
  scope?: 'plugin' | 'recipient';
}

function checkBucket(
  buckets: Map<string, RateLimitBucket>,
  key: string,
  max: number,
  now: number,
): { allowed: boolean; retryAfterSeconds?: number } {
  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { resetAt: now + MESSAGE_RATE_LIMIT_WINDOW_MS, count: 1 });
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

/**
 * Enforces both a per-plugin and a per-recipient sliding-window limit.
 * `recipientKey` is a single recipient user ID — for a multi-recipient
 * `sdk.messages.send()` call, the caller checks once per recipient (see
 * `runtime/src/messages.ts`'s `sendPluginMessage`), so a batch send to many
 * users is throttled the same way N individual sends would be.
 */
export function checkMessageRateLimit(
  pluginId: string,
  recipientKey: string,
  now = Date.now(),
): MessageRateLimitResult {
  sweepExpired(now);
  const pluginResult = checkBucket(pluginBuckets, pluginId, MESSAGE_RATE_LIMIT_MAX_PER_PLUGIN, now);
  if (!pluginResult.allowed) return { ...pluginResult, scope: 'plugin' };

  const recipientResult = checkBucket(
    recipientBuckets,
    `${pluginId}:${recipientKey}`,
    MESSAGE_RATE_LIMIT_MAX_PER_RECIPIENT,
    now,
  );
  if (!recipientResult.allowed) return { ...recipientResult, scope: 'recipient' };

  return { allowed: true };
}

export function resetMessageRateLimitForTests(): void {
  pluginBuckets.clear();
  recipientBuckets.clear();
  lastSweepAt = 0;
}

/** Test-only: the combined number of live entries across both bucket Maps. */
export function messageRateLimitBucketCountForTests(): number {
  return pluginBuckets.size + recipientBuckets.size;
}

export interface MessagePermissionManifest {
  permissions: readonly string[];
}

/**
 * Verifies a plugin route context exists, the calling plugin is installed,
 * and it declares `messages:send`. Throws a descriptive error otherwise;
 * returns the narrowed, non-null `pluginId` and manifest on success so
 * callers don't need to re-check either.
 */
export function requireMessagePluginContext<M extends MessagePermissionManifest>(
  pluginId: string | null,
  manifest: M | undefined,
): { pluginId: string; manifest: M } {
  if (!pluginId) {
    throw new Error(
      'sdk.messages requires a plugin route context (x-sovereign-plugin-id header missing).',
    );
  }
  if (!manifest) {
    throw new Error(`Calling plugin "${pluginId}" is not installed.`);
  }
  if (!manifest.permissions.includes('messages:send')) {
    throw new Error(`Plugin "${pluginId}" does not have the "messages:send" permission.`);
  }
  return { pluginId, manifest };
}
