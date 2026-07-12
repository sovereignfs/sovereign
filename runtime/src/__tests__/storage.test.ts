import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  checksumOf,
  createStorageToken,
  maxObjectBytes,
  maxPluginBytes,
  verifyStorageToken,
} from '../storage';

const previousAuthSecret = process.env.SOVEREIGN_AUTH_SECRET;
const previousMaxObjectBytes = process.env.SOVEREIGN_STORAGE_MAX_OBJECT_BYTES;
const previousMaxPluginBytes = process.env.SOVEREIGN_STORAGE_MAX_PLUGIN_BYTES;

function restore(key: string, value: string | undefined) {
  if (value === undefined) {
    Reflect.deleteProperty(process.env, key);
  } else {
    process.env[key] = value;
  }
}

afterEach(() => {
  restore('SOVEREIGN_AUTH_SECRET', previousAuthSecret);
  restore('SOVEREIGN_STORAGE_MAX_OBJECT_BYTES', previousMaxObjectBytes);
  restore('SOVEREIGN_STORAGE_MAX_PLUGIN_BYTES', previousMaxPluginBytes);
});

describe('storage signed download tokens (RFC 0044)', () => {
  it('signs and verifies a token scoped to one object', () => {
    process.env.SOVEREIGN_AUTH_SECRET = 'test-secret';
    const token = createStorageToken({
      tenantId: 'default',
      pluginId: 'com.example.notes',
      objectId: 'obj-1',
      expiresInSeconds: 60,
    });
    const verified = verifyStorageToken(token);
    expect(verified).toMatchObject({
      tenantId: 'default',
      pluginId: 'com.example.notes',
      objectId: 'obj-1',
    });
  });

  it('rejects a tampered token', () => {
    process.env.SOVEREIGN_AUTH_SECRET = 'test-secret';
    const token = createStorageToken({
      tenantId: 'default',
      pluginId: 'com.example.notes',
      objectId: 'obj-1',
    });
    expect(() => verifyStorageToken(`${token}x`)).toThrow(/signature/);
  });

  it('rejects an expired token', () => {
    process.env.SOVEREIGN_AUTH_SECRET = 'test-secret';
    const token = createStorageToken({
      tenantId: 'default',
      pluginId: 'com.example.notes',
      objectId: 'obj-1',
      expiresInSeconds: 1, // minimum allowed TTL — see clamping test below
    });
    vi.useFakeTimers();
    try {
      vi.advanceTimersByTime(2000);
      expect(() => verifyStorageToken(token)).toThrow(/expired/);
    } finally {
      vi.useRealTimers();
    }
  });

  it('clamps expiry to a minimum of one second', () => {
    process.env.SOVEREIGN_AUTH_SECRET = 'test-secret';
    const token = createStorageToken({
      tenantId: 'default',
      pluginId: 'com.example.notes',
      objectId: 'obj-1',
      expiresInSeconds: -1,
    });
    const verified = verifyStorageToken(token);
    expect(verified.expiresAt).toBeGreaterThanOrEqual(Math.floor(Date.now() / 1000));
  });

  it('clamps expiry to the maximum allowed TTL', () => {
    process.env.SOVEREIGN_AUTH_SECRET = 'test-secret';
    const token = createStorageToken({
      tenantId: 'default',
      pluginId: 'com.example.notes',
      objectId: 'obj-1',
      expiresInSeconds: 10 * 60 * 60, // 10 hours — well past the 1-hour cap
    });
    const verified = verifyStorageToken(token);
    const maxExpected = Math.floor(Date.now() / 1000) + 60 * 60 + 5;
    expect(verified.expiresAt).toBeLessThanOrEqual(maxExpected);
  });
});

describe('checksumOf', () => {
  it('is deterministic for identical bytes', () => {
    const a = checksumOf(Buffer.from('hello'));
    const b = checksumOf(Buffer.from('hello'));
    expect(a).toBe(b);
    expect(a).toHaveLength(64); // sha256 hex digest
  });

  it('differs for different bytes', () => {
    expect(checksumOf(Buffer.from('hello'))).not.toBe(checksumOf(Buffer.from('world')));
  });
});

describe('storage quota defaults', () => {
  it('falls back to conservative defaults when unset', () => {
    Reflect.deleteProperty(process.env, 'SOVEREIGN_STORAGE_MAX_OBJECT_BYTES');
    Reflect.deleteProperty(process.env, 'SOVEREIGN_STORAGE_MAX_PLUGIN_BYTES');
    expect(maxObjectBytes()).toBeGreaterThan(0);
    expect(maxPluginBytes()).toBeGreaterThan(maxObjectBytes());
  });

  it('honors env overrides', () => {
    process.env.SOVEREIGN_STORAGE_MAX_OBJECT_BYTES = '1024';
    process.env.SOVEREIGN_STORAGE_MAX_PLUGIN_BYTES = '4096';
    expect(maxObjectBytes()).toBe(1024);
    expect(maxPluginBytes()).toBe(4096);
  });

  it('ignores invalid env values', () => {
    process.env.SOVEREIGN_STORAGE_MAX_OBJECT_BYTES = 'not-a-number';
    expect(maxObjectBytes()).toBeGreaterThan(0);
  });
});
