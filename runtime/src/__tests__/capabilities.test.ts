import { describe, expect, it } from 'vitest';
import {
  CapabilityError,
  PLATFORM_ROLES,
  ROLE_PRESETS,
  capabilitiesForRole,
  hasCapability,
  requireCapabilityOrForbidden,
} from '../capabilities';

describe('ROLE_PRESETS', () => {
  it('owner has every capability including role:assign', () => {
    const caps = ROLE_PRESETS['platform:owner'];
    for (const cap of [
      'plugin:access',
      'profile:manage',
      'console:access',
      'user:view',
      'user:manage',
      'plugin:manage',
      'instance:view',
      'instance:configure',
      'health:view',
      'activity:view',
      'role:assign',
    ] as const) {
      expect(caps.has(cap), `owner missing ${cap}`).toBe(true);
    }
  });

  it('admin has all capabilities except role:assign', () => {
    const caps = ROLE_PRESETS['platform:admin'];
    expect(caps.has('role:assign')).toBe(false);
    expect(caps.has('user:manage')).toBe(true);
    expect(caps.has('plugin:manage')).toBe(true);
    expect(caps.has('instance:configure')).toBe(true);
  });

  it('auditor has read-only capabilities only', () => {
    const caps = ROLE_PRESETS['platform:auditor'];
    expect(caps.has('console:access')).toBe(true);
    expect(caps.has('user:view')).toBe(true);
    expect(caps.has('activity:view')).toBe(true);
    // No write capabilities
    expect(caps.has('user:manage')).toBe(false);
    expect(caps.has('plugin:manage')).toBe(false);
    expect(caps.has('instance:configure')).toBe(false);
    expect(caps.has('role:assign')).toBe(false);
  });

  it('user only has plugin:access and profile:manage', () => {
    const caps = ROLE_PRESETS['platform:user'];
    expect(caps.has('plugin:access')).toBe(true);
    expect(caps.has('profile:manage')).toBe(true);
    expect(caps.has('console:access')).toBe(false);
    expect(caps.has('role:assign')).toBe(false);
  });

  it('privileges are strictly increasing owner > admin > auditor > user', () => {
    const sizes = PLATFORM_ROLES.map((r) => ROLE_PRESETS[r].size);
    for (let i = 0; i < sizes.length - 1; i++) {
      const current = sizes[i] ?? 0;
      const next = sizes[i + 1] ?? 0;
      expect(
        current,
        `${PLATFORM_ROLES[i]} should have more caps than ${PLATFORM_ROLES[i + 1]}`,
      ).toBeGreaterThan(next);
    }
  });
});

describe('hasCapability', () => {
  it('returns true for a granted capability', () => {
    expect(hasCapability('platform:admin', 'console:access')).toBe(true);
  });

  it('returns false for a missing capability', () => {
    expect(hasCapability('platform:admin', 'role:assign')).toBe(false);
    expect(hasCapability('platform:user', 'console:access')).toBe(false);
  });

  it('falls back to user-preset (least privilege) for unknown roles', () => {
    expect(hasCapability('platform:unknown', 'console:access')).toBe(false);
    expect(hasCapability('platform:unknown', 'plugin:access')).toBe(true);
  });

  it('owner has role:assign; no other role does', () => {
    expect(hasCapability('platform:owner', 'role:assign')).toBe(true);
    for (const role of ['platform:admin', 'platform:auditor', 'platform:user'] as const) {
      expect(hasCapability(role, 'role:assign')).toBe(false);
    }
  });
});

describe('capabilitiesForRole', () => {
  it('returns an array matching the preset', () => {
    const caps = capabilitiesForRole('platform:auditor');
    expect(caps).toContain('console:access');
    expect(caps).toContain('user:view');
    expect(caps).not.toContain('user:manage');
  });

  it('falls back to user preset for unknown roles', () => {
    const caps = capabilitiesForRole('platform:legacy');
    expect(caps).toContain('plugin:access');
    expect(caps).not.toContain('console:access');
  });
});

describe('requireCapabilityOrForbidden', () => {
  it('does not throw when the capability is granted', () => {
    expect(() => requireCapabilityOrForbidden('platform:owner', 'role:assign')).not.toThrow();
  });

  it('throws CapabilityError when the capability is missing', () => {
    expect(() => requireCapabilityOrForbidden('platform:admin', 'role:assign')).toThrow(
      CapabilityError,
    );
  });

  it('CapabilityError carries the cap and role and status 403', () => {
    let err: CapabilityError | undefined;
    try {
      requireCapabilityOrForbidden('platform:user', 'console:access');
    } catch (e) {
      err = e as CapabilityError;
    }
    expect(err).toBeInstanceOf(CapabilityError);
    expect(err?.cap).toBe('console:access');
    expect(err?.role).toBe('platform:user');
    expect(err?.status).toBe(403);
  });
});
