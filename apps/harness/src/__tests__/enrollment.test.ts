import { beforeEach, describe, expect, it } from 'vitest';

beforeEach(() => {
  process.env.SOVEREIGN_HARNESS_ENROLLMENT_SECRET = 'test-enrollment-secret';
});

describe('issueEnrollmentToken / verifyEnrollmentToken', () => {
  it('issues a token that verifies back to the same instance id', async () => {
    const { issueEnrollmentToken, verifyEnrollmentToken } = await import('../enrollment');
    const { instanceId, token } = issueEnrollmentToken();
    expect(verifyEnrollmentToken(token)).toEqual({ instanceId });
  });

  it('issues a different instance id on every call', async () => {
    const { issueEnrollmentToken } = await import('../enrollment');
    const first = issueEnrollmentToken();
    const second = issueEnrollmentToken();
    expect(first.instanceId).not.toBe(second.instanceId);
    expect(first.token).not.toBe(second.token);
  });

  it('rejects a token signed with a different secret', async () => {
    const { issueEnrollmentToken, verifyEnrollmentToken } = await import('../enrollment');
    const { token } = issueEnrollmentToken();
    process.env.SOVEREIGN_HARNESS_ENROLLMENT_SECRET = 'a-different-secret';
    expect(verifyEnrollmentToken(token)).toBeNull();
  });

  it('rejects a tampered payload even with an otherwise-valid signature shape', async () => {
    const { issueEnrollmentToken, verifyEnrollmentToken } = await import('../enrollment');
    const { token } = issueEnrollmentToken();
    const [header, , signature] = token.split('.');
    const tamperedPayload = Buffer.from(
      JSON.stringify({ instanceId: 'attacker-controlled', iat: 0 }),
    ).toString('base64url');
    expect(verifyEnrollmentToken(`${header}.${tamperedPayload}.${signature}`)).toBeNull();
  });

  it('rejects malformed input without throwing', async () => {
    const { verifyEnrollmentToken } = await import('../enrollment');
    expect(verifyEnrollmentToken('')).toBeNull();
    expect(verifyEnrollmentToken('not-a-token')).toBeNull();
    expect(verifyEnrollmentToken('a.b')).toBeNull();
    expect(verifyEnrollmentToken('a.b.c.d')).toBeNull();
    expect(verifyEnrollmentToken('!!!.!!!.!!!')).toBeNull();
  });
});
