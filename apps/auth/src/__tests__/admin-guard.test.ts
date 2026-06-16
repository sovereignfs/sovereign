import { beforeAll, describe, expect, it } from 'vitest';
import { checkAdminKey } from '../admin-guard';

function requestWithAuth(header?: string): Request {
  return new Request('http://localhost:3001/api/admin/users', {
    headers: header ? { authorization: header } : {},
  });
}

beforeAll(() => {
  // getEnv() validates required vars on first call and caches the result.
  process.env.AUTH_SECRET = 'test-secret';
  process.env.SOVEREIGN_ADMIN_KEY = 'test-admin-key';
});

describe('checkAdminKey (auth server)', () => {
  it('returns null for a valid bearer token', () => {
    expect(checkAdminKey(requestWithAuth('Bearer test-admin-key'))).toBeNull();
  });

  it('returns 403 for a wrong key', async () => {
    const res = checkAdminKey(requestWithAuth('Bearer wrong'));
    expect(res?.status).toBe(403);
  });

  it('returns 403 when the header is missing', () => {
    expect(checkAdminKey(requestWithAuth())?.status).toBe(403);
  });

  it('returns 403 for a non-bearer scheme', () => {
    expect(checkAdminKey(requestWithAuth('Basic test-admin-key'))?.status).toBe(403);
  });
});
