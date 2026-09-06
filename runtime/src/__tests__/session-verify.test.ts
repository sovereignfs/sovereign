import { createHmac } from 'node:crypto';
import { getCookieCache } from 'better-auth/cookies';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveAuthSecret, verifiedUserFromCache } from '../session-verify';
import cookie1_6 from './fixtures/session-data-cookie-1.6.25.json';
import cookie1_7 from './fixtures/session-data-cookie-1.7.2.json';

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

  it('carries the registration timezone through, null when unset', () => {
    const withTz = verifiedUserFromCache(cache({ user: { timezone: 'Europe/Berlin' } }));
    expect(withTz?.user.timezone).toBe('Europe/Berlin');
    const withoutTz = verifiedUserFromCache(cache({ user: { timezone: undefined } }));
    expect(withoutTz?.user.timezone).toBeNull();
  });

  it('normalizes verificationLevel (number, bigint-as-string, and absent) to 0-3', () => {
    expect(
      verifiedUserFromCache(cache({ user: { verificationLevel: 2 } }))?.user.verificationLevel,
    ).toBe(2);
    expect(
      verifiedUserFromCache(cache({ user: { verificationLevel: '3' } }))?.user.verificationLevel,
    ).toBe(3);
    expect(
      verifiedUserFromCache(cache({ user: { verificationLevel: undefined } }))?.user
        .verificationLevel,
    ).toBe(0);
    expect(
      verifiedUserFromCache(cache({ user: { verificationLevel: 99 } }))?.user.verificationLevel,
    ).toBe(3);
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
 *
 * The forged payload mirrors setCookieCache's real shape — `{ session, user,
 * updatedAt, version }` — not a minimal subset: better-auth 1.7's
 * `cookieCachePayloadSchema` requires `updatedAt`, and 1.6's writer always
 * emitted it, so a fixture without it is a fixture no real server ever
 * produced (that omission is exactly what made this test fail on the 1.7
 * upgrade, not any change to the wire format).
 */
describe('getCookieCache (offline HMAC verification)', () => {
  const SECRET = 'test-secret-test-secret-test-secret';

  function forge(secret: string): string {
    // Full session/user records, as setCookieCache writes them — better-auth
    // 1.7's parser validates against its core sessionSchema/userSchema, so a
    // partial record is rejected before the signature is even checked.
    const now = new Date().toISOString();
    const inner = {
      session: {
        id: 's1',
        userId: 'u1',
        token: 't1',
        expiresAt: FUTURE,
        createdAt: now,
        updatedAt: now,
      },
      user: {
        id: 'u1',
        name: 'A',
        email: 'a@b.c',
        emailVerified: false,
        createdAt: now,
        updatedAt: now,
        role: 'platform:admin',
        active: true,
      },
      updatedAt: Date.now(),
      version: '1',
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

/**
 * Upgrade-compatibility proof (epic task 1.26): the runtime's offline
 * verification must keep accepting cookies written by the previous
 * better-auth line, or every signed-in user is logged out mid-rollout while
 * the middleware storms `/api/verify`. Both fixtures are genuine artifacts —
 * captured from a real `betterAuth()` instance of the named version (memory
 * adapter, apps/auth's own user additionalFields, `cookieCache.maxAge: 300`)
 * via `auth.api.signUpEmail({ returnHeaders: true })` — not hand-forged. Each
 * cookie's own expiry is only 300 s past capture, so the clock is pinned to
 * the capture instant; the assertions cover the user fields the middleware
 * actually forwards as `x-sovereign-user-*` headers.
 */
describe('getCookieCache accepts cookies from previous better-auth versions', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  for (const fixture of [cookie1_6, cookie1_7]) {
    it(`decodes a session_data cookie written by better-auth ${fixture.betterAuthVersion}`, async () => {
      vi.useFakeTimers();
      vi.setSystemTime(fixture.capturedAtMs + 1_000);

      const headers = new Headers({ cookie: fixture.cookieHeader });
      const cached = await getCookieCache(headers, { secret: fixture.secret, isSecure: false });
      expect(cached).not.toBeNull();

      const session = verifiedUserFromCache(cached);
      expect(session?.user).toMatchObject({
        email: 'fixture@sovereign.local',
        name: 'Fixture User',
        role: 'platform:user',
        timezone: 'Europe/Berlin',
        verificationLevel: 0,
      });
      expect(session?.expiresAt).toBeGreaterThan(Math.floor(fixture.capturedAtMs / 1000));
    });

    it(`rejects that same ${fixture.betterAuthVersion} cookie under a different secret`, async () => {
      vi.useFakeTimers();
      vi.setSystemTime(fixture.capturedAtMs + 1_000);
      const headers = new Headers({ cookie: fixture.cookieHeader });
      const cached = await getCookieCache(headers, {
        secret: 'a-different-secret-aaaaaaaaaaaaaaaa',
        isSecure: false,
      });
      expect(cached).toBeNull();
    });
  }
});
