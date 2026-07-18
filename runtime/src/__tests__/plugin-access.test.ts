import { describe, expect, it } from 'vitest';
import { canOpenPlugin, type PluginAccessInput } from '../plugin-access';

const base: PluginAccessInput = {
  installed: true,
  enabled: true,
  accessPolicy: 'everyone',
  isAdmin: false,
  hasDirectGrant: false,
  hasGroupGrant: false,
};

describe('canOpenPlugin', () => {
  it('denies when not installed, regardless of policy', () => {
    expect(canOpenPlugin({ ...base, installed: false, accessPolicy: 'everyone' })).toBe(false);
  });

  it('denies when globally disabled, regardless of policy', () => {
    expect(canOpenPlugin({ ...base, enabled: false, accessPolicy: 'everyone' })).toBe(false);
  });

  it('everyone: any installed, enabled plugin is openable', () => {
    expect(canOpenPlugin({ ...base, accessPolicy: 'everyone' })).toBe(true);
  });

  it('disabled: denies even an admin with a direct and group grant', () => {
    expect(
      canOpenPlugin({
        ...base,
        accessPolicy: 'disabled',
        isAdmin: true,
        hasDirectGrant: true,
        hasGroupGrant: true,
      }),
    ).toBe(false);
  });

  it('admins: grants only to a user with console:access', () => {
    expect(canOpenPlugin({ ...base, accessPolicy: 'admins', isAdmin: true })).toBe(true);
    expect(canOpenPlugin({ ...base, accessPolicy: 'admins', isAdmin: false })).toBe(false);
  });

  it('admins: an admin with no explicit grant is not auto-granted app access beyond the admins check', () => {
    // admins policy is satisfied by isAdmin alone — no grant needed.
    expect(
      canOpenPlugin({
        ...base,
        accessPolicy: 'admins',
        isAdmin: true,
        hasDirectGrant: false,
        hasGroupGrant: false,
      }),
    ).toBe(true);
  });

  it('selected_users: grants only with a direct grant, admin status does not substitute', () => {
    expect(canOpenPlugin({ ...base, accessPolicy: 'selected_users', hasDirectGrant: true })).toBe(
      true,
    );
    expect(canOpenPlugin({ ...base, accessPolicy: 'selected_users', hasDirectGrant: false })).toBe(
      false,
    );
    expect(
      canOpenPlugin({
        ...base,
        accessPolicy: 'selected_users',
        isAdmin: true,
        hasDirectGrant: false,
      }),
    ).toBe(false);
  });

  it('selected_groups: grants only with a group grant, admin status does not substitute', () => {
    expect(canOpenPlugin({ ...base, accessPolicy: 'selected_groups', hasGroupGrant: true })).toBe(
      true,
    );
    expect(canOpenPlugin({ ...base, accessPolicy: 'selected_groups', hasGroupGrant: false })).toBe(
      false,
    );
    expect(
      canOpenPlugin({
        ...base,
        accessPolicy: 'selected_groups',
        isAdmin: true,
        hasGroupGrant: false,
      }),
    ).toBe(false);
  });
});
