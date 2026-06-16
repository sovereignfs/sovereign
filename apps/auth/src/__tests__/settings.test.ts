import { describe, expect, it } from 'vitest';
import { resolveInviteOnly } from '../settings';

describe('resolveInviteOnly', () => {
  it("returns true when 'true' is stored, regardless of env default", () => {
    expect(resolveInviteOnly('true', false)).toBe(true);
    expect(resolveInviteOnly('true', true)).toBe(true);
  });

  it("returns false when 'false' is stored, regardless of env default", () => {
    expect(resolveInviteOnly('false', true)).toBe(false);
    expect(resolveInviteOnly('false', false)).toBe(false);
  });

  it('falls back to the env default when nothing is stored', () => {
    expect(resolveInviteOnly(null, true)).toBe(true);
    expect(resolveInviteOnly(null, false)).toBe(false);
    expect(resolveInviteOnly(undefined, true)).toBe(true);
  });

  it('falls back to the env default for an unrecognised stored value', () => {
    expect(resolveInviteOnly('yes', true)).toBe(true);
    expect(resolveInviteOnly('', false)).toBe(false);
  });
});
