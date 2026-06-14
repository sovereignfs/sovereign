import { createHmac } from 'node:crypto';
import { getCookieCache } from 'better-auth/cookies';
import { describe, expect, it } from 'vitest';
import { resolveAuthSecret, verifiedUserFromCache } from './session-verify';

const FUTURE = new Date(Date.now() + 60_000).toISOString();
const PAST = new Date(Date.now() - 60_000).toISOString();

function cache(over: {
  expiresAt?: string;
  user?: Record<string, unknown>;
}): Parameters<typeof verifiedUserFromCache>[0] {
  return {
    session: { expiresAt: over.expiresAt ?? FUTURE },
    user: { id: 'u1', email: 'a@b.c', role: 'platform:admin', active: true, ...over.user },
  };
}

describe('resolveAuthSecret', () => {
  it('prefers SOVEREIGN_AUTH_SECRET, falls back to AUTH_SECRET, else null', () => {
    expect(resolveAuthSecret({ SOVEREIGN_AUTH_SECRET: 's', AUTH_SECRET: 'a' })).toBe('s');
    expect(resolveAuthSecret({ AUTH_SECRET: 'a' })).toBe('a');
    expect(resolveAuthSecret({})).toBeNull();
  });
});

describe('verifiedUserFromCache', () => {
  it('returns the user for a valid, unexpired, active session', () => {
    const session = verifiedUserFromCache(cache({}));
    expect(session?.user).toMatchObject({ id: 'u1', email: 'a@b.c', role: 'platform:admin' });
    expect(session?.expiresAt).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it('rejects an expired session', () => {
    expect(verifiedUserFromCache(cache({ expiresAt: PAST }))).toBeNull();
  });

  it('rejects a deactivated account', () => {
    expect(verifiedUserFromCache(cache({ user: { active: false } }))).toBeNull();
  });

  it('defaults a missing role to platform:user (least privilege)', () => {
    const session = verifiedUserFromCache(cache({ user: { role: undefined } }));
    expect(session?.user.role).toBe('platform:user');
  });

  it('rejects payloads without a user id', () => {
    expect(verifiedUserFromCache({ session: { expiresAt: FUTURE }, user: {} })).toBeNull();
    expect(verifiedUserFromCache(null)).toBeNull();
  });
});

/**
 * Offline-verification proof: forge a better-auth "compact" session_data cookie
 * (the exact format setCookieCache writes — base64url JSON with an HMAC-SHA256
 * signature over the session + expiry), then verify it with the real
 * getCookieCache + verifiedUserFromCache, with no network call. A tampered
 * cookie must be rejected.
 */
describe('getCookieCache (offline HMAC verification)', () => {
  const SECRET = 'test-secret-test-secret-test-secret';

  function forge(secret: string): string {
    const inner = {
      session: { id: 's1', userId: 'u1', expiresAt: FUTURE, token: 't1' },
      user: { id: 'u1', email: 'a@b.c', role: 'platform:admin', active: true },
    };
    const expiresAt = Date.now() + 300_000;
    const signature = createHmac('sha256', secret)
      .update(JSON.stringify({ ...inner, expiresAt }))
      .digest('base64url');
    const value = Buffer.from(
      JSON.stringify({ session: inner, expiresAt, signature }),
      'utf8',
    ).toString('base64url');
    return `better-auth.session_data=${value}`;
  }

  it('extracts the user from a correctly-signed cookie', async () => {
    const headers = new Headers({ cookie: forge(SECRET) });
    const cached = await getCookieCache(headers, { secret: SECRET, isSecure: false });
    expect(cached).not.toBeNull();
    const session = verifiedUserFromCache(cached);
    expect(session?.user.id).toBe('u1');
    expect(session?.user.role).toBe('platform:admin');
  });

  it('rejects a cookie signed with the wrong secret', async () => {
    const headers = new Headers({ cookie: forge('a-different-secret-aaaaaaaaaaaaaaaa') });
    const cached = await getCookieCache(headers, { secret: SECRET, isSecure: false });
    expect(cached).toBeNull();
  });

  it('rejects a tampered cookie value', async () => {
    const forged = forge(SECRET);
    const tampered = forged.slice(0, -3) + (forged.endsWith('AAA') ? 'BBB' : 'AAA');
    const headers = new Headers({ cookie: tampered });
    const cached = await getCookieCache(headers, { secret: SECRET, isSecure: false });
    expect(cached).toBeNull();
  });
});
