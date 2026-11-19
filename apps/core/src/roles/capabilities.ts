import { isRole, ROLE_ADMIN, ROLE_OWNER, ROLE_USER, type Role } from '../auth/roles';

/**
 * The capabilities (core-app §3.2.2): the unit every check uses. A role is only a named bundle of
 * them. The set is defined here, in code, and so is the default matrix; the owner can edit the admin
 * and user rows later (§3.2.3), which is why `can` takes the matrix to judge by.
 *
 * `ownerOnly` capabilities are never held by another role, whatever a matrix says. `operatorOnly` ones are
 * held by the owner and, when the matrix gives them, admins, but never by the user role: the Console and what
 * the launcher tells about the instance are for those who run it.
 */
export const CAPABILITIES = {
  'profile:manage': { ownerOnly: false, operatorOnly: false },
  'launcher:access': { ownerOnly: false, operatorOnly: false },
  'files:manage': { ownerOnly: false, operatorOnly: false },
  'console:access': { ownerOnly: false, operatorOnly: true },
  'user:view': { ownerOnly: false, operatorOnly: false },
  'user:manage': { ownerOnly: false, operatorOnly: false },
  'client:manage': { ownerOnly: false, operatorOnly: false },
  'instance:view': { ownerOnly: false, operatorOnly: false },
  'instance:configure': { ownerOnly: false, operatorOnly: false },
  'instance:configure-secrets': { ownerOnly: true, operatorOnly: false },
  'role:assign': { ownerOnly: true, operatorOnly: false },
  'capability:configure': { ownerOnly: true, operatorOnly: false },
  'ownership:transfer': { ownerOnly: true, operatorOnly: false },
  'instance:diagnose': { ownerOnly: true, operatorOnly: false },
} as const;

export type Capability = keyof typeof CAPABILITIES;

export const ALL_CAPABILITIES = Object.keys(CAPABILITIES) as Capability[];
export const OWNER_ONLY_CAPABILITIES = ALL_CAPABILITIES.filter(
  (capability) => CAPABILITIES[capability].ownerOnly,
);

/** Whether the matrix may give `capability` to `role` at all: never an owner-only one, and never an operator-only one to users. */
export function grantable(role: EditableRole, capability: Capability): boolean {
  const { ownerOnly, operatorOnly } = CAPABILITIES[capability];
  return !ownerOnly && !(operatorOnly && role === ROLE_USER);
}

/** The roles whose rows can be edited: the owner's row is fixed, since the owner holds every capability. */
export type EditableRole = typeof ROLE_ADMIN | typeof ROLE_USER;
export type Matrix = Readonly<Record<EditableRole, ReadonlySet<Capability>>>;

const USER_CAPABILITIES: Capability[] = ['profile:manage', 'launcher:access', 'files:manage'];

/** The matrix the instance starts with, and the one in force until an owner changes it. */
export const DEFAULT_MATRIX: Matrix = {
  [ROLE_USER]: new Set(USER_CAPABILITIES),
  [ROLE_ADMIN]: new Set<Capability>([
    ...USER_CAPABILITIES,
    'console:access',
    'user:view',
    'user:manage',
    'client:manage',
    'instance:view',
    'instance:configure',
  ]),
};

/**
 * Whether `role` holds `capability`. Fails closed: anything that is not a known role holds nothing.
 * The owner holds everything. Another role holds a capability only if the matrix gives it, never an owner-only
 * one, and the user role never an operator-only one, so a hostile or mistaken matrix cannot hand those out.
 */
export function can(
  role: unknown,
  capability: Capability,
  matrix: Matrix = DEFAULT_MATRIX,
): boolean {
  if (!isRole(role)) return false;
  if (role === ROLE_OWNER) return true;
  if (!grantable(role, capability)) return false;
  return matrix[role].has(capability);
}

/** Every capability `role` holds. */
export function capabilitiesOf(role: unknown, matrix: Matrix = DEFAULT_MATRIX): Capability[] {
  return ALL_CAPABILITIES.filter((capability) => can(role, capability, matrix));
}

export type { Role };
