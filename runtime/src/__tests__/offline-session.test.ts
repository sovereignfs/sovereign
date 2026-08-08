import { describe, expect, it } from 'vitest';
import {
  ANONYMOUS_PARTITION,
  OFFLINE_ASSERTION_TYPE,
  isKeyForUser,
  partitionedCacheKey,
  userFromAssertionClaims,
} from '../offline-session';

const NOW = Date.UTC(2026, 7, 8, 12, 0, 0);
const future = (seconds: number) => Math.floor(NOW / 1000) + seconds;

function claims(overrides: Record<string, unknown> = {}) {
  return { typ: OFFLINE_ASSERTION_TYPE, sub: 'user_alice', exp: future(3600), ...overrides };
}

describe('userFromAssertionClaims', () => {
  it('returns the subject for a valid, unexpired assertion', () => {
    expect(userFromAssertionClaims(claims(), NOW)).toBe('user_alice');
  });

  it('rejects a null or undefined claim set', () => {
    expect(userFromAssertionClaims(null, NOW)).toBeNull();
    expect(userFromAssertionClaims(undefined, NOW)).toBeNull();
  });

  it('rejects an expired assertion', () => {
    expect(userFromAssertionClaims(claims({ exp: future(-1) }), NOW)).toBeNull();
  });

  it('rejects an assertion expiring exactly now', () => {
    expect(userFromAssertionClaims(claims({ exp: Math.floor(NOW / 1000) }), NOW)).toBeNull();
  });

  it('rejects an assertion with no expiry rather than treating it as eternal', () => {
    expect(userFromAssertionClaims(claims({ exp: undefined }), NOW)).toBeNull();
  });

  it('rejects a non-numeric or non-finite expiry', () => {
    expect(userFromAssertionClaims(claims({ exp: '9999999999' }), NOW)).toBeNull();
    expect(userFromAssertionClaims(claims({ exp: Number.POSITIVE_INFINITY }), NOW)).toBeNull();
  });

  it('rejects a missing, empty, or non-string subject', () => {
    expect(userFromAssertionClaims(claims({ sub: undefined }), NOW)).toBeNull();
    expect(userFromAssertionClaims(claims({ sub: '' }), NOW)).toBeNull();
    expect(userFromAssertionClaims(claims({ sub: 42 }), NOW)).toBeNull();
  });

  // Type confusion: the jwt() plugin signs RFC 0072 OIDC ID tokens with the
  // same keypair, so a valid signature does not prove the token was minted as
  // an offline assertion. Without the typ check, an ID token could be replayed
  // here to select its subject's cache partition.
  it('rejects a token signed by the same keypair for another purpose', () => {
    expect(userFromAssertionClaims(claims({ typ: undefined }), NOW)).toBeNull();
    expect(userFromAssertionClaims(claims({ typ: 'JWT' }), NOW)).toBeNull();
    expect(userFromAssertionClaims(claims({ typ: 'at+jwt' }), NOW)).toBeNull();
  });
});

describe('partitionedCacheKey', () => {
  it('scopes a key to its user', () => {
    expect(partitionedCacheKey('https://x.test/', 'user_alice')).toBe(
      'https://x.test/?__sv_u=user_alice',
    );
  });

  it('appends to an existing query string rather than corrupting it', () => {
    expect(partitionedCacheKey('https://x.test/p?a=1', 'user_alice')).toBe(
      'https://x.test/p?a=1&__sv_u=user_alice',
    );
  });

  it('gives different users different keys for the same URL', () => {
    const a = partitionedCacheKey('https://x.test/', 'user_alice');
    const b = partitionedCacheKey('https://x.test/', 'user_bob');
    expect(a).not.toBe(b);
  });

  // Failing closed: an unknown user must never collide with a real user's
  // cached document. Worst case is a cache miss, never a cross-user leak.
  it('uses a distinct anonymous partition when no user is established', () => {
    const anon = partitionedCacheKey('https://x.test/', null);
    expect(anon).toContain(ANONYMOUS_PARTITION);
    expect(anon).not.toBe(partitionedCacheKey('https://x.test/', 'user_alice'));
    expect(anon).not.toBe('https://x.test/');
  });

  it('escapes user ids so a crafted id cannot forge another partition', () => {
    const crafted = partitionedCacheKey('https://x.test/', 'a&__sv_u=user_alice');
    expect(isKeyForUser(crafted, 'user_alice')).toBe(false);
  });
});

describe('isKeyForUser', () => {
  it('matches only the owning user', () => {
    const key = partitionedCacheKey('https://x.test/', 'user_alice');
    expect(isKeyForUser(key, 'user_alice')).toBe(true);
    expect(isKeyForUser(key, 'user_bob')).toBe(false);
  });

  it('does not match the anonymous partition', () => {
    expect(isKeyForUser(partitionedCacheKey('https://x.test/', null), 'user_alice')).toBe(false);
  });
});
