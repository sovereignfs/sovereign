/**
 * Middleware plugin-gate lookups: disabled-plugin, entitlement/paywall,
 * access-policy (RFC 0065), and root-plugin (PLT-14) status, all fetched
 * from the runtime's own Node-runtime admin API since Edge middleware cannot
 * open the SQLite database directly. Every lookup here fails open (an error
 * or non-OK response yields the empty/no-restriction result) — these are
 * admin conveniences layered on top of, not a replacement for, the
 * adminOnly/paywall route decisions in `runtime/src/route-guard.ts`, which
 * consume these sets. Extracted from `runtime/middleware.ts` (Task 2.17) —
 * behavior unchanged, purely a relocation.
 */

// Self-fetch address for the runtime's own Node-runtime API routes. The server
// always listens on :3000 (scripts/dev.ts and the start script both pin it),
// so localhost is reliable in every environment — unlike the public URL, which
// may sit behind a reverse proxy the container cannot hairpin through.
export const SELF_URL = `http://localhost:${process.env.RUNTIME_PORT ?? process.env.PORT ?? '3000'}`;

/**
 * Middleware runs on the Edge runtime, which cannot open the SQLite database.
 * Plugin enabled/disabled state is fetched from the runtime's own
 * /api/admin/plugins/disabled route (Node runtime, excluded from this
 * middleware's matcher) — same round-trip pattern as the auth /api/verify
 * check. Fails open: if the status fetch errors, the route stays reachable
 * (disable is an admin convenience, not a security boundary — adminOnly
 * gating below is independent of it).
 */
export async function fetchDisabledPluginIds(): Promise<Set<string>> {
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
 */
export async function fetchRootPluginPrefix(userId: string, role: string): Promise<string | null> {
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
