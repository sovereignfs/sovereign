import { EntitlementRequiredError, NotImplementedError } from './errors';

/**
 * Surfaces declared in the SDK contract but reserved for post-v1. They throw
 * NotImplementedError so plugins fail loudly rather than silently misbehaving.
 */

export const events = {
  publish(_event: string, _payload: unknown): Promise<void> {
    throw new NotImplementedError('sdk.events.publish() is not implemented in Sovereign v1.');
  },
  subscribe(_event: string, _handler: (payload: unknown) => void): void {
    throw new NotImplementedError('sdk.events.subscribe() is not implemented in Sovereign v1.');
  },
};

/**
 * Billing and entitlement surface (RFC 0003). Plugin authors use these helpers
 * to gate in-plugin features by entitlement tier. Route-level access is gated
 * automatically by the runtime middleware — calling `requireEntitlement()` is
 * only needed for feature flags within an already-accessible route.
 *
 * Both methods throw `NotImplementedError` until Task 0.8.01's runtime
 * implementation lands in a future release.
 */
export const billing = {
  /**
   * Returns the current user's active entitlement for the calling plugin, or
   * `null` when no entitlement exists. Use this to branch UI by tier.
   */
  getEntitlement(
    _headers: Headers,
  ): Promise<{ tier: string | null; expiresAt: number | null } | null> {
    throw new NotImplementedError('sdk.billing.getEntitlement() is not yet implemented.');
  },
  /**
   * Asserts that the current user has an active entitlement for the calling
   * plugin. Throws `EntitlementRequiredError` when absent. Use for in-plugin
   * feature gating (route-level access is already gated by the middleware).
   */
  requireEntitlement(
    _headers: Headers,
  ): Promise<{ tier: string | null; expiresAt: number | null }> {
    throw new EntitlementRequiredError(
      'sdk.billing.requireEntitlement() is not yet implemented — no entitlement check performed.',
    );
  },
};
