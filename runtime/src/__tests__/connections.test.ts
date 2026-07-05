import { afterEach, describe, expect, it } from 'vitest';
import { createOAuthStateToken, verifyOAuthStateToken } from '../connections';

const previousSecret = process.env.SOVEREIGN_AUTH_SECRET;

afterEach(() => {
  if (previousSecret === undefined) {
    Reflect.deleteProperty(process.env, 'SOVEREIGN_AUTH_SECRET');
  } else {
    process.env.SOVEREIGN_AUTH_SECRET = previousSecret;
  }
});

describe('OAuth connection state helpers (RFC 0049)', () => {
  it('signs expiry-bound state and rejects replay', () => {
    process.env.SOVEREIGN_AUTH_SECRET = 'test-secret';
    const state = createOAuthStateToken({
      pluginId: 'com.example.notes',
      userId: 'u1',
      provider: 'email.google',
      callbackPath: '/connections/google/callback',
      nonce: 'nonce-1',
      metadata: { flow: 'connect' },
      expiresInSeconds: 60,
    });

    const verified = verifyOAuthStateToken(state, {
      pluginId: 'com.example.notes',
      userId: 'u1',
      callbackPath: '/connections/google/callback',
    });
    expect(verified).toMatchObject({
      pluginId: 'com.example.notes',
      userId: 'u1',
      provider: 'email.google',
      callbackPath: '/connections/google/callback',
      nonce: 'nonce-1',
      metadata: { flow: 'connect' },
    });
    expect(() =>
      verifyOAuthStateToken(state, { pluginId: 'com.example.notes', userId: 'u1' }),
    ).toThrow(/already been used/);
  });

  it('rejects tampered and mismatched state', () => {
    process.env.SOVEREIGN_AUTH_SECRET = 'test-secret';
    const state = createOAuthStateToken({
      pluginId: 'com.example.notes',
      userId: 'u1',
      provider: 'email.google',
      callbackPath: '/connections/google/callback',
    });
    expect(() =>
      verifyOAuthStateToken(`${state}x`, { pluginId: 'com.example.notes', userId: 'u1' }),
    ).toThrow(/signature/);
    expect(() =>
      verifyOAuthStateToken(state, { pluginId: 'com.example.other', userId: 'u1' }),
    ).toThrow(/plugin mismatch/);
  });
});
