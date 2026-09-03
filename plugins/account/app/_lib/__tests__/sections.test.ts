import { describe, expect, it } from 'vitest';
import { activeAccountSectionId } from '../sections';

describe('activeAccountSectionId', () => {
  it('matches a section route exactly', () => {
    expect(activeAccountSectionId('/account/profile')).toBe('profile');
  });

  it('matches a nested route under a section, not just the exact href', () => {
    expect(activeAccountSectionId('/account/security/sessions')).toBe('security');
  });

  it('returns null for the bare index route, which is not itself a section', () => {
    expect(activeAccountSectionId('/account')).toBeNull();
  });

  it('returns null for a route outside every known section', () => {
    expect(activeAccountSectionId('/launcher')).toBeNull();
  });

  it('does not treat one section as a prefix of an unrelated section with a similar name', () => {
    // '/account/data' must not match 'activity' or any other section just
    // because it shares the '/account/' prefix.
    expect(activeAccountSectionId('/account/data')).toBe('data');
  });
});
