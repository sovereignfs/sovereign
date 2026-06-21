/**
 * Production dev-mode utilities (RFC 0020).
 *
 * Dev-mode lets operators validate features on a live instance against a seeded
 * mock database without touching real user data. The switch is:
 *   - opt-in via SOVEREIGN_DEV_MODE_ENABLED env flag
 *   - per-request (Next.js request context isolates it from concurrent requests)
 *   - secret-authenticated (X-Sovereign-Dev-Mode-Secret header)
 *   - audited via structured logger
 *
 * v1 scope: data-only mock — the operator authenticates as a real account but
 * all platform DB reads/writes resolve to the mock database. Auth sessions are
 * not mocked (full mock-user login on prod is deferred per the RFC crux note).
 */

/** Header the client sends to request dev-mode. Carries the secret. */
export const DEV_MODE_INCOMING_HEADER = 'x-sovereign-dev-mode-secret';

/**
 * Internal header set by middleware on validated requests. Downstream route
 * handlers read it via next/headers() to pick the mock DB in getPlatformDb().
 */
export const DEV_MODE_FORWARDED_HEADER = 'x-sovereign-dev-mode';

/** True when dev-mode is configured in the environment (feature exists). */
export function isDevModeConfigured(): boolean {
  return process.env.SOVEREIGN_DEV_MODE_ENABLED === 'true';
}

/**
 * Validate the incoming dev-mode secret against SOVEREIGN_DEV_MODE_SECRET,
 * falling back to SOVEREIGN_ADMIN_KEY. Fails closed when neither is set.
 */
export function validateDevModeSecret(incoming: string | null): boolean {
  if (!incoming) return false;
  const expected = process.env.SOVEREIGN_DEV_MODE_SECRET ?? process.env.SOVEREIGN_ADMIN_KEY ?? null;
  if (!expected) return false;
  return incoming === expected;
}
