import { afterEach, describe, expect, it } from 'vitest';
import { createHandoffToken, verifyHandoffToken } from '../handoff-token';

const previousSecret = process.env.SOVEREIGN_AUTH_SECRET;

afterEach(() => {
  if (previousSecret === undefined) {
    Reflect.deleteProperty(process.env, 'SOVEREIGN_AUTH_SECRET');
  } else {
    process.env.SOVEREIGN_AUTH_SECRET = previousSecret;
  }
});

const future = Math.floor(Date.now() / 1000) + 900;
const base = {
  handoffId: 'ho1',
  providerId: 'com.example.checkout',
  name: 'checkout-session',
  expiresAt: future,
};

describe('handoff token (RFC 0053)', () => {
  it('issues a token that verifies and returns the opaque handoffId', () => {
    process.env.SOVEREIGN_AUTH_SECRET = 'test-secret';
    const token = createHandoffToken(base);
    const result = verifyHandoffToken(token, {
      providerId: base.providerId,
      name: base.name,
    });
    expect(result).toEqual({ handoffId: 'ho1' });
  });

  it('does not track single-use itself — verifying the same token twice succeeds both times', () => {
    process.env.SOVEREIGN_AUTH_SECRET = 'test-secret';
    const token = createHandoffToken(base);
    const expected = { providerId: base.providerId, name: base.name };
    expect(verifyHandoffToken(token, expected)).toEqual({ handoffId: 'ho1' });
    expect(verifyHandoffToken(token, expected)).toEqual({ handoffId: 'ho1' });
  });

  it('rejects a tampered token', () => {
    process.env.SOVEREIGN_AUTH_SECRET = 'test-secret';
    const token = createHandoffToken(base);
    expect(() =>
      verifyHandoffToken(`${token}x`, { providerId: base.providerId, name: base.name }),
    ).toThrow(/signature/);
  });

  it('rejects a provider or name mismatch', () => {
    process.env.SOVEREIGN_AUTH_SECRET = 'test-secret';
    const token = createHandoffToken(base);
    expect(() =>
      verifyHandoffToken(token, { providerId: 'com.example.other', name: base.name }),
    ).toThrow(/provider mismatch/);
    expect(() =>
      verifyHandoffToken(token, { providerId: base.providerId, name: 'other-flow' }),
    ).toThrow(/name mismatch/);
  });

  it('rejects an expired token', () => {
    process.env.SOVEREIGN_AUTH_SECRET = 'test-secret';
    const token = createHandoffToken({ ...base, expiresAt: Math.floor(Date.now() / 1000) - 10 });
    expect(() =>
      verifyHandoffToken(token, { providerId: base.providerId, name: base.name }),
    ).toThrow(/expired/);
  });

  it('throws when no signing secret is configured', () => {
    Reflect.deleteProperty(process.env, 'SOVEREIGN_AUTH_SECRET');
    Reflect.deleteProperty(process.env, 'AUTH_SECRET');
    expect(() => createHandoffToken(base)).toThrow(/SOVEREIGN_AUTH_SECRET or AUTH_SECRET/);
  });
});
