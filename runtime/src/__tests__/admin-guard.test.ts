import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { checkAdminKey } from '../admin-guard';

function requestWithAuth(header?: string): Request {
  return new Request('http://localhost:3000/api/admin/plugins', {
    headers: header ? { authorization: header } : {},
  });
}

describe('checkAdminKey (runtime)', () => {
  const original = process.env.SOVEREIGN_ADMIN_KEY;

  beforeEach(() => {
    process.env.SOVEREIGN_ADMIN_KEY = 'test-admin-key';
  });

  afterEach(() => {
    if (original === undefined) delete process.env.SOVEREIGN_ADMIN_KEY;
    else process.env.SOVEREIGN_ADMIN_KEY = original;
  });

  it('returns null for a valid bearer token', () => {
    expect(checkAdminKey(requestWithAuth('Bearer test-admin-key'))).toBeNull();
  });

  it('returns 403 for a wrong key', () => {
    expect(checkAdminKey(requestWithAuth('Bearer wrong'))?.status).toBe(403);
  });

  it('returns 403 when the header is missing', () => {
    expect(checkAdminKey(requestWithAuth())?.status).toBe(403);
  });

  it('returns 503 when SOVEREIGN_ADMIN_KEY is not configured', () => {
    delete process.env.SOVEREIGN_ADMIN_KEY;
    expect(checkAdminKey(requestWithAuth('Bearer anything'))?.status).toBe(503);
  });
});
