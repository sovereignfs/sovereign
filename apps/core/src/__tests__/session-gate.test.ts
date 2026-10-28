import { describe, expect, it } from 'vitest';
import { assertMayOpenSession } from '../auth/session-gate';

const verified = { emailVerified: true };
const strict = { requireEmailVerification: true };
const lax = { requireEmailVerification: false };

const code = (run: () => void) => {
  try {
    run();
  } catch (error) {
    return (error as { body?: { code?: string } }).body?.code;
  }
  return undefined;
};

describe('the gate on opening a session', () => {
  it('lets an active, verified account in', () => {
    expect(code(() => assertMayOpenSession(verified, strict))).toBeUndefined();
    expect(
      code(() => assertMayOpenSession({ ...verified, deactivatedAt: null }, strict)),
    ).toBeUndefined();
  });

  it('refuses a deactivated account, however it is stored', () => {
    for (const deactivatedAt of [new Date(), 1_761_580_000_000, '2026-10-28T10:00:00.000Z']) {
      expect(code(() => assertMayOpenSession({ ...verified, deactivatedAt }, lax))).toBe(
        'ACCOUNT_DEACTIVATED',
      );
    }
  });

  it('counts the moment zero as deactivated: only null and absent mean active', () => {
    expect(code(() => assertMayOpenSession({ ...verified, deactivatedAt: 0 }, lax))).toBe(
      'ACCOUNT_DEACTIVATED',
    );
  });

  it('refuses an unverified address only while verification is required', () => {
    expect(code(() => assertMayOpenSession({ emailVerified: false }, strict))).toBe(
      'EMAIL_NOT_VERIFIED',
    );
    expect(code(() => assertMayOpenSession({ emailVerified: false }, lax))).toBeUndefined();
  });

  it('says deactivated before unverified, since that is the one that will not change by itself', () => {
    expect(
      code(() => assertMayOpenSession({ emailVerified: false, deactivatedAt: new Date() }, strict)),
    ).toBe('ACCOUNT_DEACTIVATED');
  });
});
