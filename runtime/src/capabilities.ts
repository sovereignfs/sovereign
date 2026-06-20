/**
 * Platform role & capability model (RFC 0021, SRS §3.4).
 *
 * Capabilities are the enforcement unit; roles are named presets (capability
 * bundles). v1 ships hardcoded defaults; the architecture supports a DB-driven
 * override layer in a future phase without a schema change.
 *
 * Capability derivation is a pure, synchronous function of role — so the Edge
 * middleware can resolve capabilities offline from the signed `session_data`
 * cookie (which already carries `role`) without a DB round-trip.
 */

// ---------------------------------------------------------------------------
// Capability type
// ---------------------------------------------------------------------------

export type Capability =
  | 'plugin:access' // use installed (non-adminOnly) plugins
  | 'profile:manage' // edit own profile / preferences
  | 'console:access' // enter the Console (read-only Console shell)
  | 'user:view' // view the user list in Console
  | 'user:manage' // invite / deactivate / reactivate users
  | 'plugin:manage' // enable / disable plugins
  | 'tenant:view' // view tenant settings
  | 'tenant:configure' // change tenant settings + root plugin
  | 'health:view' // view system health report
  | 'activity:view' // view activity log (RFC 0005)
  | 'role:assign'; // assign roles to other users (owner-only)

// ---------------------------------------------------------------------------
// Role type
// ---------------------------------------------------------------------------

export type PlatformRole =
  | 'platform:owner'
  | 'platform:admin'
  | 'platform:auditor'
  | 'platform:user';

/** All recognized platform roles, in descending privilege order. */
export const PLATFORM_ROLES = [
  'platform:owner',
  'platform:admin',
  'platform:auditor',
  'platform:user',
] as const satisfies readonly PlatformRole[];

// ---------------------------------------------------------------------------
// Built-in presets (hardcoded defaults, RFC 0021 Table 1)
// ---------------------------------------------------------------------------

const USER_CAPS = new Set<Capability>(['plugin:access', 'profile:manage']);

const AUDITOR_CAPS = new Set<Capability>([
  'plugin:access',
  'profile:manage',
  'console:access',
  'user:view',
  'tenant:view',
  'health:view',
  'activity:view',
]);

const ADMIN_CAPS = new Set<Capability>([
  'plugin:access',
  'profile:manage',
  'console:access',
  'user:view',
  'user:manage',
  'plugin:manage',
  'tenant:view',
  'tenant:configure',
  'health:view',
  'activity:view',
]);

const OWNER_CAPS = new Set<Capability>([
  'plugin:access',
  'profile:manage',
  'console:access',
  'user:view',
  'user:manage',
  'plugin:manage',
  'tenant:view',
  'tenant:configure',
  'health:view',
  'activity:view',
  'role:assign',
]);

export const ROLE_PRESETS: Readonly<Record<PlatformRole, ReadonlySet<Capability>>> = {
  'platform:owner': OWNER_CAPS,
  'platform:admin': ADMIN_CAPS,
  'platform:auditor': AUDITOR_CAPS,
  'platform:user': USER_CAPS,
};

// ---------------------------------------------------------------------------
// Resolvers
// ---------------------------------------------------------------------------

/**
 * Return the capabilities granted to `role` by the v1 hardcoded presets.
 * Unknown roles (e.g. old `platform:admin` strings in a stale cookie that
 * haven't been re-verified yet) fall back to the user preset (least privilege).
 */
export function capabilitiesForRole(role: string): Capability[] {
  const preset = ROLE_PRESETS[role as PlatformRole];
  return preset ? [...preset] : [...USER_CAPS];
}

/**
 * Return true if `role` grants `cap`.
 *
 * Used in the Edge middleware (offline, no DB) and in runtime route handlers.
 */
export function hasCapability(role: string, cap: Capability): boolean {
  return (ROLE_PRESETS[role as PlatformRole] ?? USER_CAPS).has(cap);
}

/**
 * Throw a `403` response if the role lacks the required capability.
 * Intended for use in Node-runtime route handlers (not Edge middleware).
 */
export function requireCapabilityOrForbidden(role: string, cap: Capability): void {
  if (!hasCapability(role, cap)) {
    // The caller should catch this and return it as a Response.
    throw new CapabilityError(cap, role);
  }
}

export class CapabilityError extends Error {
  readonly status = 403;
  constructor(
    readonly cap: Capability,
    readonly role: string,
  ) {
    super(`Role "${role}" does not have capability "${cap}".`);
    this.name = 'CapabilityError';
  }
}
