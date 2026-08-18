/**
 * Thrown by SDK surfaces declared in the contract but with no backing
 * implementation yet (e.g. `sdk.billing`).
 */
export class NotImplementedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotImplementedError';
  }
}

/** Thrown by `sdk.auth.requireSession()` when no authenticated session is present. */
export class NotAuthenticatedError extends Error {
  constructor() {
    super('No authenticated session. The caller must be within an authenticated request.');
    this.name = 'NotAuthenticatedError';
  }
}

/**
 * Thrown by `sdk.data.query()` when the current user has not granted the calling
 * (consumer) plugin consent to read the requested provider contract — the
 * consent-gated cross-plugin data-sharing mechanism (RFC 0002). Reserved
 * alongside that surface; not raised until the mechanism is implemented.
 */
export class ConsentRequiredError extends Error {
  constructor(message = 'User consent is required to access this plugin data.') {
    super(message);
    this.name = 'ConsentRequiredError';
  }
}

/**
 * Thrown by `sdk.billing.requireEntitlement()` when the current user has no
 * valid (active, unexpired) entitlement for the calling plugin (RFC 0003).
 * The runtime middleware also enforces this at the route level, so most plugins
 * never need to call `requireEntitlement()` directly — it is for in-plugin
 * feature gating by tier.
 */
export class EntitlementRequiredError extends Error {
  constructor(message = 'An active entitlement is required to access this feature.') {
    super(message);
    this.name = 'EntitlementRequiredError';
  }
}

/**
 * Thrown by `sdk.authz.requireGrant()` (RFC 0054) when the current user holds
 * no plugin-scoped grant for the requested capability/resource — either no
 * resolver is registered for the calling plugin, or the registered resolver
 * returned `false`. `hasGrant()` returns `false` in the same situations
 * instead of throwing; `requireGrant()` is the assert-and-throw convenience
 * for route/action guards.
 */
export class GrantRequiredError extends Error {
  constructor(message = 'A plugin-scoped grant is required to access this resource.') {
    super(message);
    this.name = 'GrantRequiredError';
  }
}

/**
 * Thrown by `sdk.events.publish()` when a serialized event payload exceeds
 * the platform's size cap (RFC 0045 security requirement: "payload size is
 * capped"). Events have no durable storage to absorb an oversized payload,
 * unlike `sdk.storage`'s quota-checked objects — this is a hard per-call
 * limit, not a cumulative one.
 */
export class EventPayloadTooLargeError extends Error {
  constructor(byteLength: number, maxBytes: number) {
    super(
      `Event payload is ${String(byteLength)} bytes, exceeding the ${String(maxBytes)}-byte limit.`,
    );
    this.name = 'EventPayloadTooLargeError';
  }
}
