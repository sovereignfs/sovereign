/**
 * The platform roles (core-app §3.2.1), as they are stored in `users.role`. A role is `scope:role-name`;
 * Phase 1 has only the `platform` scope.
 */
export const ROLE_OWNER = 'platform:owner';
export const ROLE_ADMIN = 'platform:admin';
export const ROLE_USER = 'platform:user';

export const ROLES = [ROLE_OWNER, ROLE_ADMIN, ROLE_USER] as const;
export type Role = (typeof ROLES)[number];

export const isRole = (value: unknown): value is Role =>
  typeof value === 'string' && (ROLES as readonly string[]).includes(value);

/** What a role name looks like: a scope, a colon, a name. */
export const ROLE_NAME = /^[a-z][a-z0-9-]*:[a-z][a-z0-9-]*$/;
