/**
 * Permission and rate-limit gates for `sdk.notifications.*` (RFC 0015, RFC
 * 0048). Reuses the existing `notifications:send` permission for the whole
 * surface — `send` included — rather than adding a new manifest string,
 * since every current caller already declares it and needing both send and
 * read-your-own-inbox from the same plugin is the expected shape, not an
 * edge case.
 *
 * `send` used to go unenforced (no trusted-identity check, no permission
 * check, no rate limit) while every other method here already gated on
 * `requireNotificationsPluginContext` — RFC 0048 §7 explicitly calls this
 * out as a hardening gap to close before `sdk.messages.send()` ships, since
 * it's the same class of abuse surface. Closed here: `pluginId` is now
 * `string | null` throughout (a missing/forged `x-sovereign-plugin-id`
 * header is rejected, never laundered into a literal `'unknown'` source),
 * and a rate limiter mirrors `runtime/src/plugin-mailer.ts`'s shape exactly.
 *
 * Kept free of the plugin registry and platform DB so this stays
 * independently unit-testable — the caller (`runtime/src/sdk-host.ts`)
 * supplies the resolved manifest.
 */

export const NOTIFICATION_RATE_LIMIT_WINDOW_MS = 60_000;
export const NOTIFICATION_RATE_LIMIT_MAX_PER_PLUGIN = 60;
export const NOTIFICATION_RATE_LIMIT_MAX_PER_RECIPIENT = 10;

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

export interface NotificationRateLimitResult {
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
    buckets.set(key, { resetAt: now + NOTIFICATION_RATE_LIMIT_WINDOW_MS, count: 1 });
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

/** Enforces both a per-plugin and a per-recipient sliding-window limit, mirroring `checkPluginMailerRateLimit`. */
export function checkNotificationRateLimit(
  pluginId: string,
  recipientUserId: string,
  now = Date.now(),
): NotificationRateLimitResult {
  sweepExpired(now);
  const pluginResult = checkBucket(
    pluginBuckets,
    pluginId,
    NOTIFICATION_RATE_LIMIT_MAX_PER_PLUGIN,
    now,
  );
  if (!pluginResult.allowed) return { ...pluginResult, scope: 'plugin' };

  const recipientResult = checkBucket(
    recipientBuckets,
    `${pluginId}:${recipientUserId}`,
    NOTIFICATION_RATE_LIMIT_MAX_PER_RECIPIENT,
    now,
  );
  if (!recipientResult.allowed) return { ...recipientResult, scope: 'recipient' };

  return { allowed: true };
}

export function resetNotificationRateLimitForTests(): void {
  pluginBuckets.clear();
  recipientBuckets.clear();
  lastSweepAt = 0;
}

/** Test-only: the combined number of live entries across both bucket Maps. */
export function notificationRateLimitBucketCountForTests(): number {
  return pluginBuckets.size + recipientBuckets.size;
}

/** The minimal manifest slice this module needs — keeps tests independent of the full schema. */
export interface NotificationsPermissionManifest {
  id: string;
  permissions: readonly string[];
}

/**
 * Verifies a plugin route context exists, the calling plugin is installed,
 * and it declares `notifications:send`. Throws a descriptive error
 * otherwise. `pluginId` is `string | null` — a `null` (missing/forged
 * `x-sovereign-plugin-id` header) is rejected here rather than by the
 * caller pre-filtering it, so `send()` and the read/manage methods share
 * one identical rejection path.
 */
export function requireNotificationsPluginContext(
  pluginId: string | null,
  manifest: NotificationsPermissionManifest | undefined,
): asserts pluginId is string {
  if (!pluginId) {
    throw new Error(
      'sdk.notifications requires a plugin route context (x-sovereign-plugin-id header missing).',
    );
  }
  if (!manifest) {
    throw new Error(`Calling plugin "${pluginId}" is not installed.`);
  }
  if (!manifest.permissions.includes('notifications:send')) {
    throw new Error(`Plugin "${pluginId}" does not have the "notifications:send" permission.`);
  }
}
