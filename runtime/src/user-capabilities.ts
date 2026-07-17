/**
 * Per-user capability grant resolver (RFC 0070).
 *
 * Node-runtime only — deliberately kept out of `./capabilities.ts`, which must
 * stay a pure synchronous function of `role` so Edge middleware can resolve it
 * offline from the signed session cookie without a DB round-trip. This module
 * does the opposite: it hits the platform DB, so it must never be imported
 * from `middleware.ts` or any other Edge-runtime code path.
 *
 * Edge/cookie-cache propagation of per-user grants is intentionally deferred —
 * see RFC 0070's adoption notes. The capabilities gated by this resolver
 * (starting with `plugins:self-manage`) are checked from Node-runtime server
 * actions and API routes, which already have full session + DB access, so the
 * Edge header (`x-sovereign-user-capabilities`) does not need to carry them.
 */
import { hasUserCapabilityGrant } from '@sovereignfs/db';
import { type Capability, hasCapability, isGrantableCapability } from './capabilities';
import { getPlatformDb } from './db';

/**
 * Whether `user` has `cap`, checking the role preset first (no DB) and, only
 * for allowlisted grantable capabilities, falling back to a per-user grant.
 */
export async function hasUserCapability(
  user: { id: string; role: string },
  cap: Capability,
): Promise<boolean> {
  if (hasCapability(user.role, cap)) return true;
  if (!isGrantableCapability(cap)) return false;
  const pdb = await getPlatformDb();
  return hasUserCapabilityGrant(pdb, user.id, cap);
}
