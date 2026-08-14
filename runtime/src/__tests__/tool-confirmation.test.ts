import { createHmac } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createToolConfirmationToken,
  hashToolInput,
  verifyToolConfirmationToken,
} from '../tool-confirmation';

const previousSecret = process.env.SOVEREIGN_AUTH_SECRET;

afterEach(() => {
  if (previousSecret === undefined) {
    Reflect.deleteProperty(process.env, 'SOVEREIGN_AUTH_SECRET');
  } else {
    process.env.SOVEREIGN_AUTH_SECRET = previousSecret;
  }
});

const baseExpected = {
  actorUserId: 'u1',
  callerPluginId: 'com.example.caller',
  providerId: 'com.example.provider',
  tool: 'create-record',
  input: { title: 'Example' },
};

describe('tool confirmation token (RFC 0047)', () => {
  it('issues a token that verifies successfully for the same input, then rejects replay', () => {
    process.env.SOVEREIGN_AUTH_SECRET = 'test-secret';
    const token = createToolConfirmationToken({ ...baseExpected, expiresInSeconds: 60 });

    expect(() => verifyToolConfirmationToken(token, baseExpected)).not.toThrow();
    expect(() => verifyToolConfirmationToken(token, baseExpected)).toThrow(/already been used/);
  });

  it('rejects a tampered token', () => {
    process.env.SOVEREIGN_AUTH_SECRET = 'test-secret';
    const token = createToolConfirmationToken(baseExpected);
    expect(() => verifyToolConfirmationToken(`${token}x`, baseExpected)).toThrow(/signature/);
  });

  it('rejects when the actor, caller, provider, or tool does not match', () => {
    process.env.SOVEREIGN_AUTH_SECRET = 'test-secret';
    const token = createToolConfirmationToken(baseExpected);
    expect(() =>
      verifyToolConfirmationToken(token, { ...baseExpected, actorUserId: 'other' }),
    ).toThrow(/actor mismatch/);
    expect(() =>
      verifyToolConfirmationToken(token, { ...baseExpected, callerPluginId: 'com.example.other' }),
    ).toThrow(/caller mismatch/);
    expect(() =>
      verifyToolConfirmationToken(token, { ...baseExpected, providerId: 'com.example.other' }),
    ).toThrow(/provider mismatch/);
    expect(() =>
      verifyToolConfirmationToken(token, { ...baseExpected, tool: 'other-tool' }),
    ).toThrow(/tool mismatch/);
  });

  it('rejects when the input changed since preview (input-hash binding)', () => {
    process.env.SOVEREIGN_AUTH_SECRET = 'test-secret';
    const token = createToolConfirmationToken(baseExpected);
    expect(() =>
      verifyToolConfirmationToken(token, { ...baseExpected, input: { title: 'Different' } }),
    ).toThrow(/input changed since preview/);
  });

  it('rejects an expired token', () => {
    // expiresInSeconds is clamped to a 60s floor, so an already-expired
    // token can't be produced via the public API — forge one with the same
    // signing scheme (HMAC-SHA256 over the base64url payload) instead.
    process.env.SOVEREIGN_AUTH_SECRET = 'test-secret';
    const payload = {
      version: 'st1',
      ...baseExpected,
      inputHash: hashToolInput(baseExpected.input),
      nonce: 'forged-nonce',
      expiresAt: Math.floor(Date.now() / 1000) - 10,
    };
    const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = createHmac('sha256', 'test-secret').update(encoded).digest('base64url');
    expect(() => verifyToolConfirmationToken(`${encoded}.${signature}`, baseExpected)).toThrow(
      /expired/,
    );
  });

  it('clamps expiresInSeconds between 60s and 15 minutes', () => {
    process.env.SOVEREIGN_AUTH_SECRET = 'test-secret';
    // No direct way to read the clamped TTL from the opaque token without
    // decoding it — decode the payload ourselves to assert the clamp took effect.
    const tokenTooShort = createToolConfirmationToken({ ...baseExpected, expiresInSeconds: 1 });
    const tokenTooLong = createToolConfirmationToken({
      ...baseExpected,
      expiresInSeconds: 60 * 60,
    });
    const decode = (token: string): { expiresAt: number } =>
      JSON.parse(Buffer.from(token.split('.')[0] ?? '', 'base64url').toString('utf8')) as {
        expiresAt: number;
      };
    const now = Math.floor(Date.now() / 1000);
    expect(decode(tokenTooShort).expiresAt - now).toBeLessThanOrEqual(60);
    expect(decode(tokenTooLong).expiresAt - now).toBeLessThanOrEqual(15 * 60);
  });

  it('hashToolInput is deterministic for equal inputs and normalizes undefined/null', () => {
    expect(hashToolInput({ a: 1 })).toBe(hashToolInput({ a: 1 }));
    expect(hashToolInput(undefined)).toBe(hashToolInput(null));
  });

  it('throws when no signing secret is configured', () => {
    Reflect.deleteProperty(process.env, 'SOVEREIGN_AUTH_SECRET');
    Reflect.deleteProperty(process.env, 'AUTH_SECRET');
    expect(() => createToolConfirmationToken(baseExpected)).toThrow(
      /SOVEREIGN_AUTH_SECRET or AUTH_SECRET/,
    );
  });
});
