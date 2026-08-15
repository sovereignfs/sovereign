/**
 * Middleware plugin-gate lookups: disabled-plugin, entitlement/paywall,
 * access-policy (RFC 0065), and root-plugin (PLT-14) status, all fetched
 * from the runtime's own Node-runtime admin API since Edge middleware cannot
 * open the SQLite database directly. Every lookup here fails open (an error
 * or non-OK response yields the empty/no-restriction result) — these are
 * admin conveniences layered on top of, not a replacement for, the
 * adminOnly/paywall route decisions in `runtime/src/route-guard.ts`, which
 * consume these sets. Extracted from `runtime/middleware.ts` (Task 2.17) —
 * behavior unchanged at that point, purely a relocation.
 *
 * Task 2.18 added the short-lived in-process caches below for
 * `fetchDisabledPluginIds` and `fetchRootPluginPrefix` only, per that task's
 * measurement (`runtime/src/__tests__/middleware-regression.test.ts`'s
 * "middleware internal fetch counts by path type" describe block, and
 * `docs/epics/platform-shell.md`'s 2.18 status note): every request under a
 * plugin prefix makes 3 concurrent self-fetches (disabled, paywall,
 * restricted), root `/` makes 1 (root-plugin), and public `/api/*` makes 1
 * (disabled) — real, per-request cost with no batching today.
 * `fetchPaywalledPluginIds`/`fetchRestrictedPluginIds` are deliberately left
 * uncached, per the epic's explicit guidance: entitlement/access-policy
 * correctness (did a purchase or a policy change just take effect) is more
 * sensitive to staleness than "is this plugin off," and measurement showed
 * no distinct pressure on those two beyond the same per-request baseline the
 * epic already expected.
 */

const CACHE_TTL_MS = 3000;

interface TtlCacheEntry<T> {
  value: T;
  expiresAt: number;
}

// Self-fetch address for the runtime's own Node-runtime API routes. The server
// always listens on :3000 (scripts/dev.ts and the start script both pin it),
// so localhost is reliable in every environment — unlike the public URL, which
// may sit behind a reverse proxy the container cannot hairpin through.
export const SELF_URL = `http://localhost:${process.env.RUNTIME_PORT ?? process.env.PORT ?? '3000'}`;

let disabledPluginIdsCache: TtlCacheEntry<Set<string>> | null = null;

/**
 * Middleware runs on the Edge runtime, which cannot open the SQLite database.
 * Plugin enabled/disabled state is fetched from the runtime's own
 * /api/admin/plugins/disabled route (Node runtime, excluded from this
 * middleware's matcher) — same round-trip pattern as the auth /api/verify
 * check. Fails open: if the status fetch errors, the route stays reachable
 * (disable is an admin convenience, not a security boundary — adminOnly
 * gating below is independent of it).
 *
 * Cached in-process for `CACHE_TTL_MS` (global, not per-user — every request
 * shares one cache entry, matching the global scope of "which plugins are
 * disabled"). No explicit invalidation on the admin toggle mutation: that
 * mutation runs in the Node runtime, this cache lives in the Edge runtime's
 * module state, and coupling the two would mean importing middleware-only
 * internals into an unrelated admin route handler — fragile, and would
 * silently stop working the moment Edge middleware runs as an actually
 * separate isolate/process (the self-hosted "single Next server" deployment
 * this repo ships today happens to run both in one process, but that's an
 * implementation detail, not a guarantee). A flat TTL is the conservative
 * choice the epic names as the fallback. A disabled-plugin toggle is an
 * infrequent admin action, so a worst-case `CACHE_TTL_MS` delay before it's
 * visible on every request is an explicit, bounded, and documented window —
 * not silent staleness. **Fail-open extends to the cache too, on purpose**:
 * if the underlying fetch fails, the safe empty-Set result gets cached like
 * any other value, so a transient outage doesn't turn into a fetch-and-fail
 * loop on every single request for the rest of the TTL window — the request
 * was already going to fail open for that one request regardless of caching;
 * caching the fail-open result only extends how long the *same* fail-open
 * window lasts, it doesn't introduce a new kind of exposure.
 */
export async function fetchDisabledPluginIds(): Promise<Set<string>> {
  const now = Date.now();
  if (disabledPluginIdsCache && disabledPluginIdsCache.expiresAt > now) {
    return disabledPluginIdsCache.value;
  }
  const value = await fetchDisabledPluginIdsUncached();
  disabledPluginIdsCache = { value, expiresAt: now + CACHE_TTL_MS };
  return value;
}

async function fetchDisabledPluginIdsUncached(): Promise<Set<string>> {
  try {
    const res = await fetch(`${SELF_URL}/api/admin/plugins/disabled`, {
      headers: { authorization: `Bearer ${process.env.SOVEREIGN_ADMIN_KEY ?? ''}` },
    });
    if (!res.ok) return new Set();
    const { disabled } = (await res.json()) as { disabled: string[] };
    return new Set(disabled);
  } catch {
    return new Set();
  }
}

/**
 * Returns the set of paid plugin IDs for which the given user has no active
 * entitlement (RFC 0003). Fails open — if the fetch errors, no plugin is
 * paywalled (same conservative approach as disabled-plugin gating).
 *
 * Deliberately uncached (Task 2.18) — see this module's doc comment.
 */
export async function fetchPaywalledPluginIds(userId: string): Promise<Set<string>> {
  try {
    const res = await fetch(
      `${SELF_URL}/api/admin/entitlements?userId=${encodeURIComponent(userId)}`,
      { headers: { authorization: `Bearer ${process.env.SOVEREIGN_ADMIN_KEY ?? ''}` } },
    );
    if (!res.ok) return new Set();
    const { paywalled } = (await res.json()) as { paywalled: string[] };
    return new Set(paywalled);
  } catch {
    return new Set();
  }
}

/**
 * Returns the set of plugin IDs the given user is denied by access policy
 * (RFC 0065) — independent of the disabled-plugin set. Fails open — if the
 * fetch errors, nothing is restricted (same conservative approach as disabled
 * and paywall gating; access policy is an operator convenience layered on top
 * of, not a replacement for, adminOnly/paywall enforcement).
 *
 * Deliberately uncached (Task 2.18) — see this module's doc comment.
 */
export async function fetchRestrictedPluginIds(userId: string, role: string): Promise<Set<string>> {
  try {
    const res = await fetch(
      `${SELF_URL}/api/admin/plugins/access?userId=${encodeURIComponent(userId)}&role=${encodeURIComponent(role)}`,
      { headers: { authorization: `Bearer ${process.env.SOVEREIGN_ADMIN_KEY ?? ''}` } },
    );
    if (!res.ok) return new Set();
    const { restricted } = (await res.json()) as { restricted: string[] };
    return new Set(restricted);
  } catch {
    return new Set();
  }
}

const rootPluginPrefixCache = new Map<string, TtlCacheEntry<string | null>>();

/**
 * The `routePrefix` that should serve `/` in place (PLT-14) — the configured
 * root plugin's prefix when valid for this user, else the Launcher fallback,
 * else null (RFC 0065; resolved server-side by the Node-runtime route, which
 * has DB access Edge middleware doesn't). Returns null on any failure, so `/`
 * falls through to the placeholder home page rather than erroring.
 *
 * Not named in the epic's plugin-gate.ts deliverable list (disabled-plugin,
 * entitlement/paywall, admin-only/disabled/paywalled route decisions) — it's
 * bundled here anyway because it's the same shape as the three lookups above
 * (Edge can't reach the DB, so ask the Node-runtime admin API, fail open) and
 * splitting the one self-authenticated admin-API fetcher that isn't
 * literally "plugin gating" into its own file would be a distinction without
 * a difference.
 *
 * Cached in-process for `CACHE_TTL_MS`, keyed by `userId:role` (RFC 0065
 * root-plugin resolution depends on the caller's entitlements/access policy,
 * so — unlike the disabled-plugin set — this cannot share one global entry
 * across users). Same fail-open-extends-to-the-cache and no-cross-runtime-
 * invalidation reasoning as `fetchDisabledPluginIds` above applies here too.
 * Expired entries are swept opportunistically on every write rather than on
 * a timer, so the map never holds more than "distinct users active within
 * the last `CACHE_TTL_MS`" — bounded by real traffic, not a leak.
 */
export async function fetchRootPluginPrefix(userId: string, role: string): Promise<string | null> {
  const key = `${userId}:${role}`;
  const now = Date.now();
  const cached = rootPluginPrefixCache.get(key);
  if (cached && cached.expiresAt > now) return cached.value;
  const value = await fetchRootPluginPrefixUncached(userId, role);
  rootPluginPrefixCache.set(key, { value, expiresAt: now + CACHE_TTL_MS });
  for (const [k, entry] of rootPluginPrefixCache) {
    if (entry.expiresAt <= now) rootPluginPrefixCache.delete(k);
  }
  return value;
}

async function fetchRootPluginPrefixUncached(userId: string, role: string): Promise<string | null> {
  try {
    const res = await fetch(
      `${SELF_URL}/api/admin/root-plugin?userId=${encodeURIComponent(userId)}&role=${encodeURIComponent(role)}`,
      { headers: { authorization: `Bearer ${process.env.SOVEREIGN_ADMIN_KEY ?? ''}` } },
    );
    if (!res.ok) return null;
    const { routePrefix } = (await res.json()) as { routePrefix: string | null };
    return routePrefix;
  } catch {
    return null;
  }
}

/** Test-only: clear both TTL caches so mocked fetch responses aren't masked by a previous test's cached value. */
export function resetPluginGateCacheForTests(): void {
  disabledPluginIdsCache = null;
  rootPluginPrefixCache.clear();
}
