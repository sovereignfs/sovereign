import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  vi.resetModules();
  process.env = { ...ORIGINAL_ENV };
  process.env.AUTH_SECRET = 'test-secret';
  process.env.SOVEREIGN_ADMIN_KEY = 'test-admin-key';
  process.env.AUTH_DATABASE_URL = ':memory:';
  process.env.AUTH_PORT = '5003';
  process.env.RUNTIME_PORT = '5002';
  Reflect.deleteProperty(process.env, 'AUTH_BASE_URL');
  Reflect.deleteProperty(process.env, 'NEXT_PUBLIC_RUNTIME_URL');
  Reflect.deleteProperty(process.env, 'SOVEREIGN_AUTH_PUBLIC_URL');
  Reflect.deleteProperty(process.env, 'AUTH_WEBAUTHN_ORIGIN');
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('auth env port defaults', () => {
  it('derives localhost auth and runtime URLs from AUTH_PORT/RUNTIME_PORT', async () => {
    const { getEnv } = await import('../env');
    const env = getEnv();

    expect(env.baseUrl).toBe('http://localhost:5003');
    expect(env.webAuthnOrigin).toEqual(['http://localhost:5002', 'http://localhost:5003']);
  });

  it('runtimePublicUrl falls back to RUNTIME_PORT', async () => {
    const { runtimePublicUrl } = await import('../runtime-url');
    expect(runtimePublicUrl()).toBe('http://localhost:5002');
  });
});
