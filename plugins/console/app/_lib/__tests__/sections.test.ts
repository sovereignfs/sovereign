import { describe, expect, it } from 'vitest';
import { activeConsoleSectionId } from '../sections';

describe('activeConsoleSectionId', () => {
  it('matches the exact Overview route', () => {
    expect(activeConsoleSectionId('/console')).toBe('overview');
  });

  it('matches a section route exactly', () => {
    expect(activeConsoleSectionId('/console/users')).toBe('users');
  });

  it('matches a nested route under a section, not just the exact href', () => {
    expect(activeConsoleSectionId('/console/users/invite')).toBe('users');
  });

  it('prefers the longest matching href over a shorter prefix match', () => {
    // '/console/users' is a prefix-match candidate for the "Overview" item
    // (href '/console') too — the longer, more specific "Users" match must win.
    expect(activeConsoleSectionId('/console/users')).not.toBe('overview');
  });

  it('returns null for a route outside every known section', () => {
    expect(activeConsoleSectionId('/launcher')).toBeNull();
  });

  it('does not treat one section as a prefix of an unrelated section with a similar name', () => {
    // '/console/oauth-clients' must not match 'plugins' (href '/console/plugins')
    // just because both live under '/console/'.
    expect(activeConsoleSectionId('/console/oauth-clients')).toBe('oauth-clients');
  });
});
