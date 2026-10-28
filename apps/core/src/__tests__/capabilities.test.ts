import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { isRole, ROLE_ADMIN, ROLE_NAME, ROLE_OWNER, ROLE_USER, ROLES } from '../auth/roles';
import {
  ALL_CAPABILITIES,
  CAPABILITIES,
  can,
  capabilitiesOf,
  DEFAULT_MATRIX,
  OWNER_ONLY_CAPABILITIES,
  type Capability,
  type Matrix,
} from '../roles/capabilities';

/** The table in spec §3.2.2, read from the spec itself, so the code cannot drift from it unseen. */
function specTable(): Map<string, { roles: Set<string>; ownerOnly: boolean }> {
  const spec = readFileSync(
    path.join(import.meta.dirname, '../../../../docs/specs/core-app.md'),
    'utf8',
  );
  const section = spec.slice(spec.indexOf('#### 3.2.2 Capabilities'), spec.indexOf('#### 3.2.3'));
  const rows = new Map<string, { roles: Set<string>; ownerOnly: boolean }>();
  for (const line of section.split('\n')) {
    const cells = line.split('|').map((cell) => cell.trim());
    const name = /^`([a-z-]+:[a-z-]+)`$/.exec(cells[1] ?? '')?.[1];
    if (!name) continue;
    const who = cells[3] ?? '';
    const ownerOnly = who === 'owner only';
    rows.set(name, {
      ownerOnly,
      roles: new Set(ownerOnly ? ['owner'] : who.split(',').map((role) => role.trim())),
    });
  }
  return rows;
}

const spec = specTable();
const SHORT = { [ROLE_USER]: 'user', [ROLE_ADMIN]: 'admin', [ROLE_OWNER]: 'owner' } as const;

describe('the roles', () => {
  it('are the three the spec names, each written scope:role-name', () => {
    expect([...ROLES].sort()).toEqual([ROLE_ADMIN, ROLE_OWNER, ROLE_USER].sort());
    for (const role of ROLES) expect(role).toMatch(ROLE_NAME);
  });

  it.each([
    [ROLE_OWNER, true],
    ['platform:superuser', false],
    ['owner', false],
    ['PLATFORM:OWNER', false],
    ['platform:owner ', false],
    ['', false],
    [undefined, false],
    [null, false],
    [5, false],
    [{}, false],
  ])('%j is a known role: %s', (value, expected) => {
    expect(isRole(value)).toBe(expected);
  });
});

describe('the capability registry and the default matrix, against spec §3.2.2', () => {
  it('read twelve rows from the spec, or this test would pass on nothing', () => {
    expect(spec.size).toBe(12);
  });

  it('has exactly the capabilities the spec lists', () => {
    expect([...ALL_CAPABILITIES].sort()).toEqual([...spec.keys()].sort());
  });

  it('marks as owner-only exactly the ones the spec says', () => {
    const fromSpec = [...spec].filter(([, row]) => row.ownerOnly).map(([name]) => name);
    expect([...OWNER_ONLY_CAPABILITIES].sort()).toEqual(fromSpec.sort());
    expect(OWNER_ONLY_CAPABILITIES).toHaveLength(4);
  });

  it.each(
    ALL_CAPABILITIES.flatMap((capability) => ROLES.map((role) => [capability, role] as const)),
  )('%s for %s is what the spec says', (capability, role) => {
    expect(can(role, capability)).toBe(spec.get(capability)?.roles.has(SHORT[role]));
  });

  it('gives the sizes the spec implies: user 2, admin 8, owner 12', () => {
    expect(capabilitiesOf(ROLE_USER)).toHaveLength(2);
    expect(capabilitiesOf(ROLE_ADMIN)).toHaveLength(8);
    expect(capabilitiesOf(ROLE_OWNER)).toHaveLength(12);
  });

  it('has nothing in the default matrix for a role that is not editable, or that is owner-only', () => {
    for (const role of [ROLE_ADMIN, ROLE_USER] as const) {
      for (const capability of OWNER_ONLY_CAPABILITIES) {
        expect(DEFAULT_MATRIX[role].has(capability)).toBe(false);
      }
    }
  });
});

describe('can', () => {
  const everything: Matrix = {
    [ROLE_ADMIN]: new Set(ALL_CAPABILITIES),
    [ROLE_USER]: new Set(ALL_CAPABILITIES),
  };
  const nothing: Matrix = { [ROLE_ADMIN]: new Set(), [ROLE_USER]: new Set() };

  it('gives the owner every capability, whatever the matrix says', () => {
    for (const capability of ALL_CAPABILITIES) {
      expect(can(ROLE_OWNER, capability, nothing)).toBe(true);
    }
  });

  it('never gives an owner-only capability to another role, even from a matrix that grants it', () => {
    for (const capability of OWNER_ONLY_CAPABILITIES) {
      expect(can(ROLE_ADMIN, capability, everything)).toBe(false);
      expect(can(ROLE_USER, capability, everything)).toBe(false);
    }
  });

  it('gives another role the rest exactly as the matrix does', () => {
    const others = ALL_CAPABILITIES.filter((capability) => !CAPABILITIES[capability].ownerOnly);
    for (const capability of others) {
      expect(can(ROLE_USER, capability, everything)).toBe(true);
      expect(can(ROLE_USER, capability, nothing)).toBe(false);
    }
  });

  it.each([undefined, null, '', 'owner', 'platform:superuser', 'PLATFORM:OWNER', 0, {}, []])(
    'gives %j nothing at all, so a role that is unknown fails closed',
    (role) => {
      for (const capability of ALL_CAPABILITIES) {
        expect(can(role, capability)).toBe(false);
        expect(can(role, capability, everything)).toBe(false);
      }
    },
  );

  it('does not change the matrix it is given', () => {
    const before = [...DEFAULT_MATRIX[ROLE_USER]];
    can(ROLE_USER, 'console:access');
    capabilitiesOf(ROLE_USER);
    expect([...DEFAULT_MATRIX[ROLE_USER]]).toEqual(before);
  });

  it('is a question about a capability, so asking about one that does not exist is a type error', () => {
    const asked: Capability = 'user:view';
    expect(can(ROLE_ADMIN, asked)).toBe(true);
  });
});
