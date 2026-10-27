import { ConfigError } from '@sovereignfs/config';
import { describe, expect, it } from 'vitest';
import { resolveAuthSettings } from '../auth/settings';
import { config } from '../config';

const BASE = {
  SV_URL: 'https://core.example.com',
  SV_AUTH_SECRET: 'a-secret-that-is-long-enough-to-pass-validation',
};
const resolve = (env: Record<string, string> = {}) =>
  resolveAuthSettings(config.load({ ...BASE, ...env }));
const problems = (env: Record<string, string>) => {
  try {
    resolve(env);
  } catch (error) {
    if (error instanceof ConfigError) return error.message;
    throw error;
  }
  throw new Error('expected a ConfigError');
};

describe('the authentication settings', () => {
  it('default to an eight-character policy with no required classes, on core’s own host', () => {
    expect(resolve()).toMatchObject({
      baseUrl: 'https://core.example.com',
      trustedOrigins: [],
      trustedProxies: [],
      cookieDomain: undefined,
      secureCookies: true,
      passwordPolicy: {
        minLength: 8,
        maxLength: 128,
        requireUppercase: false,
        requireLowercase: false,
        requireNumber: false,
        requireSymbol: false,
      },
    });
  });

  it('read the password policy from the environment', () => {
    expect(
      resolve({
        SV_AUTH_PASSWORD_MIN_LENGTH: '14',
        SV_AUTH_PASSWORD_REQUIRE_UPPERCASE: 'true',
        SV_AUTH_PASSWORD_REQUIRE_LOWERCASE: 'true',
        SV_AUTH_PASSWORD_REQUIRE_NUMBER: 'true',
        SV_AUTH_PASSWORD_REQUIRE_SYMBOL: 'true',
      }).passwordPolicy,
    ).toMatchObject({
      minLength: 14,
      requireUppercase: true,
      requireLowercase: true,
      requireNumber: true,
      requireSymbol: true,
    });
  });

  it('use secure cookies exactly when core is served over https', () => {
    expect(resolve().secureCookies).toBe(true);
    expect(resolve({ SV_URL: 'http://localhost:3000' }).secureCookies).toBe(false);
  });

  it('refuse a minimum length of 0 or beyond the longest password', () => {
    expect(problems({ SV_AUTH_PASSWORD_MIN_LENGTH: '0' })).toContain('SV_AUTH_PASSWORD_MIN_LENGTH');
    expect(problems({ SV_AUTH_PASSWORD_MIN_LENGTH: '129' })).toContain(
      'SV_AUTH_PASSWORD_MIN_LENGTH',
    );
  });

  describe('trusted origins', () => {
    it('accept origins and normalise them', () => {
      expect(
        resolve({ SV_AUTH_TRUSTED_ORIGINS: 'https://app.example.com, http://localhost:4000/' })
          .trustedOrigins,
      ).toEqual(['https://app.example.com', 'http://localhost:4000']);
    });

    it.each([
      'app.example.com',
      'https://app.example.com/path',
      'https://app.example.com?x=1',
      'ftp://app.example.com',
      'https://user:pw@app.example.com',
    ])('refuse %s, and never print it', (entry) => {
      const message = problems({ SV_AUTH_TRUSTED_ORIGINS: entry });
      expect(message).toContain('SV_AUTH_TRUSTED_ORIGINS entry 1 must be an origin');
      expect(message).not.toContain('pw@');
    });
  });

  describe('trusted proxies', () => {
    it('accept addresses and ranges of both families', () => {
      expect(
        resolve({ SV_AUTH_TRUSTED_PROXIES: '10.0.0.0/8, 192.0.2.7, 2001:db8::/32, ::1' })
          .trustedProxies,
      ).toEqual(['10.0.0.0/8', '192.0.2.7', '2001:db8::/32', '::1']);
    });

    it.each(['proxy.example.com', '10.0.0.0/33', '10.0.0.0/', '2001:db8::/129', '10.0.0.1/8/8'])(
      'refuse %s',
      (entry) => {
        expect(problems({ SV_AUTH_TRUSTED_PROXIES: entry })).toContain(
          'SV_AUTH_TRUSTED_PROXIES entry 1',
        );
      },
    );
  });

  describe('the cookie domain', () => {
    it('is core’s own host or a parent of it', () => {
      expect(resolve({ SV_AUTH_COOKIE_DOMAIN: 'core.example.com' }).cookieDomain).toBe(
        'core.example.com',
      );
      expect(resolve({ SV_AUTH_COOKIE_DOMAIN: '.example.com' }).cookieDomain).toBe('example.com');
    });

    it('is refused when browsers would drop the cookie: another domain, a sibling, a child', () => {
      for (const domain of ['other.com', 'app.example.com', 'ample.com', 'deep.core.example.com']) {
        expect(problems({ SV_AUTH_COOKIE_DOMAIN: domain }), domain).toContain(
          'SV_AUTH_COOKIE_DOMAIN',
        );
      }
    });

    it('is refused when it is not a domain at all', () => {
      expect(problems({ SV_AUTH_COOKIE_DOMAIN: 'https://example.com' })).toContain(
        'must be a domain',
      );
      expect(problems({ SV_AUTH_COOKIE_DOMAIN: 'com' })).toContain('must be a domain');
    });
  });

  it('report every problem at once', () => {
    const message = problems({
      SV_AUTH_TRUSTED_PROXIES: 'nope',
      SV_AUTH_TRUSTED_ORIGINS: 'nope',
      SV_AUTH_COOKIE_DOMAIN: 'other.com',
    });
    expect(message).toContain('3 problems');
  });
});
