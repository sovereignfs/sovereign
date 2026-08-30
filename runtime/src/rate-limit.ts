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
 * instances behind a load balancer — this in-memory, per-process design is
 * now the one remaining single-instance rate-limiting gap (better-auth's own
 * limiter moved to `storage: 'database'` per the `0.94.16` Status entry in
 * `CLAUDE.md`), tracked by the paused Task 2.29 (`docs/epics/platform-shell.md`).
 * The lazy eviction below bounds this module's own memory growth; it does not
 * address the multi-instance/shared-store gap Task 2.29 covers.
 */

const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_MAX_REQUESTS = 300;

/** How often a call opportunistically sweeps expired entries — not a timer;
 *  the Edge runtime this module executes in has no background interval
 *  available the way scheduler.ts/jobs.ts/backup-worker.ts do. */
const EVICTION_INTERVAL_MS = 5 * 60_000;

interface RateLimitBucket {
  resetAt: number;
  count: number;
}

const buckets = new Map<string, RateLimitBucket>();
let lastSweepAt = 0;

/** Delete every entry whose window has already expired. Gated to run at
 *  most once per `EVICTION_INTERVAL_MS`, not on every call — a full-Map scan
 *  on every request would defeat the point of bounding cost in a hot path. */
function sweepExpired(now: number): void {
  if (now - lastSweepAt < EVICTION_INTERVAL_MS) return;
  lastSweepAt = now;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

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
  sweepExpired(now);
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
  lastSweepAt = 0;
}

/** Test-only: the number of live entries in the bucket Map, to assert
 *  eviction actually shrinks it — `buckets` itself is not exported. */
export function rateLimitBucketCountForTests(): number {
  return buckets.size;
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
 *
 * Typed for the plain `Request` all three built-in fetch-API types satisfy
 * (`NextRequest extends Request`) — only `.headers.get()` is used, so this
 * also works from `admin-guard.ts`'s route handlers, which receive a plain
 * `Request`, not a `NextRequest`.
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
