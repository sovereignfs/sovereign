/**
 * Offline session assertion — shared claim rules (research 0012, epic tasks
 * 1.21 + 2.31).
 *
 * The service worker uses these to decide two things with no network:
 *
 * 1. Which user's cached documents it may serve (the cache partition).
 * 2. Whether that user's offline window has expired.
 *
 * Kept pure and free of WebCrypto/IndexedDB so the trust decision is
 * unit-testable, exactly as `session-verify.ts` does for the online path. The
 * signature check and storage reads live in `runtime/worker/offline-session.ts`,
 * which runs in the service-worker context.
 *
 * **These helpers assume the signature has already been verified.** They apply
 * the business rules only — calling them on an unverified payload would let a
 * hand-edited `sub` select another user's cache partition, which is the exact
 * failure per-user partitioning exists to prevent. See
 * `apps/auth/src/offline-session.ts` for the full threat model.
 */

/** JWT `typ` the auth server stamps on an offline assertion. */
export const OFFLINE_ASSERTION_TYPE = 'sovereign-offline-session+jwt';

/** Cache-key suffix used when no user could be established. */
export const ANONYMOUS_PARTITION = 'anon';

/** The (signature-verified) claim set an offline assertion carries. */
export interface OfflineAssertionClaims {
  sub?: unknown;
  exp?: unknown;
  typ?: unknown;
}

/**
 * Apply the business rules to an already-signature-verified claim set, and
 * return the user id it names — or null if it must not be honoured.
 *
 * Rejects, in order: a wrong/absent `typ` (so an OIDC ID token signed by the
 * same keypair can never be replayed here as an offline assertion), a missing
 * or non-string `sub`, and an expired or unparseable `exp`. An assertion with
 * no expiry is rejected rather than treated as eternal.
 */
export function userFromAssertionClaims(
  claims: OfflineAssertionClaims | null | undefined,
  nowMs: number = Date.now(),
): string | null {
  if (!claims) return null;

  // Type confusion guard. The jwt() plugin signs OIDC ID tokens with the same
  // keypair, so signature validity alone does not prove a token was minted for
  // *this* purpose.
  if (claims.typ !== OFFLINE_ASSERTION_TYPE) return null;

  const sub = claims.sub;
  if (typeof sub !== 'string' || sub.length === 0) return null;

  const exp = claims.exp;
  if (typeof exp !== 'number' || !Number.isFinite(exp)) return null;
  if (exp * 1000 <= nowMs) return null;

  return sub;
}

/**
 * Build the cache key for a document request under a given user.
 *
 * Partitioning is by **key**, not by cache name: one `pages` cache holding
 * per-user keys, rather than a cache per user. Workbox expiration quotas are
 * per-cache, so a cache-per-user scheme would multiply the configured
 * `maxEntries` by the number of accounts that have ever signed in on the
 * device, and orphan each one silently on sign-out.
 *
 * `null` (no established user) deliberately produces a distinct
 * `ANONYMOUS_PARTITION` key rather than the bare URL: it must be impossible for
 * a request whose user could not be established to collide with — and be served
 * — a real user's cached document. Failing closed here means the worst outcome
 * is a cache miss and a network fetch, never a cross-user leak.
 */
export function partitionedCacheKey(url: string, userId: string | null): string {
  const partition = userId ?? ANONYMOUS_PARTITION;
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}__sv_u=${encodeURIComponent(partition)}`;
}

/**
 * Whether a cache key belongs to the given user's partition — used to delete
 * exactly one user's entries on sign-out, leaving other accounts on a shared
 * device untouched.
 */
export function isKeyForUser(url: string, userId: string): boolean {
  return url.includes(`__sv_u=${encodeURIComponent(userId)}`);
}
