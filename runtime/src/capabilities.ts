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
  | 'instance:view' // view instance settings
  | 'instance:configure' // change instance settings + root plugin
  | 'instance:backup' // trigger/download a full-instance backup (RFC 0084, epic task 8.17)
  | 'health:view' // view system health report
  | 'activity:view' // view activity log (RFC 0005)
  | 'role:assign' // assign roles to other users (owner-only)
  | 'plugins:self-manage' // self-service enable/disable of self_service-eligible plugins (RFC 0070)
  | 'instance:configure-secrets'; // view/change instance-level secrets (SMTP credentials) (owner-only)

// ---------------------------------------------------------------------------
// Per-user capability grants (RFC 0070)
// ---------------------------------------------------------------------------

/**
 * Capabilities that may be granted to an individual user on top of their role
 * preset, via `user_capability_grants`. Deliberately an explicit allowlist,
 * not "any Capability" — `role:assign` in particular must never be grantable
 * this way, or it would undermine the owner-protection guarantee RFC 0021
 * established (role:assign stays owner-only, assigned only by changing role).
 */
export const GRANTABLE_CAPABILITIES = [
  'plugins:self-manage',
] as const satisfies readonly Capability[];

export type GrantableCapability = (typeof GRANTABLE_CAPABILITIES)[number];

export function isGrantableCapability(cap: string): cap is GrantableCapability {
  return (GRANTABLE_CAPABILITIES as readonly string[]).includes(cap);
}

// ---------------------------------------------------------------------------
// Role type
// ---------------------------------------------------------------------------

export type PlatformRole =
  'platform:owner' | 'platform:admin' | 'platform:auditor' | 'platform:user';

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
  'instance:view',
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
  'instance:view',
  'instance:configure',
  'instance:backup',
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
  'instance:view',
  'instance:configure',
  'instance:backup',
  'health:view',
  'activity:view',
  'role:assign',
  'instance:configure-secrets',
]);

export const ROLE_PRESETS: Readonly<Record<PlatformRole, ReadonlySet<Capability>>> = {
  'platform:owner': OWNER_CAPS,
  'platform:admin': ADMIN_CAPS,
  'platform:auditor': AUDITOR_CAPS,
  'platform:user': USER_CAPS,
};

// ---------------------------------------------------------------------------
// Progressive verification gate (RFC 0035 §5.7, epic task 1.9)
// ---------------------------------------------------------------------------

/**
 * Minimum progressive verification level (RFC 0035) required to exercise a
 * capability, on top of whatever the role preset already grants. Absent =
 * no gate (the default — every capability not listed here is unaffected).
 *
 * A capability-definition object type (`{ minVerificationLevel, ... }` per
 * capability) would be the more "textbook" shape, but `ROLE_PRESETS` above
 * is bare `Set<Capability>` membership with no per-capability metadata
 * structure today — this lookup is additive to that shape rather than a
 * structural rework, same semantic either way. Only the two capabilities
 * the epic names explicitly are gated; do not add more without a
 * corresponding product decision.
 */
export const CAPABILITY_MIN_VERIFICATION_LEVEL: Partial<Record<Capability, 0 | 1 | 2 | 3>> = {
  'user:manage': 1,
  'role:assign': 2,
};

// ---------------------------------------------------------------------------
// Resolvers
// ---------------------------------------------------------------------------

/**
 * Return the capabilities granted to `role` by the v1 hardcoded presets,
 * minus any gated by `CAPABILITY_MIN_VERIFICATION_LEVEL` that `userLevel`
 * doesn't meet. Omitting `userLevel` skips the gate entirely (every
 * capability the role preset grants is returned, matching pre-leg-1.9
 * behavior) — used by callers that haven't been updated to pass a level yet.
 * Unknown roles (e.g. old `platform:admin` strings in a stale cookie that
 * haven't been re-verified yet) fall back to the user preset (least privilege).
 */
export function capabilitiesForRole(role: string, userLevel?: 0 | 1 | 2 | 3): Capability[] {
  const preset = ROLE_PRESETS[role as PlatformRole] ?? USER_CAPS;
  if (userLevel === undefined) return [...preset];
  return [...preset].filter((cap) => {
    const minLevel = CAPABILITY_MIN_VERIFICATION_LEVEL[cap];
    return minLevel === undefined || userLevel >= minLevel;
  });
}

/**
 * Return true if `role` grants `cap`. When `userLevel` is supplied and `cap`
 * has a `CAPABILITY_MIN_VERIFICATION_LEVEL` entry, also requires
 * `userLevel >= minLevel` — regardless of role. Omitting `userLevel` skips
 * this check entirely (backward-compatible: every existing 2-arg call site
 * keeps its pre-leg-1.9 behavior unchanged).
 *
 * Used in the Edge middleware (offline, no DB) and in runtime route handlers.
 */
export function hasCapability(role: string, cap: Capability, userLevel?: 0 | 1 | 2 | 3): boolean {
  if (!(ROLE_PRESETS[role as PlatformRole] ?? USER_CAPS).has(cap)) return false;
  if (userLevel === undefined) return true;
  const minLevel = CAPABILITY_MIN_VERIFICATION_LEVEL[cap];
  return minLevel === undefined || userLevel >= minLevel;
}

/**
 * Throw a `403` response if the role (and, when `userLevel` is supplied, the
 * verification level) lacks the required capability.
 * Intended for use in Node-runtime route handlers (not Edge middleware).
 */
export function requireCapabilityOrForbidden(
  role: string,
  cap: Capability,
  userLevel?: 0 | 1 | 2 | 3,
): void {
  if (!hasCapability(role, cap, userLevel)) {
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
