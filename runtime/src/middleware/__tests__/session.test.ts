import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

function request(path = '/'): NextRequest {
  return new NextRequest(`http://runtime.test${path}`);
}

describe('verifySession', () => {
  afterEach(() => {
    vi.doUnmock('better-auth/cookies');
    vi.doUnmock('@/src/session-verify');
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('returns the cached session with no forwarded cookies on a cookie-cache hit', async () => {
    vi.doMock('better-auth/cookies', () => ({
      getCookieCache: () => Promise.resolve({ session: {}, user: {} }),
    }));
    vi.doMock('@/src/session-verify', () => ({
      resolveAuthSecret: () => 'secret',
      verifiedUserFromCache: () => ({
        user: { id: 'u1', email: 'a@b.c', role: 'platform:user', verificationLevel: 1 },
        expiresAt: Math.floor(Date.now() / 1000) + 60,
      }),
    }));
    const { verifySession } = await import('../session');
    const result = await verifySession(request());
    expect(result?.session.user.id).toBe('u1');
    expect(result?.setCookies).toEqual([]);
  });

  it('falls back to the auth server on a cookie-cache miss and forwards Set-Cookie', async () => {
    vi.doMock('better-auth/cookies', () => ({
      getCookieCache: () => Promise.resolve(null),
    }));
    vi.doMock('@/src/session-verify', () => ({
      resolveAuthSecret: () => 'secret',
      verifiedUserFromCache: () => null,
    }));
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          user: { id: 'u2', email: 'b@c.d', role: 'platform:admin', verificationLevel: 2 },
          expiresAt: Math.floor(Date.now() / 1000) + 60,
        }),
        headers: { getSetCookie: () => ['better-auth.session_data=fresh'] },
      })),
    );
    const { verifySession } = await import('../session');
    const result = await verifySession(request());
    expect(result?.session.user.id).toBe('u2');
    expect(result?.setCookies).toEqual(['better-auth.session_data=fresh']);
  });

  it('fails closed (returns null) when both the cache and the auth server miss', async () => {
    vi.doMock('better-auth/cookies', () => ({
      getCookieCache: () => Promise.resolve(null),
    }));
    vi.doMock('@/src/session-verify', () => ({
      resolveAuthSecret: () => 'secret',
      verifiedUserFromCache: () => null,
    }));
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, headers: { getSetCookie: () => [] } })),
    );
    const { verifySession } = await import('../session');
    expect(await verifySession(request())).toBeNull();
  });

  it('fails closed when the auth server is unreachable, not by throwing', async () => {
    vi.doMock('better-auth/cookies', () => ({
      getCookieCache: () => Promise.resolve(null),
    }));
    vi.doMock('@/src/session-verify', () => ({
      resolveAuthSecret: () => 'secret',
      verifiedUserFromCache: () => null,
    }));
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down');
      }),
    );
    const { verifySession } = await import('../session');
    await expect(verifySession(request())).resolves.toBeNull();
  });
});
