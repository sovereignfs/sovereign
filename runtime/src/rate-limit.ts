import type { NextRequest } from 'next/server';

/**
 * General-purpose, IP-keyed request-flood protection for `runtime/middleware.ts`
 * — every path the middleware matcher covers (session-gated pages/API, the
 * anonymous public `/api/<slug>/*` namespace, and manifest-declared public
 * plugin page routes) had no abuse-prevention layer of its own before this;
 * only `apps/auth`'s better-auth server had one, and only for its own
 * sign-in/sign-up/reset endpoints. This is deliberately coarse — a floor
 * against naive scripted floods, not a per-endpoint policy — narrower,
 * feature-specific limits (`checkDirectoryRateLimit`, `checkPluginMailerRateLimit`)
 * already exist for their own routes and are unaffected by this.
 *
 * Same fixed-window bucket shape as `directory.ts`/`plugin-mailer.ts`, applied
 * per client IP instead of per user/plugin. In-memory and per-process: this
 * runs inside `middleware.ts`, which executes in the Edge runtime — for a
 * self-hosted `next start` deployment (this platform's only deployment model;
 * see `docs/self-hosting.md`) that Edge sandbox lives inside the same
 * long-lived Node process for the life of the container, so module state
 * persists across requests exactly as it does for the Node-runtime limiters
 * above. It does not survive a restart and is not shared across multiple
 * instances behind a load balancer — the same accepted limitation already
 * documented for better-auth's own `storage: 'memory'` rate limiter
 * (`apps/auth/src/auth.ts`, `docs/security.md`).
 */

const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_MAX_REQUESTS = 300;

interface RateLimitBucket {
  resetAt: number;
  count: number;
}

const buckets = new Map<string, RateLimitBucket>();

export interface GlobalRateLimitResult {
  allowed: boolean;
  retryAfterSeconds?: number;
}

function windowMs(): number {
  const raw = Number(process.env.SOVEREIGN_RATE_LIMIT_WINDOW_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_WINDOW_MS;
}

function maxRequests(): number {
  const raw = Number(process.env.SOVEREIGN_RATE_LIMIT_MAX_REQUESTS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_MAX_REQUESTS;
}

/** Off switch for operators who front the instance with their own rate
 *  limiting (e.g. a WAF/CDN) and don't want this layer doubling up. Unset
 *  (the default) means enabled — this is a security control, so it fails
 *  closed rather than requiring an opt-in. */
export function isGlobalRateLimitDisabled(): boolean {
  const v = process.env.SOVEREIGN_RATE_LIMIT_DISABLED?.toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

export function checkGlobalRateLimit(key: string, now = Date.now()): GlobalRateLimitResult {
  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { resetAt: now + windowMs(), count: 1 });
    return { allowed: true };
  }

  if (existing.count >= maxRequests()) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }

  existing.count += 1;
  return { allowed: true };
}

export function resetGlobalRateLimitForTests(): void {
  buckets.clear();
}

/**
 * Resolves the caller's IP from `X-Forwarded-For`, trusting the **last**
 * entry rather than the first. With exactly one reverse proxy in front (the
 * only topology `docs/self-hosting.md` documents — Caddy/nginx/Traefik
 * `reverse_proxy` to this container), a proxy appends the peer IP it
 * actually observed to any existing header value rather than replacing it,
 * so the last entry is the one the client cannot forge by sending its own
 * `X-Forwarded-For` — the first entry can be. Falls back to `X-Real-IP`,
 * then a fixed sentinel (which collapses every such caller into one shared
 * bucket — a safe fail-open rather than skipping the check).
 *
 * This assumes the runtime is reachable **only** through that documented
 * proxy hop. An instance with the runtime port also exposed directly has no
 * proxy to correct a forged header, and IP-based limiting can be bypassed —
 * the same class of trust boundary already implicit in how this platform
 * relies on the proxy for TLS termination.
 */
export function clientIp(request: NextRequest): string {
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
