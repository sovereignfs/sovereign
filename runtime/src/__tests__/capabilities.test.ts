import { describe, expect, it } from 'vitest';
import {
  CAPABILITY_MIN_VERIFICATION_LEVEL,
  CapabilityError,
  GRANTABLE_CAPABILITIES,
  PLATFORM_ROLES,
  ROLE_PRESETS,
  capabilitiesForRole,
  hasCapability,
  isGrantableCapability,
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

describe('hasCapability — verification level gate (RFC 0035 §5.7)', () => {
  it('omitting userLevel skips the gate entirely (backward-compatible)', () => {
    // platform:admin has user:manage (gated to level 1) — the 2-arg form
    // must behave exactly as it did before this leg, regardless of level.
    expect(hasCapability('platform:admin', 'user:manage')).toBe(true);
  });

  it('denies a role-granted, level-gated capability below the required level', () => {
    // platform:admin has user:manage (gated to level 1) but the caller is at level 0.
    expect(hasCapability('platform:admin', 'user:manage', 0)).toBe(false);
  });

  it('allows a role-granted, level-gated capability at or above the required level', () => {
    expect(hasCapability('platform:admin', 'user:manage', 1)).toBe(true);
    expect(hasCapability('platform:admin', 'user:manage', 2)).toBe(true);
  });

  it('role:assign requires level 2, even for platform:owner', () => {
    expect(hasCapability('platform:owner', 'role:assign', 0)).toBe(false);
    expect(hasCapability('platform:owner', 'role:assign', 1)).toBe(false);
    expect(hasCapability('platform:owner', 'role:assign', 2)).toBe(true);
  });

  it('a role that never had the capability stays denied regardless of level', () => {
    expect(hasCapability('platform:user', 'user:manage', 3)).toBe(false);
  });

  it('an ungated capability is unaffected by any level, including 0', () => {
    expect(hasCapability('platform:user', 'plugin:access', 0)).toBe(true);
  });
});

describe('CAPABILITY_MIN_VERIFICATION_LEVEL', () => {
  it('gates exactly user:manage (1) and role:assign (2) — no more, no fewer', () => {
    expect(CAPABILITY_MIN_VERIFICATION_LEVEL).toEqual({
      'user:manage': 1,
      'role:assign': 2,
    });
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

  it('omitting userLevel returns every role-granted capability, gate or not', () => {
    const caps = capabilitiesForRole('platform:admin');
    expect(caps).toContain('user:manage');
  });

  it('filters out level-gated capabilities the level does not meet', () => {
    const caps = capabilitiesForRole('platform:admin', 0);
    expect(caps).not.toContain('user:manage');
    expect(caps).toContain('console:access'); // ungated, unaffected
  });

  it('includes a level-gated capability once the level is met', () => {
    const caps = capabilitiesForRole('platform:admin', 1);
    expect(caps).toContain('user:manage');
  });

  it('owner loses role:assign below level 2, keeps it at level 2', () => {
    expect(capabilitiesForRole('platform:owner', 1)).not.toContain('role:assign');
    expect(capabilitiesForRole('platform:owner', 2)).toContain('role:assign');
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

  it('throws when the role has the capability but the level does not meet the gate', () => {
    expect(() => requireCapabilityOrForbidden('platform:admin', 'user:manage', 0)).toThrow(
      CapabilityError,
    );
  });

  it('does not throw when the role has the capability and the level meets the gate', () => {
    expect(() => requireCapabilityOrForbidden('platform:admin', 'user:manage', 1)).not.toThrow();
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

describe('GRANTABLE_CAPABILITIES (RFC 0070)', () => {
  it('never includes role:assign', () => {
    expect(GRANTABLE_CAPABILITIES).not.toContain('role:assign');
  });

  it('includes plugins:self-manage', () => {
    expect(GRANTABLE_CAPABILITIES).toContain('plugins:self-manage');
  });
});

describe('isGrantableCapability', () => {
  it('returns true for an allowlisted capability', () => {
    expect(isGrantableCapability('plugins:self-manage')).toBe(true);
  });

  it('returns false for role:assign and other non-allowlisted capabilities', () => {
    expect(isGrantableCapability('role:assign')).toBe(false);
    expect(isGrantableCapability('user:manage')).toBe(false);
    expect(isGrantableCapability('not-a-real-capability')).toBe(false);
  });
});
