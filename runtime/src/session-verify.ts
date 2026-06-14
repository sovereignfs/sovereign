/**
 * Local session verification for the runtime middleware (SRS AUTH-05).
 *
 * The middleware verifies the request's session offline from better-auth's
 * signed `session_data` cookie cache (`getCookieCache`, HMAC-signed with the
 * shared auth secret) instead of a `/api/verify` round-trip on every request.
 * These helpers are kept pure so the trust decision is unit-testable; the
 * Edge-runtime cookie read and the `/api/verify` fallback live in the
 * middleware itself.
 */

/** The user identity the middleware injects as `x-sovereign-user-*` headers. */
export interface VerifiedUser {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  role: string;
}

export interface VerifiedSession {
  user: VerifiedUser;
  /** Session expiry as a Unix timestamp (seconds). */
  expiresAt: number;
}

/** The (untrusted-until-verified) payload shape `getCookieCache` returns. */
export interface CachedSessionData {
  session?: { expiresAt?: string | number | Date | null } | null;
  user?: {
    id?: string | null;
    email?: string | null;
    name?: string | null;
    image?: string | null;
    role?: string | null;
    active?: boolean | null;
  } | null;
}

/**
 * The shared signing secret the runtime uses to verify the cookie cache. It
 * must equal the auth server's `AUTH_SECRET` (better-auth signs with it), so we
 * prefer the explicit `SOVEREIGN_AUTH_SECRET` and fall back to the shared
 * `AUTH_SECRET` both apps already load. Returns null when neither is set, in
 * which case the middleware skips local verification and falls back to
 * `/api/verify` — never a default/guessable secret.
 */
export function resolveAuthSecret(
  env: Record<string, string | undefined> = process.env,
): string | null {
  return env.SOVEREIGN_AUTH_SECRET || env.AUTH_SECRET || null;
}

/**
 * Turn an HMAC-verified cookie-cache payload into a trusted session, or null if
 * it should not be honoured: no user id, an expired session, or a deactivated
 * account (parity with the `/api/verify` `active === false` check). A missing
 * role defaults to `platform:user` (least privilege).
 *
 * Note: `getCookieCache` has already checked the signature; this only applies
 * the business rules. Freshness of `role`/`active` is bounded by the cookie's
 * `maxAge` (the browser drops `session_data` after it), after which the
 * middleware falls back to `/api/verify`.
 */
export function verifiedUserFromCache(
  cached: CachedSessionData | null | undefined,
  nowMs: number = Date.now(),
): VerifiedSession | null {
  const user = cached?.user;
  const id = user?.id;
  if (!id) return null;
  if (user.active === false) return null;

  const expiresAtMs = toMillis(cached?.session?.expiresAt);
  if (expiresAtMs === null || expiresAtMs <= nowMs) return null;

  return {
    user: {
      id,
      email: user.email ?? '',
      name: user.name ?? null,
      image: user.image ?? null,
      role: user.role ?? 'platform:user',
    },
    expiresAt: Math.floor(expiresAtMs / 1000),
  };
}

/** Coerce an ISO string / epoch ms / Date to epoch milliseconds, or null. */
function toMillis(value: string | number | Date | null | undefined): number | null {
  if (value == null) return null;
  const ms = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isNaN(ms) ? null : ms;
}
