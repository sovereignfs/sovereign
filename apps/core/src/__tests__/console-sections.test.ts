import { describe, expect, it } from 'vitest';
import { ROLE_ADMIN, ROLE_OWNER, ROLE_USER } from '../auth/roles';
import { DEFAULT_MATRIX, type Capability, type Matrix } from '../roles/capabilities';
import {
  CONSOLE_SECTIONS,
  activeSection,
  visibleSections,
  type ConsoleSection,
} from '../console/sections';

const section = (id: string, capability: Capability, href = `/console/${id}`): ConsoleSection => ({
  id,
  label: id,
  href,
  icon: 'layout-dashboard',
  capability,
});
const SECTIONS = [
  section('overview', 'console:access', '/console'),
  section('accounts', 'user:view'),
  section('settings', 'instance:view'),
  section('secrets', 'instance:configure-secrets'),
  section('matrix', 'capability:configure'),
];

const edited = (admin: Capability[], user: Capability[] = ['profile:manage']): Matrix => ({
  [ROLE_ADMIN]: new Set(admin),
  [ROLE_USER]: new Set(user),
});

describe('the sections the Console offers', () => {
  it('are only those whose page exists, each needing a capability and leading somewhere', () => {
    expect(CONSOLE_SECTIONS.length).toBeGreaterThan(0);
    for (const section of CONSOLE_SECTIONS) {
      expect(section.href).toMatch(/^\/console(\/[a-z-]+)*$/);
      expect(section.label.trim()).not.toBe('');
    }
    expect(new Set(CONSOLE_SECTIONS.map((s) => s.id)).size).toBe(CONSOLE_SECTIONS.length);
    expect(new Set(CONSOLE_SECTIONS.map((s) => s.href)).size).toBe(CONSOLE_SECTIONS.length);
  });
});

describe('the Console’s overview', () => {
  it('says what every section other than itself is for, in a line, with no jargon', () => {
    for (const section of CONSOLE_SECTIONS.filter((section) => section.href !== '/console')) {
      expect(section.description, section.id).toBeTruthy();
      expect(section.description, section.id).not.toMatch(/\b(client|oauth|oidc|scope|token)\b/i);
    }
  });
});

describe('which sections a role may see', () => {
  it('shows an ordinary person none, however many there are', () => {
    expect(visibleSections(ROLE_USER, DEFAULT_MATRIX, SECTIONS)).toEqual([]);
  });

  it('shows an admin what their capabilities allow, and not what is the owner’s', () => {
    expect(visibleSections(ROLE_ADMIN, DEFAULT_MATRIX, SECTIONS).map((s) => s.id)).toEqual([
      'overview',
      'accounts',
      'settings',
    ]);
  });

  it('shows the owner everything', () => {
    expect(visibleSections(ROLE_OWNER, DEFAULT_MATRIX, SECTIONS).map((s) => s.id)).toEqual(
      SECTIONS.map((s) => s.id),
    );
  });

  it.each([undefined, null, '', 'platform:superuser', 'owner', 5, {}])(
    'shows a role that is %j nothing',
    (role) => {
      expect(visibleSections(role, DEFAULT_MATRIX, SECTIONS)).toEqual([]);
    },
  );

  it('follows the matrix in force: a section goes when the owner takes its capability away', () => {
    const matrix = edited(['console:access', 'user:view']);
    expect(visibleSections(ROLE_ADMIN, matrix, SECTIONS).map((s) => s.id)).toEqual([
      'overview',
      'accounts',
    ]);
  });

  it('shows nothing at all to a role that cannot enter, even one granted a section’s capability', () => {
    const matrix = edited(['user:view', 'instance:view']);
    expect(visibleSections(ROLE_ADMIN, matrix, SECTIONS)).toEqual([]);
  });

  it('never gives an owner-only section to an admin, even from a matrix that grants it', () => {
    const matrix = edited(['console:access', 'capability:configure', 'instance:configure-secrets']);
    expect(visibleSections(ROLE_ADMIN, matrix, SECTIONS).map((s) => s.id)).toEqual(['overview']);
  });

  it('does not change what it is given', () => {
    const before = [...SECTIONS];
    visibleSections(ROLE_ADMIN, DEFAULT_MATRIX, SECTIONS);
    expect(SECTIONS).toEqual(before);
  });
});

describe('which section a page belongs to', () => {
  const sections = [
    { id: 'overview', href: '/console' },
    { id: 'accounts', href: '/console/accounts' },
    { id: 'account-groups', href: '/console/accounts/groups' },
  ];

  it.each([
    ['/console', 'overview'],
    ['/console/accounts', 'accounts'],
    ['/console/accounts/abc', 'accounts'],
    ['/console/accounts/groups', 'account-groups'],
    ['/console/accounts/groups/x', 'account-groups'],
    ['/console/accountsx', 'overview'],
  ])('puts %s under %s: the longest address that matches', (pathname, id) => {
    expect(activeSection(pathname, sections)).toBe(id);
  });

  it.each(['/consolex', '/console-other', '/', '/profile'])(
    'puts %s under no section, which only starts the same way',
    (pathname) => {
      expect(activeSection(pathname, sections)).toBeUndefined();
    },
  );
});
