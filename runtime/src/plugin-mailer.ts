/**
 * Permission and rate-limit gates for `sdk.mailer.send()` and
 * `sdk.email.sendToUser()` (RFC 0062). Kept free of the plugin registry and
 * platform DB so the permission logic is independently unit-testable — the
 * caller (`runtime/src/sdk-host.ts`) supplies the resolved manifest.
 */

export const PLUGIN_MAILER_RATE_LIMIT_WINDOW_MS = 60_000;
export const PLUGIN_MAILER_RATE_LIMIT_MAX_PER_PLUGIN = 20;
export const PLUGIN_MAILER_RATE_LIMIT_MAX_PER_RECIPIENT = 3;

interface RateLimitBucket {
  resetAt: number;
  count: number;
}

const pluginBuckets = new Map<string, RateLimitBucket>();
const recipientBuckets = new Map<string, RateLimitBucket>();

export interface PluginMailerRateLimitResult {
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
    buckets.set(key, { resetAt: now + PLUGIN_MAILER_RATE_LIMIT_WINDOW_MS, count: 1 });
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
 * `recipientKey` should be the recipient user ID for `sendToUser`, or a
 * fixed sentinel (e.g. `'external'`) for the low-level `mailer.send` escape
 * hatch, which has no single recipient identity to key on.
 */
export function checkPluginMailerRateLimit(
  pluginId: string,
  recipientKey: string,
  now = Date.now(),
): PluginMailerRateLimitResult {
  const pluginResult = checkBucket(
    pluginBuckets,
    pluginId,
    PLUGIN_MAILER_RATE_LIMIT_MAX_PER_PLUGIN,
    now,
  );
  if (!pluginResult.allowed) return { ...pluginResult, scope: 'plugin' };

  const recipientResult = checkBucket(
    recipientBuckets,
    `${pluginId}:${recipientKey}`,
    PLUGIN_MAILER_RATE_LIMIT_MAX_PER_RECIPIENT,
    now,
  );
  if (!recipientResult.allowed) return { ...recipientResult, scope: 'recipient' };

  return { allowed: true };
}

export function resetPluginMailerRateLimitForTests(): void {
  pluginBuckets.clear();
  recipientBuckets.clear();
}

export interface MailerPermissionManifest {
  permissions: readonly string[];
}

export type MailerPermission = 'mailer:send' | 'mailer:sendExternal';

/**
 * Verifies a plugin route context exists, the calling plugin is installed,
 * and it declares `permission`. Throws a descriptive error otherwise; returns
 * the narrowed, non-null `pluginId` and manifest on success so callers don't
 * need to re-check either.
 */
export function requireMailerPluginContext<M extends MailerPermissionManifest>(
  pluginId: string | null,
  manifest: M | undefined,
  permission: MailerPermission,
): { pluginId: string; manifest: M } {
  if (!pluginId) {
    throw new Error(
      'sdk.mailer and sdk.email require a plugin route context (x-sovereign-plugin-id header missing).',
    );
  }
  if (!manifest) {
    throw new Error(`Calling plugin "${pluginId}" is not installed.`);
  }
  if (!manifest.permissions.includes(permission)) {
    throw new Error(`Plugin "${pluginId}" does not have the "${permission}" permission.`);
  }
  return { pluginId, manifest };
}
